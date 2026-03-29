"""Pydantic models for file upload management."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ColumnPreview(BaseModel):
    """A column as inferred from the uploaded file."""
    name: str
    inferred_type: str = Field(description="Inferred PostgreSQL type (e.g. BIGINT, TEXT)")
    pandas_dtype: str = Field(description="Original pandas dtype")
    sample_values: List[str] = Field(default_factory=list, description="Up to 5 sample values")


class FileUploadPreviewResponse(BaseModel):
    """Response from the preview endpoint — nothing written to DB yet."""
    file_name: str
    columns: List[ColumnPreview]
    row_count: int
    detected_encoding: str


class ColumnDefinition(BaseModel):
    """A column definition for the confirm step. Allows user type overrides."""
    name: str
    type: str = Field(description="PostgreSQL type to use (e.g. BIGINT, TEXT, DOUBLE PRECISION)")


class FileUploadConfirmRequest(BaseModel):
    """Request body for confirming a file upload."""
    project_id: str
    table_name: str = Field(description="Desired table name (will be sanitized)")
    columns: List[ColumnDefinition] = Field(description="Column definitions, with any user overrides applied")
    encoding: str = "utf-8"
    delimiter: str = ","


class FileUploadConfirmResponse(BaseModel):
    """Response after a successful file upload."""
    data_source_id: str
    table_name: str
    schema_name: str
    rows_inserted: int
    file_name: str


class FileUploadDeleteResponse(BaseModel):
    """Response after deleting a file upload data source."""
    success: bool
    message: str = "File upload deleted"
