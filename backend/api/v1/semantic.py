"""API endpoints for semantic layer generation."""
from __future__ import annotations

import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from models.semantic import GenerateRequest, SemanticModel, StreamEvent, RelationshipRequest
from services.bigquery import BigQueryService
from services.semantic_agent import SemanticAgentService
from services.relationship_agent import RelationshipAgentService
from api.v1.connection import get_bigquery_service


router = APIRouter(prefix="/semantic", tags=["semantic"])

# Global semantic agent instance (initialized on first use)
_semantic_agent: Optional[SemanticAgentService] = None
_relationship_agent: Optional[RelationshipAgentService] = None


def get_semantic_agent(
    bq_service: BigQueryService = Depends(get_bigquery_service)
) -> SemanticAgentService:
    """Get or create the semantic agent service."""
    global _semantic_agent
    if _semantic_agent is None:
        _semantic_agent = SemanticAgentService(bq_service)
    return _semantic_agent


def get_relationship_agent() -> RelationshipAgentService:
    """Get or create the relationship agent service."""
    global _relationship_agent
    if _relationship_agent is None:
        _relationship_agent = RelationshipAgentService()
    return _relationship_agent


@router.post("/generate")
async def generate_semantic_layer(
    request: GenerateRequest,
    semantic_agent: SemanticAgentService = Depends(get_semantic_agent),
    relationship_agent: RelationshipAgentService = Depends(get_relationship_agent)
):
    """
    Generate semantic layer for selected tables with relationship detection.
    
    Runs two agents sequentially:
    1. Semantic Agent: Analyzes tables and classifies columns
    2. Relationship Agent: Detects foreign key relationships
    
    Returns an SSE stream of agent thinking and results.
    
    Args:
        request: GenerateRequest with list of table IDs
        semantic_agent: Injected semantic agent service
        relationship_agent: Injected relationship agent service
        
    Returns:
        StreamingResponse with SSE events
    """
    if not request.tables:
        raise HTTPException(status_code=400, detail="No tables provided")
    
    async def event_stream():
        """Generate SSE events from both agents."""
        semantic_model = None
        
        try:
            # Phase 1: Semantic Layer Generation
            phase_event = {"type": "phase", "content": "🚀 Phase 1: Analyzing tables and classifying columns..."}
            yield f"data: {json.dumps(phase_event)}\n\n"
            
            async for event in semantic_agent.generate_semantic_layer(request.tables):
                # Capture the model data for the relationship agent
                if event.get("type") == "model":
                    semantic_model = event.get("data", {})
                
                # Forward all events to the stream
                yield f"data: {json.dumps(event)}\n\n"
            
            # Phase 2: Relationship Detection (only if we have model data)
            if semantic_model and semantic_model.get("tables"):
                phase_event = {"type": "phase", "content": "🔗 Phase 2: Detecting relationships between tables..."}
                yield f"data: {json.dumps(phase_event)}\n\n"
                
                async for event in relationship_agent.detect_relationships(semantic_model):
                    yield f"data: {json.dumps(event)}\n\n"
            else:
                skip_event = {"type": "status", "content": "⚠️ Skipping relationship detection - no table data available"}
                yield f"data: {json.dumps(skip_event)}\n\n"
            
            # Final completion
            complete_event = {"type": "complete", "content": "✅ Semantic layer generation complete!"}
            yield f"data: {json.dumps(complete_event)}\n\n"
            
        except Exception as e:
            error_event = {"type": "error", "content": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/models")
async def list_semantic_models() -> List[SemanticModel]:
    """
    List all saved semantic models.
    
    Returns:
        List of semantic models.
    """
    # TODO: Implement persistence
    # For MVP, return empty list
    return []


@router.get("/models/{model_id}")
async def get_semantic_model(model_id: str) -> SemanticModel:
    """
    Get a specific semantic model by ID.
    
    Args:
        model_id: The model identifier.
        
    Returns:
        The semantic model.
    """
    # TODO: Implement persistence
    raise HTTPException(status_code=404, detail="Model not found")


@router.delete("/models/{model_id}")
async def delete_semantic_model(model_id: str):
    """
    Delete a semantic model.
    
    Args:
        model_id: The model identifier.
    """
    # TODO: Implement persistence
    raise HTTPException(status_code=404, detail="Model not found")


@router.post("/detect-relationships")
async def detect_relationships(
    request: RelationshipRequest,
    agent: RelationshipAgentService = Depends(get_relationship_agent)
):
    """
    Detect foreign key relationships between tables using LLM reasoning.
    
    This endpoint takes semantic layer table definitions and uses an LLM agent
    to intelligently detect relationships based on naming patterns, data types,
    and database conventions.
    
    Args:
        request: RelationshipRequest with table schemas
        agent: Injected relationship agent service
        
    Returns:
        StreamingResponse with SSE events containing analysis and detected relationships
    """
    if not request.tables:
        raise HTTPException(status_code=400, detail="No tables provided")
    
    async def event_stream():
        """Generate SSE events from relationship agent stream."""
        try:
            semantic_model = {"tables": request.tables}
            async for event in agent.detect_relationships(semantic_model):
                data = json.dumps(event)
                yield f"data: {data}\n\n"
        except Exception as e:
            error_event = {"type": "error", "content": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

