"""API endpoints for dataset and table browsing."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from models.datasets import (
    DatasetInfo,
    TableInfo,
    DatasetsResponse,
    TablesResponse,
)
from services.bigquery import BigQueryService
from api.v1.connection import get_bigquery_service


router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=DatasetsResponse)
async def list_datasets(
    bq_service: BigQueryService = Depends(get_bigquery_service)
) -> DatasetsResponse:
    """List all datasets in the connected BigQuery project.
    
    Args:
        bq_service: Injected BigQuery service.
        
    Returns:
        DatasetsResponse with list of datasets.
    """
    if bq_service.client is None:
        raise HTTPException(status_code=400, detail="Not connected to BigQuery")
    
    try:
        datasets = []
        for dataset in bq_service.client.list_datasets():
            dataset_ref = bq_service.client.get_dataset(dataset.dataset_id)
            
            # Count tables in dataset
            tables = list(bq_service.client.list_tables(dataset.dataset_id))
            table_count = len(tables)
            
            datasets.append(DatasetInfo(
                dataset_id=dataset.dataset_id,
                location=dataset_ref.location,
                description=dataset_ref.description,
                created=dataset_ref.created.isoformat() if dataset_ref.created else None,
                table_count=table_count,
            ))
        
        return DatasetsResponse(
            project_id=bq_service.project_id,
            datasets=datasets,
            count=len(datasets),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{dataset_id}/tables", response_model=TablesResponse)
async def list_tables(
    dataset_id: str,
    bq_service: BigQueryService = Depends(get_bigquery_service)
) -> TablesResponse:
    """List all tables in a specific dataset.
    
    Args:
        dataset_id: The dataset identifier.
        bq_service: Injected BigQuery service.
        
    Returns:
        TablesResponse with list of tables.
    """
    if bq_service.client is None:
        raise HTTPException(status_code=400, detail="Not connected to BigQuery")
    
    try:
        tables = []
        for table in bq_service.client.list_tables(dataset_id):
            # Get full table metadata
            table_ref = bq_service.client.get_table(f"{dataset_id}.{table.table_id}")
            
            tables.append(TableInfo(
                table_id=table.table_id,
                dataset_id=dataset_id,
                table_type=table_ref.table_type,
                row_count=table_ref.num_rows,
                size_bytes=table_ref.num_bytes,
                last_modified=table_ref.modified.isoformat() if table_ref.modified else None,
                description=table_ref.description,
            ))
        
        return TablesResponse(
            project_id=bq_service.project_id,
            dataset_id=dataset_id,
            tables=tables,
            count=len(tables),
        )
    except Exception as e:
        if "Not found" in str(e):
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")
        raise HTTPException(status_code=500, detail=str(e))
