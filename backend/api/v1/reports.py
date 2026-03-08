"""Report generation API endpoints + CRUD for sessions & items."""
from __future__ import annotations

import json
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.v1.connection import get_supabase
from middleware.clerk_auth import ClerkUser, get_current_user


router = APIRouter(prefix="/reports", tags=["reports"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ArtifactInput(BaseModel):
    """An artifact from the chat agent (saved query result)."""
    title: str
    sql: Optional[str] = None
    data: Optional[Any] = None


class GenerateRequest(BaseModel):
    """Request body for report generation."""
    prompt: str
    artifacts: List[ArtifactInput] = []
    history: List[Dict[str, Any]] = []


class SessionCreateRequest(BaseModel):
    project_id: str
    name: str = "New Chat"
    messages: Optional[List[Dict[str, Any]]] = None


class SessionUpdateRequest(BaseModel):
    name: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None


class ItemCreateRequest(BaseModel):
    report_id: str
    type: str = "html"
    title: Optional[str] = None
    content: str = ""
    position: int = 0


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/{report_id}/generate")
async def generate_content(
    report_id: str,
    request: GenerateRequest,
    user: ClerkUser = Depends(get_current_user),
):
    """Generate content using AI copilot.
    
    Streams SSE events:
    - type: 'text'         - Agent thinking/response text
    - type: 'status'       - Action being performed
    - type: 'code'         - Code being executed
    - type: 'code_result'  - Code execution output
    - type: 'chart'        - Generated chart (base64)
    - type: 'content_item' - Final content item added to report
    - type: 'done'         - Generation complete
    """
    
    # Lazy import — ReportAgentService initialises a GCP sandbox at module
    # level which can fail when Agent Engine isn't reachable.
    try:
        from services.report_agent import ReportAgentService
    except Exception as import_err:
        raise HTTPException(
            status_code=503,
            detail=f"Report agent unavailable: {import_err}",
        )

    # Convert artifact inputs to dicts for the agent
    artifacts_data = [art.model_dump() for art in request.artifacts]

    async def event_stream():
        # Create fresh service instance (NO singleton - prevents race conditions)
        try:
            agent = ReportAgentService(
                report_id=report_id,
                artifacts=artifacts_data,
            )
        except Exception as init_err:
            yield f"data: {json.dumps({'type': 'error', 'content': f'Agent init failed: {init_err}'})}\n\n"
            return

        try:
            # Stream generation events — agent emits content_item + done inline
            async for event in agent.generate_content(request.prompt, history=request.history):
                yield f"data: {json.dumps(event)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# ============================================================================
# Session CRUD
# ============================================================================

@router.get("/sessions")
async def list_sessions(
    project_id: str = Query(...),
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """List report sessions for a project, newest first."""
    result = supabase.table("report_sessions") \
        .select("*") \
        .eq("project_id", project_id) \
        .order("created_at", desc=True) \
        .execute()
    return result.data


@router.post("/sessions")
async def create_session(
    request: SessionCreateRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Create a new report session."""
    result = supabase.table("report_sessions").insert({
        "project_id": request.project_id,
        "name": request.name,
        "messages": json.dumps(request.messages or []),
        "created_by": user.user_id,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    return result.data[0]


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Get a single report session by ID."""
    result = supabase.table("report_sessions") \
        .select("*") \
        .eq("id", session_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return result.data


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: SessionUpdateRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Update a report session (name and/or messages)."""
    update_data: Dict[str, Any] = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.messages is not None:
        update_data["messages"] = json.dumps(request.messages)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    result = supabase.table("report_sessions") \
        .update(update_data) \
        .eq("id", session_id) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return result.data[0]


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Delete a report session and its items."""
    # Delete items first
    supabase.table("report_items") \
        .delete() \
        .eq("report_id", session_id) \
        .execute()
    # Delete session
    supabase.table("report_sessions") \
        .delete() \
        .eq("id", session_id) \
        .execute()
    return {"ok": True}


# ============================================================================
# Item CRUD
# ============================================================================

@router.get("/items")
async def list_items(
    report_id: str = Query(...),
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """List report items for a session, ordered by position."""
    result = supabase.table("report_items") \
        .select("*") \
        .eq("report_id", report_id) \
        .order("position") \
        .execute()
    return result.data


@router.post("/items")
async def create_item(
    request: ItemCreateRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Create a new report item."""
    result = supabase.table("report_items").insert({
        "report_id": request.report_id,
        "type": request.type,
        "title": request.title,
        "content": request.content,
        "position": request.position,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create item")
    return result.data[0]


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Delete a report item."""
    supabase.table("report_items") \
        .delete() \
        .eq("id", item_id) \
        .execute()
    return {"ok": True}
