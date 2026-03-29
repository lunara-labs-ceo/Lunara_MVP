"""API endpoints for file upload data sources.

Provides preview, confirm, and delete operations for CSV file uploads.
Files are parsed and loaded into the Supabase `uploads` schema as
Postgres tables. Each endpoint requires Clerk JWT authentication.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from middleware.clerk_auth import ClerkUser, get_current_user
from models.upload import (
    ColumnDefinition,
    FileUploadConfirmResponse,
    FileUploadDeleteResponse,
    FileUploadPreviewResponse,
)
from services.upload_service import UploadService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])


# ---------------------------------------------------------------------------
# Dependency stubs — overridden in main.py via dependency_overrides
# ---------------------------------------------------------------------------


def get_upload_service() -> UploadService:
    """Dependency to get the UploadService singleton.

    Overridden in main.py at startup.
    """
    raise NotImplementedError("UploadService not initialized")


def get_supabase():
    """Dependency to get the Supabase admin client.

    Overridden in main.py at startup.
    """
    raise NotImplementedError("Supabase client not initialized")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/preview", response_model=FileUploadPreviewResponse)
async def preview_upload(
    file: UploadFile = File(...),
    delimiter: str = Form(","),
    encoding: Optional[str] = Form(None),
    user: ClerkUser = Depends(get_current_user),
) -> FileUploadPreviewResponse:
    """Parse a CSV file and return a schema preview.

    Nothing is written to the database. The frontend uses this to show
    the user inferred column types before committing.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty.")

    try:
        upload_service = UploadService.__new__(UploadService)
        preview = UploadService.preview(
            upload_service,
            file_bytes=file_bytes,
            delimiter=delimiter,
            encoding=encoding,
        )
    except Exception as e:
        logger.error("Failed to parse file %s: %s", file.filename, e)
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    return FileUploadPreviewResponse(
        file_name=file.filename,
        columns=preview["columns"],
        row_count=preview["row_count"],
        detected_encoding=preview["detected_encoding"],
    )


@router.post("/confirm", response_model=FileUploadConfirmResponse)
async def confirm_upload(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    table_name: str = Form(...),
    columns_json: str = Form(..., description="JSON array of {name, type} objects"),
    encoding: str = Form("utf-8"),
    delimiter: str = Form(","),
    user: ClerkUser = Depends(get_current_user),
    upload_service: UploadService = Depends(get_upload_service),
    supabase=Depends(get_supabase),
) -> FileUploadConfirmResponse:
    """Confirm a file upload: create the table, insert rows, register as data source.

    The file must be re-uploaded (not cached from preview). The columns_json
    parameter allows the user to override inferred types from the preview step.
    """
    import json

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty.")

    # Parse columns from JSON string (multipart forms can't send nested objects)
    try:
        columns_raw = json.loads(columns_json)
        columns = [ColumnDefinition(**col) for col in columns_raw]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid columns_json: {e}")

    # Sanitize table name
    safe_table_name = UploadService.sanitize_table_name(table_name)

    # Parse to get row count for limit check
    try:
        df = UploadService.parse_csv(file_bytes, encoding=encoding, delimiter=delimiter)
        row_count = len(df)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    # Check tier limits
    tier = "free"  # TODO: resolve from user's subscription
    limit_error = await upload_service.check_limits(
        project_id=project_id,
        org_id=user.org_id or "",
        file_size_bytes=len(file_bytes),
        row_count=row_count,
        tier=tier,
        supabase_client=supabase,
    )
    if limit_error:
        raise HTTPException(status_code=403, detail=limit_error)

    # Create table and insert rows
    try:
        rows_inserted = await upload_service.create_and_populate_table(
            table_name=safe_table_name,
            columns=[col.model_dump() for col in columns],
            file_bytes=file_bytes,
            encoding=encoding,
            delimiter=delimiter,
        )
    except Exception as e:
        logger.error("Failed to create table %s: %s", safe_table_name, e)
        raise HTTPException(status_code=500, detail=f"Failed to upload data: {e}")

    # Register as a data source in Supabase
    try:
        ds_result = (
            supabase.table("data_sources")
            .insert({
                "project_id": project_id,
                "type": "file_upload",
                "name": file.filename,
                "config": {
                    "schema": "uploads",
                    "table": safe_table_name,
                    "original_file_name": file.filename,
                    "row_count": rows_inserted,
                },
                "status": "connected",
                "user_id": user.user_id,
            })
            .execute()
        )
        data_source_id = ds_result.data[0]["id"]

        # Create uploaded_files record
        supabase.table("uploaded_files").insert({
            "data_source_id": data_source_id,
            "project_id": project_id,
            "original_file_name": file.filename,
            "file_type": "csv",
            "target_schema": "uploads",
            "target_table": safe_table_name,
            "row_count": rows_inserted,
            "file_size_bytes": len(file_bytes),
            "upload_status": "completed",
        }).execute()

    except Exception as e:
        # Rollback: drop the table we just created
        logger.error("Failed to register data source: %s — rolling back table", e)
        try:
            await upload_service.drop_table(safe_table_name)
        except Exception:
            logger.exception("Failed to rollback table %s", safe_table_name)
        raise HTTPException(status_code=500, detail=f"Failed to register upload: {e}")

    return FileUploadConfirmResponse(
        data_source_id=data_source_id,
        table_name=safe_table_name,
        schema_name="uploads",
        rows_inserted=rows_inserted,
        file_name=file.filename,
    )


@router.delete("/{data_source_id}", response_model=FileUploadDeleteResponse)
async def delete_upload(
    data_source_id: str,
    user: ClerkUser = Depends(get_current_user),
    upload_service: UploadService = Depends(get_upload_service),
    supabase=Depends(get_supabase),
) -> FileUploadDeleteResponse:
    """Delete a file upload data source.

    Drops the underlying Postgres table and removes all related records
    from data_sources and uploaded_files.
    """
    # Look up the uploaded_files record to get the table name
    try:
        result = (
            supabase.table("uploaded_files")
            .select("target_table")
            .eq("data_source_id", data_source_id)
            .maybe_single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Upload not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    table_name = result.data["target_table"]

    # Drop the Postgres table
    try:
        await upload_service.drop_table(table_name)
    except Exception as e:
        logger.error("Failed to drop table %s: %s", table_name, e)
        # Continue with cleanup even if drop fails

    # Delete records (uploaded_files cascades from data_sources)
    try:
        supabase.table("data_sources").delete().eq("id", data_source_id).execute()
    except Exception as e:
        logger.error("Failed to delete data source %s: %s", data_source_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to delete upload: {e}")

    return FileUploadDeleteResponse(success=True)
