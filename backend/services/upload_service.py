"""
Upload service for file-based data sources.

Handles CSV parsing, type inference, and loading data into the Supabase
`uploads` schema via direct asyncpg connections. Does NOT use the
WarehouseProvider abstraction — this is a write path only.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import datetime
from typing import Any, Optional

import asyncpg
import chardet
import pandas as pd

logger = logging.getLogger(__name__)

# Tier limits
TIER_LIMITS = {
    "free": {
        "max_file_size_bytes": 10 * 1024 * 1024,  # 10 MB
        "max_rows": 50_000,
        "max_uploads_per_project": 5,
        "max_total_bytes_per_org": 50 * 1024 * 1024,  # 50 MB
    },
    "pro": {
        "max_file_size_bytes": 100 * 1024 * 1024,  # 100 MB
        "max_rows": 500_000,
        "max_uploads_per_project": 20,
        "max_total_bytes_per_org": 1024 * 1024 * 1024,  # 1 GB
    },
}

UPLOADS_SCHEMA = "uploads"

# Pandas dtype to Postgres type mapping
DTYPE_TO_PG = {
    "int64": "BIGINT",
    "int32": "INTEGER",
    "int16": "SMALLINT",
    "float64": "DOUBLE PRECISION",
    "float32": "REAL",
    "bool": "BOOLEAN",
    "datetime64[ns]": "TIMESTAMPTZ",
    "datetime64[ns, UTC]": "TIMESTAMPTZ",
    "object": "TEXT",
}


class UploadService:
    """Manages file uploads into the Supabase `uploads` schema."""

    def __init__(self, database_url: str):
        self._database_url = database_url
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self._database_url,
                min_size=1,
                max_size=5,
            )
        return self._pool

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    # ------------------------------------------------------------------
    # Schema setup
    # ------------------------------------------------------------------

    async def ensure_schema(self) -> None:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {UPLOADS_SCHEMA}")

    # ------------------------------------------------------------------
    # File parsing & preview
    # ------------------------------------------------------------------

    @staticmethod
    def detect_encoding(file_bytes: bytes) -> str:
        result = chardet.detect(file_bytes)
        return result.get("encoding") or "utf-8"

    @staticmethod
    def parse_csv(
        file_bytes: bytes,
        encoding: str = "utf-8",
        delimiter: str = ",",
    ) -> pd.DataFrame:
        return pd.read_csv(
            io.BytesIO(file_bytes),
            encoding=encoding,
            delimiter=delimiter,
            dtype_backend="numpy_nullable",
        )

    @staticmethod
    def infer_column_types(df: pd.DataFrame) -> list[dict]:
        columns = []
        for col_name in df.columns:
            dtype_str = str(df[col_name].dtype)
            pg_type = DTYPE_TO_PG.get(dtype_str, "TEXT")
            sample_values = (
                df[col_name]
                .dropna()
                .head(5)
                .astype(str)
                .tolist()
            )
            columns.append({
                "name": col_name,
                "inferred_type": pg_type,
                "pandas_dtype": dtype_str,
                "sample_values": sample_values,
            })
        return columns

    def preview(
        self,
        file_bytes: bytes,
        delimiter: str = ",",
        encoding: Optional[str] = None,
    ) -> dict:
        if encoding is None:
            encoding = self.detect_encoding(file_bytes)

        df = self.parse_csv(file_bytes, encoding=encoding, delimiter=delimiter)
        columns = self.infer_column_types(df)

        return {
            "columns": columns,
            "row_count": len(df),
            "detected_encoding": encoding,
        }

    # ------------------------------------------------------------------
    # Table name sanitization
    # ------------------------------------------------------------------

    @staticmethod
    def sanitize_table_name(file_name: str) -> str:
        name = file_name.rsplit(".", 1)[0]
        name = re.sub(r"[^a-z0-9_]", "_", name.lower())
        name = re.sub(r"_+", "_", name).strip("_")
        if not name:
            name = "uploaded_table"
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"{name}_{timestamp}"

    # ------------------------------------------------------------------
    # Limit enforcement
    # ------------------------------------------------------------------

    async def check_limits(
        self,
        project_id: str,
        org_id: str,
        file_size_bytes: int,
        row_count: int,
        tier: str,
        supabase_client: Any,
    ) -> Optional[str]:
        limits = TIER_LIMITS.get(tier, TIER_LIMITS["free"])

        if file_size_bytes > limits["max_file_size_bytes"]:
            max_mb = limits["max_file_size_bytes"] // (1024 * 1024)
            return f"File exceeds the {max_mb}MB limit for the {tier} tier."

        if row_count > limits["max_rows"]:
            return f"File has {row_count:,} rows, exceeding the {limits['max_rows']:,} row limit for the {tier} tier."

        # Check upload count for this project
        response = (
            supabase_client.table("uploaded_files")
            .select("id", count="exact")
            .eq("project_id", project_id)
            .eq("upload_status", "completed")
            .execute()
        )
        current_count = response.count or 0
        if current_count >= limits["max_uploads_per_project"]:
            return f"Project has reached the {limits['max_uploads_per_project']} upload limit for the {tier} tier."

        # Check total storage for this org
        response = (
            supabase_client.table("uploaded_files")
            .select("file_size_bytes")
            .eq("upload_status", "completed")
            .execute()
        )
        total_bytes = sum(r["file_size_bytes"] or 0 for r in (response.data or []))
        if total_bytes + file_size_bytes > limits["max_total_bytes_per_org"]:
            max_mb = limits["max_total_bytes_per_org"] // (1024 * 1024)
            return f"Organization storage limit of {max_mb}MB exceeded. Delete existing uploads or upgrade to Pro."

        return None

    # ------------------------------------------------------------------
    # Table creation & data insertion
    # ------------------------------------------------------------------

    async def create_and_populate_table(
        self,
        table_name: str,
        columns: list[dict],
        file_bytes: bytes,
        encoding: str = "utf-8",
        delimiter: str = ",",
    ) -> int:
        await self.ensure_schema()

        df = self.parse_csv(file_bytes, encoding=encoding, delimiter=delimiter)

        col_defs = ", ".join(
            f'"{col["name"]}" {col["type"]}' for col in columns
        )
        create_sql = f'CREATE TABLE {UPLOADS_SCHEMA}."{table_name}" ({col_defs})'

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(create_sql)

                if len(df) > 0:
                    col_names = [col["name"] for col in columns]
                    records = []
                    for _, row in df.iterrows():
                        record = []
                        for col in columns:
                            val = row[col["name"]]
                            if pd.isna(val):
                                record.append(None)
                            else:
                                record.append(val)
                        records.append(tuple(record))

                    placeholders = ", ".join(
                        f"${i+1}" for i in range(len(col_names))
                    )
                    quoted_cols = ", ".join(f'"{c}"' for c in col_names)
                    insert_sql = (
                        f'INSERT INTO {UPLOADS_SCHEMA}."{table_name}" '
                        f"({quoted_cols}) VALUES ({placeholders})"
                    )
                    await conn.executemany(insert_sql, records)

        logger.info(
            "Created table %s.%s with %d rows",
            UPLOADS_SCHEMA, table_name, len(df),
        )
        return len(df)

    # ------------------------------------------------------------------
    # Table cleanup
    # ------------------------------------------------------------------

    async def drop_table(self, table_name: str) -> None:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                f'DROP TABLE IF EXISTS {UPLOADS_SCHEMA}."{table_name}"'
            )
        logger.info("Dropped table %s.%s", UPLOADS_SCHEMA, table_name)
