"""Report generation API endpoints + CRUD for sessions & items.

ADK session IDs are stored in the Supabase report_sessions table and looked up
on each request so the report agent can resume multi-turn conversations natively.
"""
from __future__ import annotations

import json
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.v1.connection import get_supabase
from middleware.clerk_auth import ClerkUser, get_current_user


router = APIRouter(prefix="/reports", tags=["reports"])


def get_adk_session_service():
    """Placeholder — overridden by main.py dependency injection."""
    raise RuntimeError("ADK session service not configured")


def get_sandbox_manager():
    """Placeholder — overridden by main.py dependency injection."""
    raise RuntimeError("SandboxManager not configured")


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
    history: List[Dict[str, Any]] = []  # Kept for backward compat, ignored


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


class ItemUpdateRequest(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None
    position: Optional[int] = None


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/{report_id}/generate")
async def generate_content(
    report_id: str,
    request: GenerateRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
    session_service=Depends(get_adk_session_service),
    sandbox_manager=Depends(get_sandbox_manager),
):
    """Generate content using AI copilot.

    Streams SSE events:
    - type: 'text'         - Agent thinking/response text
    - type: 'status'       - Action being performed
    - type: 'code'         - Code being executed
    - type: 'content_item' - Final content item added to report
    - type: 'done'         - Generation complete
    """
    from services.report_agent import ReportAgentService

    # Convert artifact inputs to dicts for the agent
    artifacts_data = [art.model_dump() for art in request.artifacts]

    # Look up stored ADK session ID from Supabase
    stored_adk_session_id = None
    try:
        result = supabase.table("report_sessions") \
            .select("adk_session_id") \
            .eq("id", report_id) \
            .single() \
            .execute()
        if result.data:
            stored_adk_session_id = result.data.get("adk_session_id")
    except Exception:
        pass

    async def event_stream():
        try:
            agent = ReportAgentService(
                report_id=report_id,
                session_service=session_service,
                sandbox_manager=sandbox_manager,
                adk_session_id=stored_adk_session_id,
                artifacts=artifacts_data,
            )
        except Exception as init_err:
            yield f"data: {json.dumps({'type': 'error', 'content': f'Agent init failed: {init_err}'})}\n\n"
            return

        try:
            async for event in agent.generate_content(request.prompt):
                # Intercept internal adk_session_id event — persist to Supabase
                if event["type"] == "adk_session_id":
                    try:
                        supabase.table("report_sessions") \
                            .update({"adk_session_id": event["content"]}) \
                            .eq("id", report_id) \
                            .execute()
                    except Exception as e:
                        print(f"Warning: failed to persist report adk_session_id: {e}")
                    continue  # Don't forward this internal event to the frontend
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
    session_service=Depends(get_adk_session_service),
):
    """Create a new report session with a pre-created ADK session."""
    result = supabase.table("report_sessions").insert({
        "project_id": request.project_id,
        "name": request.name,
        "messages": json.dumps(request.messages or []),
        "created_by": user.user_id,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session")

    session_row = result.data[0]
    supabase_session_id = session_row["id"]

    # Pre-create ADK session so it's ready for the first generation
    try:
        adk_session = await session_service.create_session(
            app_name="lunara_reports",
            user_id=f"report_{supabase_session_id}",
            state={},
        )
        supabase.table("report_sessions") \
            .update({"adk_session_id": adk_session.id}) \
            .eq("id", supabase_session_id) \
            .execute()
        session_row["adk_session_id"] = adk_session.id
    except Exception as e:
        print(f"Warning: failed to pre-create report ADK session: {e}")

    return session_row


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
    session_service=Depends(get_adk_session_service),
    sandbox_manager=Depends(get_sandbox_manager),
):
    """Delete a report session, its items, its ADK session, and its GCP sandbox."""
    # Fetch adk_session_id before deleting
    adk_session_id = None
    try:
        result = supabase.table("report_sessions") \
            .select("adk_session_id") \
            .eq("id", session_id) \
            .single() \
            .execute()
        if result.data:
            adk_session_id = result.data.get("adk_session_id")
    except Exception:
        pass

    # Clean up GCP sandbox BEFORE deleting the ADK session (need session state)
    if adk_session_id:
        try:
            adk_session = await session_service.get_session(
                app_name="lunara_reports",
                user_id=f"report_{session_id}",
                session_id=adk_session_id,
            )
            sandbox_name = (
                adk_session.state.get("_sandbox_resource_name")
                if adk_session else None
            )
            if sandbox_name:
                await sandbox_manager.delete_sandbox(sandbox_name)
                sandbox_manager.unregister(sandbox_name)
        except Exception as e:
            print(f"Warning: sandbox cleanup failed for session {session_id}: {e}")

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

    # Clean up ADK session
    if adk_session_id:
        try:
            await session_service.delete_session(
                app_name="lunara_reports",
                user_id=f"report_{session_id}",
                session_id=adk_session_id,
            )
        except Exception:
            pass  # Non-fatal

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


@router.patch("/items/{item_id}")
async def update_item(
    item_id: str,
    request: ItemUpdateRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Update a report item (content, title, or position)."""
    update_data: Dict[str, Any] = {}
    if request.content is not None:
        update_data["content"] = request.content
    if request.title is not None:
        update_data["title"] = request.title
    if request.position is not None:
        update_data["position"] = request.position
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    result = supabase.table("report_items") \
        .update(update_data) \
        .eq("id", item_id) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Item not found")
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
