"""Pydantic models for datasets and tables."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class DatasetInfo(BaseModel):
    """Information about a BigQuery dataset."""
    dataset_id: str = Field(..., description="Dataset identifier")
    location: Optional[str] = Field(None, description="Geographic location")
    description: Optional[str] = Field(None, description="Dataset description")
    created: Optional[str] = Field(None, description="Creation timestamp")
    table_count: Optional[int] = Field(None, description="Number of tables in dataset")


class TableInfo(BaseModel):
    """Information about a BigQuery table."""
    table_id: str = Field(..., description="Table identifier")
    dataset_id: str = Field(..., description="Parent dataset ID")
    table_type: str = Field(..., description="TABLE or VIEW")
    row_count: Optional[int] = Field(None, description="Number of rows")
    size_bytes: Optional[int] = Field(None, description="Size in bytes")
    last_modified: Optional[str] = Field(None, description="Last modification time")
    description: Optional[str] = Field(None, description="Table description")


class DatasetsResponse(BaseModel):
    """Response for listing datasets."""
    project_id: str
    datasets: List[DatasetInfo]
    count: int


class TablesResponse(BaseModel):
    """Response for listing tables in a dataset."""
    project_id: str
    dataset_id: str
    tables: List[TableInfo]
    count: int


class SelectedTablesRequest(BaseModel):
    """Request for storing selected tables."""
    tables: List[str] = Field(..., description="List of fully qualified table names (dataset.table)")
