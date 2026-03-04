"""API endpoints for schema / table / column browsing.

Replaces the BigQuery dataset browser with a generic schema browser that
works with any WarehouseProvider (currently PostgreSQL).  Each endpoint
loads a provider via the ConnectionManager and delegates to the provider's
protocol methods.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from middleware.clerk_auth import ClerkUser, get_current_user
from models.datasets import (
    ColumnInfo,
    ColumnsResponse,
    SchemaInfo,
    SchemasResponse,
    TableInfo,
    TablesResponse,
)
from services.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schemas", tags=["schemas"])


# ---------------------------------------------------------------------------
# Dependency stubs — overridden in main.py via dependency_overrides
# ---------------------------------------------------------------------------


def get_connection_manager() -> ConnectionManager:
    """Dependency to get the ConnectionManager singleton.

    Overridden in main.py at startup.
    """
    raise NotImplementedError("ConnectionManager not initialized")


def get_supabase():
    """Dependency to get the Supabase admin client.

    Overridden in main.py at startup.
    """
    raise NotImplementedError("Supabase client not initialized")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{connection_id}/schemas", response_model=SchemasResponse)
async def list_schemas(
    connection_id: str,
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
) -> SchemasResponse:
    """List all schemas in the connected database.

    Excludes internal PostgreSQL schemas (pg_catalog, information_schema, etc.).
    """
    try:
        provider = await conn_mgr.get_provider(connection_id, supabase)
        schemas_raw = await provider.list_schemas()

        schemas = [SchemaInfo(**s) for s in schemas_raw]
        return SchemasResponse(
            connection_id=connection_id,
            schemas=schemas,
            count=len(schemas),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to list schemas for %s: %s", connection_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to list schemas: {e}")


@router.get("/{connection_id}/schemas/{schema_name}/tables", response_model=TablesResponse)
async def list_tables(
    connection_id: str,
    schema_name: str,
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
) -> TablesResponse:
    """List all tables and views in a specific schema."""
    try:
        provider = await conn_mgr.get_provider(connection_id, supabase)
        tables_raw = await provider.list_tables(schema_name)

        tables = [TableInfo(**t) for t in tables_raw]
        return TablesResponse(
            connection_id=connection_id,
            schema_name=schema_name,
            tables=tables,
            count=len(tables),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to list tables for %s/%s: %s", connection_id, schema_name, e)
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {e}")


@router.get(
    "/{connection_id}/tables/{schema_name}/{table_name}/columns",
    response_model=ColumnsResponse,
)
async def get_table_columns(
    connection_id: str,
    schema_name: str,
    table_name: str,
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
) -> ColumnsResponse:
    """Get column definitions for a specific table."""
    try:
        provider = await conn_mgr.get_provider(connection_id, supabase)
        result = await provider.get_table_schema(schema_name, table_name)

        columns = [ColumnInfo(**c) for c in result.get("columns", [])]
        return ColumnsResponse(
            connection_id=connection_id,
            schema_name=schema_name,
            table_name=table_name,
            columns=columns,
            count=len(columns),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(
            "Failed to get columns for %s/%s.%s: %s",
            connection_id,
            schema_name,
            table_name,
            e,
        )
        raise HTTPException(status_code=500, detail=f"Failed to get columns: {e}")
