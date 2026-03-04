"""Pydantic models for PostgreSQL connection management."""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from enum import Enum


class ConnectionStatus(str, Enum):
    """Status of a data warehouse connection."""
    PENDING = "pending"
    CONNECTED = "connected"
    ERROR = "error"
    DISCONNECTED = "disconnected"


class CreateConnectionRequest(BaseModel):
    """Request body for creating a new PostgreSQL connection.

    Must provide either ``connection_string`` **or** at least ``host`` + ``password``.
    """
    name: str = Field(..., description="Human-readable name for this connection")
    connection_string: Optional[str] = Field(None, description="Full PostgreSQL connection string")
    host: Optional[str] = Field(None, description="Database host")
    port: Optional[int] = Field(5432, description="Database port")
    database: Optional[str] = Field("postgres", description="Database name")
    username: Optional[str] = Field(None, description="Database user")
    password: Optional[str] = Field(None, description="Database password")
    schema_name: Optional[str] = Field("public", description="Default schema")

    @model_validator(mode="after")
    def validate_credentials(self):
        if not self.connection_string and not (self.host and self.password):
            raise ValueError(
                "Either 'connection_string' or at least 'host' + 'password' must be provided"
            )
        return self


class DataSourceRecord(BaseModel):
    """A data source record as stored in Supabase (safe to return -- no encrypted creds)."""
    id: str
    project_id: str
    type: str
    name: str
    config: Optional[dict] = None
    status: ConnectionStatus
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ConnectionStatusResponse(BaseModel):
    """Response for checking connection health."""
    status: ConnectionStatus
    message: str


class DeleteConnectionResponse(BaseModel):
    """Response after deleting a connection."""
    success: bool
    message: str = "Connection deleted"
