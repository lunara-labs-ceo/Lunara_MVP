"""Pydantic models for schema / table / column browsing."""
from pydantic import BaseModel, Field
from typing import Optional, List


class SchemaInfo(BaseModel):
    """Information about a database schema."""
    name: str = Field(..., description="Schema name")
    description: Optional[str] = Field(None, description="Schema description")


class TableInfo(BaseModel):
    """Information about a database table."""
    name: str = Field(..., description="Table name")
    schema_name: str = Field(..., alias="schema", description="Parent schema name")
    table_type: str = Field(..., description="BASE TABLE or VIEW")
    row_count: Optional[int] = Field(None, description="Estimated row count")

    model_config = {"populate_by_name": True}


class ColumnInfo(BaseModel):
    """Information about a table column."""
    name: str = Field(..., description="Column name")
    type: str = Field(..., description="Data type (e.g. INTEGER, TEXT)")
    nullable: bool = Field(..., description="Whether the column is nullable")
    default: Optional[str] = Field(None, description="Default value expression")
    max_length: Optional[int] = Field(None, description="Max character length")
    description: Optional[str] = Field(None, description="Column description")


class SchemasResponse(BaseModel):
    """Response for listing schemas."""
    connection_id: str
    schemas: List[SchemaInfo]
    count: int


class TablesResponse(BaseModel):
    """Response for listing tables in a schema."""
    connection_id: str
    schema_name: str
    tables: List[TableInfo]
    count: int


class ColumnsResponse(BaseModel):
    """Response for listing columns of a table."""
    connection_id: str
    schema_name: str
    table_name: str
    columns: List[ColumnInfo]
    count: int
