"""API endpoints for PostgreSQL connection management.

Provides CRUD operations for data source connections.  Credentials are
encrypted at rest with Fernet and stored in the Supabase ``data_sources``
table.  Each endpoint requires Clerk JWT authentication.
"""
from __future__ import annotations

import json
import logging
import os
from typing import List

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, Query

from middleware.clerk_auth import ClerkUser, get_current_user
from models.connection import (
    ConnectionStatus,
    ConnectionStatusResponse,
    CreateConnectionRequest,
    DataSourceRecord,
    DeleteConnectionResponse,
)
from services.connection_manager import ConnectionManager
from services.warehouse_provider import create_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections", tags=["connections"])


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


def get_fernet() -> Fernet:
    """Dependency to get the Fernet encryptor.

    Overridden in main.py at startup.
    """
    raise NotImplementedError("Fernet not initialized")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=DataSourceRecord)
async def create_connection(
    request: CreateConnectionRequest,
    project_id: str = Query(..., description="Project ID to associate the connection with"),
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
    fernet: Fernet = Depends(get_fernet),
) -> DataSourceRecord:
    """Create a new PostgreSQL data source connection.

    Encrypts credentials, stores them in Supabase, tests the connection,
    and updates the status accordingly.
    """
    # Build credentials dict (what gets encrypted)
    if request.connection_string:
        credentials = {"connection_string": request.connection_string}
    else:
        credentials = {
            "host": request.host,
            "port": request.port,
            "database": request.database,
            "username": request.username,
            "password": request.password,
        }

    # Build config dict (stored unencrypted for UI display)
    config = {
        "host": request.host or "(from connection string)",
        "port": request.port or 5432,
        "database": request.database or "postgres",
        "schema": request.schema_name or "public",
    }

    # Encrypt credentials
    encrypted = fernet.encrypt(json.dumps(credentials).encode()).decode()

    # Insert into Supabase
    try:
        insert_result = (
            supabase.table("data_sources")
            .insert(
                {
                    "project_id": project_id,
                    "type": "postgres",
                    "name": request.name,
                    "config": config,
                    "credentials_encrypted": encrypted,
                    "status": ConnectionStatus.PENDING.value,
                    "user_id": user.user_id,
                }
            )
            .execute()
        )
        row = insert_result.data[0] if insert_result.data else None
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create data source record")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to insert data source: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    data_source_id = row["id"]

    # Test connection
    try:
        provider = create_provider("postgres", credentials, config)
        success, message = await provider.test_connection()

        new_status = ConnectionStatus.CONNECTED if success else ConnectionStatus.ERROR
        supabase.table("data_sources").update(
            {"status": new_status.value}
        ).eq("id", data_source_id).execute()

        if not success:
            logger.warning("Connection test failed for %s: %s", data_source_id, message)
    except Exception as e:
        logger.error("Connection test error for %s: %s", data_source_id, e)
        new_status = ConnectionStatus.ERROR
        supabase.table("data_sources").update(
            {"status": ConnectionStatus.ERROR.value}
        ).eq("id", data_source_id).execute()

    # Re-fetch the row to get the updated status + timestamps
    final = (
        supabase.table("data_sources")
        .select("id, project_id, type, name, config, status, created_at, updated_at")
        .eq("id", data_source_id)
        .single()
        .execute()
    )

    return DataSourceRecord(**final.data)


@router.get("", response_model=List[DataSourceRecord])
async def list_connections(
    project_id: str = Query(..., description="Project ID"),
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
) -> List[DataSourceRecord]:
    """List all data source connections for a project.

    Credentials are **never** returned in the response.
    """
    try:
        result = (
            supabase.table("data_sources")
            .select("id, project_id, type, name, config, status, created_at, updated_at")
            .eq("project_id", project_id)
            .execute()
        )
        return [DataSourceRecord(**row) for row in (result.data or [])]
    except Exception as e:
        logger.error("Failed to list connections: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/{connection_id}/status", response_model=ConnectionStatusResponse)
async def check_connection_status(
    connection_id: str,
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
) -> ConnectionStatusResponse:
    """Test a connection and return its current health status.

    Loads the provider via ConnectionManager, runs ``test_connection()``,
    and updates the status in Supabase.
    """
    try:
        provider = await conn_mgr.get_provider(connection_id, supabase)
        success, message = await provider.test_connection()

        new_status = ConnectionStatus.CONNECTED if success else ConnectionStatus.ERROR
        supabase.table("data_sources").update(
            {"status": new_status.value}
        ).eq("id", connection_id).execute()

        return ConnectionStatusResponse(status=new_status, message=message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Status check failed for %s: %s", connection_id, e)
        # Update status to error in DB
        try:
            supabase.table("data_sources").update(
                {"status": ConnectionStatus.ERROR.value}
            ).eq("id", connection_id).execute()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Connection test failed: {e}")


@router.delete("/{connection_id}", response_model=DeleteConnectionResponse)
async def delete_connection(
    connection_id: str,
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
) -> DeleteConnectionResponse:
    """Delete a data source connection.

    Removes the record from Supabase and evicts any cached provider from
    the ConnectionManager.
    """
    # Verify it exists
    try:
        result = (
            supabase.table("data_sources")
            .select("id")
            .eq("id", connection_id)
            .maybe_single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Connection not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    # Invalidate cached provider
    await conn_mgr.invalidate(connection_id)

    # Delete from Supabase
    try:
        supabase.table("data_sources").delete().eq("id", connection_id).execute()
    except Exception as e:
        logger.error("Failed to delete connection %s: %s", connection_id, e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return DeleteConnectionResponse(success=True)
