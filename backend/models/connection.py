"""Pydantic models for BigQuery connection."""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class ConnectionStatus(str, Enum):
    """Status of the BigQuery connection."""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    VALIDATING = "validating"


class BigQueryCredentials(BaseModel):
    """Service account credentials for BigQuery.
    
    This model accepts the full service account JSON structure.
    """
    type: str = Field(..., description="Should be 'service_account'")
    project_id: str = Field(..., description="Google Cloud project ID")
    private_key_id: str = Field(..., description="Private key ID")
    private_key: str = Field(..., description="Private key in PEM format")
    client_email: str = Field(..., description="Service account email")
    client_id: str = Field(..., description="Client ID")
    auth_uri: str = Field(default="https://accounts.google.com/o/oauth2/auth")
    token_uri: str = Field(default="https://oauth2.googleapis.com/token")
    auth_provider_x509_cert_url: str = Field(default="https://www.googleapis.com/oauth2/v1/certs")
    client_x509_cert_url: str = Field(..., description="Client certificate URL")
    universe_domain: Optional[str] = Field(default="googleapis.com")


class ConnectionRequest(BaseModel):
    """Request body for creating a BigQuery connection."""
    credentials: dict = Field(..., description="The raw service account JSON object")


class ConnectionResponse(BaseModel):
    """Response after attempting to connect to BigQuery."""
    status: ConnectionStatus
    message: str
    project_id: Optional[str] = None
    datasets_count: Optional[int] = None


class ConnectionStatusResponse(BaseModel):
    """Response for checking current connection status."""
    status: ConnectionStatus
    project_id: Optional[str] = None
    connected_at: Optional[str] = None
