"""API endpoints for semantic layer generation."""
from __future__ import annotations

import json
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse

from google.api_core.exceptions import ResourceExhausted, TooManyRequests
from models.semantic import GenerateRequest, SemanticModel, StreamEvent, RelationshipRequest
from services.semantic_agent import SemanticAgentService
from services.relationship_agent import RelationshipAgentService
from services.connection_manager import ConnectionManager
from api.v1.connection import get_connection_manager, get_supabase
from middleware.clerk_auth import ClerkUser, get_current_user

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/semantic", tags=["semantic"])

# Relationship agent is stateless — one instance is fine
_relationship_agent: Optional[RelationshipAgentService] = None


def get_relationship_agent() -> RelationshipAgentService:
    """Get or create the relationship agent service."""
    global _relationship_agent
    if _relationship_agent is None:
        _relationship_agent = RelationshipAgentService()
    return _relationship_agent


@router.post("/generate")
async def generate_semantic_layer(
    request: GenerateRequest,
    data_source_id: str = Query(..., description="Data source ID to connect to"),
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
    relationship_agent: RelationshipAgentService = Depends(get_relationship_agent),
):
    """
    Generate semantic layer for selected tables with relationship detection.

    Runs two agents sequentially:
    1. Semantic Agent: Analyzes tables and classifies columns
    2. Relationship Agent: Detects foreign key relationships

    Returns an SSE stream of agent thinking and results.

    Args:
        request: GenerateRequest with list of table IDs (schema.table format)
        data_source_id: The data source connection to use
        relationship_agent: Injected relationship agent service

    Returns:
        StreamingResponse with SSE events
    """
    if not request.tables:
        raise HTTPException(status_code=400, detail="No tables provided")

    # Deduct 3 credits for semantic layer generation
    from services.billing import CreditService
    credit_service = CreditService(supabase)
    await credit_service.deduct_credits(
        user.user_id, cost=3, action="semantic_generation",
    )

    # Get the provider for this data source — creates a fresh agent per request
    try:
        provider = await conn_mgr.get_provider(data_source_id, supabase)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    semantic_agent = SemanticAgentService(provider)
    
    async def event_stream():
        """Generate SSE events from both agents."""
        semantic_model = None
        success = False

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
            success = True

        except (ResourceExhausted, TooManyRequests):
            error_event = {"type": "error", "content": "Atlas is experiencing high demand right now. Your credits have been refunded — please try again in a moment."}
            yield f"data: {json.dumps(error_event)}\n\n"
        except Exception as e:
            error_event = {"type": "error", "content": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"
        finally:
            if not success:
                try:
                    await credit_service.refund_credits(
                        user.user_id, cost=3, action="semantic_generation",
                    )
                except Exception as refund_err:
                    print(f"Warning: credit refund failed: {refund_err}")
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/model")
async def get_project_model(
    project_id: str = Query(..., description="Project ID"),
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Get the semantic model for a project.

    Returns the most recently updated model or 404 if none exists.
    """
    try:
        result = (
            supabase.table("semantic_models")
            .select("id, project_id, name, description, model, source_type, table_count, created_at, updated_at")
            .eq("project_id", project_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="No semantic model found for this project")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to load semantic model: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/model")
async def save_project_model(
    body: dict,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Save or update the semantic model for a project.

    If a model already exists for the project, it updates it.
    Otherwise creates a new one.
    """
    project_id = body.get("project_id")
    model_data = body.get("model")
    if not project_id or not model_data:
        raise HTTPException(status_code=400, detail="project_id and model are required")

    table_count = len(model_data.get("tables", []))

    try:
        # Check if a model already exists for this project
        existing = (
            supabase.table("semantic_models")
            .select("id")
            .eq("project_id", project_id)
            .limit(1)
            .execute()
        )

        if existing.data:
            # Update existing model
            model_id = existing.data[0]["id"]
            result = (
                supabase.table("semantic_models")
                .update({
                    "model": model_data,
                    "table_count": table_count,
                    "source_type": "postgres",
                })
                .eq("id", model_id)
                .execute()
            )
            return {"id": model_id, "status": "updated"}
        else:
            # Insert new model
            result = (
                supabase.table("semantic_models")
                .insert({
                    "project_id": project_id,
                    "name": f"Semantic Layer ({table_count} tables)",
                    "model": model_data,
                    "source_type": "postgres",
                    "table_count": table_count,
                    "created_by": user.user_id,
                })
                .execute()
            )
            new_id = result.data[0]["id"] if result.data else None
            return {"id": new_id, "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to save semantic model: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/detect-relationships")
async def detect_relationships(
    request: RelationshipRequest,
    user: ClerkUser = Depends(get_current_user),
    agent: RelationshipAgentService = Depends(get_relationship_agent),
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

