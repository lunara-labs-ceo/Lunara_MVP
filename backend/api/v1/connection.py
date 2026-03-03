"""API endpoints for BigQuery connection management."""
from fastapi import APIRouter, HTTPException, Depends

from models.connection import (
    ConnectionRequest,
    ConnectionResponse,
    ConnectionStatus,
    ConnectionStatusResponse,
)
from services.bigquery import BigQueryService
from middleware.clerk_auth import ClerkUser, get_current_user


router = APIRouter(prefix="/connection", tags=["connection"])


def get_bigquery_service() -> BigQueryService:
    """Dependency to get the BigQuery service instance.
    
    This will be overridden in main.py with a proper singleton.
    """
    raise NotImplementedError("BigQuery service not initialized")


@router.post("/bigquery", response_model=ConnectionResponse)
async def connect_bigquery(
    request: ConnectionRequest,
    user: ClerkUser = Depends(get_current_user),
    bq_service: BigQueryService = Depends(get_bigquery_service),
) -> ConnectionResponse:
    """Connect to BigQuery using service account credentials.
    
    Args:
        request: The connection request containing credentials.
        bq_service: Injected BigQuery service.
        
    Returns:
        ConnectionResponse with status and connection details.
    """
    status, message, datasets_count = bq_service.validate_and_connect(request.credentials)
    
    return ConnectionResponse(
        status=status,
        message=message,
        project_id=bq_service.project_id if status == ConnectionStatus.CONNECTED else None,
        datasets_count=datasets_count
    )


@router.get("/status", response_model=ConnectionStatusResponse)
async def get_connection_status(
    user: ClerkUser = Depends(get_current_user),
    bq_service: BigQueryService = Depends(get_bigquery_service),
) -> ConnectionStatusResponse:
    """Get the current BigQuery connection status.
    
    Args:
        bq_service: Injected BigQuery service.
        
    Returns:
        ConnectionStatusResponse with current status.
    """
    status, project_id, connected_at = bq_service.get_status()
    
    return ConnectionStatusResponse(
        status=status,
        project_id=project_id,
        connected_at=connected_at
    )


@router.delete("/disconnect")
async def disconnect(
    user: ClerkUser = Depends(get_current_user),
    bq_service: BigQueryService = Depends(get_bigquery_service),
) -> dict:
    """Disconnect from BigQuery and remove stored credentials.
    
    Args:
        bq_service: Injected BigQuery service.
        
    Returns:
        Success message.
    """
    bq_service.disconnect()
    return {"message": "Disconnected successfully"}
