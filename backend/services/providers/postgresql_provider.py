"""
PostgreSQL warehouse provider.

Implements the WarehouseProvider protocol using asyncpg for all
database operations. Manages a lazy-initialized connection pool.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal
from typing import Any, Optional

import asyncpg


class PostgreSQLProvider:
    """PostgreSQL implementation of the WarehouseProvider protocol."""

    def __init__(
        self,
        *,
        connection_string: Optional[str] = None,
        host: Optional[str] = None,
        port: int = 5432,
        database: str = "postgres",
        user: Optional[str] = None,
        password: Optional[str] = None,
        schema: str = "public",
    ):
        if connection_string:
            self._dsn = connection_string
        else:
            self._dsn = self._build_dsn(host, port, database, user, password)

        self.default_schema = schema
        self._pool: Optional[asyncpg.Pool] = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_dsn(
        host: Optional[str],
        port: int,
        database: str,
        user: Optional[str],
        password: Optional[str],
    ) -> str:
        """Build a PostgreSQL DSN from individual parameters."""
        user_part = ""
        if user:
            user_part = user
            if password:
                user_part += f":{password}"
            user_part += "@"
        return f"postgresql://{user_part}{host}:{port}/{database}"

    async def _get_pool(self) -> asyncpg.Pool:
        """Return the connection pool, creating it lazily if needed."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self._dsn,
                min_size=1,
                max_size=5,
            )
        return self._pool

    @staticmethod
    def _serialize_value(value: Any) -> Any:
        """Convert PostgreSQL-specific types to JSON-safe Python types."""
        if value is None:
            return None
        if isinstance(value, Decimal):
            # Use float for decimals; keeps numeric precision reasonable for JSON
            return float(value)
        if isinstance(value, datetime.datetime):
            return value.isoformat()
        if isinstance(value, datetime.date):
            return value.isoformat()
        if isinstance(value, datetime.time):
            return value.isoformat()
        if isinstance(value, datetime.timedelta):
            return str(value)
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, (list, tuple)):
            return [PostgreSQLProvider._serialize_value(v) for v in value]
        if isinstance(value, dict):
            return {k: PostgreSQLProvider._serialize_value(v) for k, v in value.items()}
        if isinstance(value, memoryview):
            return bytes(value).hex()
        if isinstance(value, bytes):
            return value.hex()
        return value

    @staticmethod
    def _record_to_dict(record: asyncpg.Record) -> dict:
        """Convert an asyncpg Record to a JSON-safe dict."""
        return {
            key: PostgreSQLProvider._serialize_value(record[key])
            for key in record.keys()
        }

    # ------------------------------------------------------------------
    # WarehouseProvider protocol methods
    # ------------------------------------------------------------------

    async def test_connection(self) -> tuple[bool, str]:
        """Test if the connection is valid."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            # Extract database name from the pool for the message
            database = self._dsn.rsplit("/", 1)[-1].split("?")[0] if "/" in self._dsn else "postgres"
            return True, f"Connected to {database}"
        except Exception as e:
            return False, str(e)

    async def list_schemas(self) -> list[dict]:
        """List available schemas, excluding internal PostgreSQL schemas."""
        query = """
            SELECT schema_name, ''::text AS description
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
              AND schema_name NOT LIKE 'pg_%'
            ORDER BY schema_name
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query)
        return [{"name": r["schema_name"], "description": r["description"]} for r in rows]

    async def list_tables(self, schema: str) -> list[dict]:
        """List tables in a schema with estimated row counts."""
        query = """
            SELECT
                t.table_name,
                t.table_schema,
                t.table_type,
                COALESCE(c.reltuples, 0)::bigint AS row_count_estimate
            FROM information_schema.tables t
            LEFT JOIN pg_catalog.pg_class c
                ON c.relname = t.table_name
            LEFT JOIN pg_catalog.pg_namespace n
                ON n.oid = c.relnamespace
                AND n.nspname = t.table_schema
            WHERE t.table_schema = $1
            ORDER BY t.table_name
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, schema)
        return [
            {
                "name": r["table_name"],
                "schema": r["table_schema"],
                "row_count": max(int(r["row_count_estimate"]), 0),
                "table_type": r["table_type"],
            }
            for r in rows
        ]

    async def get_table_schema(self, schema: str, table: str) -> dict:
        """Get column definitions for a table."""
        query = """
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default,
                character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = $2
            ORDER BY ordinal_position
        """
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, schema, table)
        columns = [
            {
                "name": r["column_name"],
                "type": r["data_type"].upper(),
                "nullable": r["is_nullable"] == "YES",
                "default": r["column_default"],
                "max_length": r["character_maximum_length"],
                "description": "",
            }
            for r in rows
        ]
        return {"columns": columns}

    async def execute_query(self, sql: str) -> list[dict]:
        """Execute a read-only SQL query and return rows as dicts."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql)
        return [self._record_to_dict(r) for r in rows]

    def get_sql_dialect(self) -> str:
        """Return the SQL dialect name."""
        return "postgresql"

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Close the connection pool and release resources."""
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
