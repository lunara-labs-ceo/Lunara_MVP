"""API endpoints for chat agent.

Uses the WarehouseProvider abstraction so the chat agent works with
any supported data warehouse (PostgreSQL, BigQuery, etc.).

ADK session IDs are stored in the Supabase chat_sessions table and looked up
on each request so the agent can resume multi-turn conversations natively.
"""
from __future__ import annotations

import json
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from google.api_core.exceptions import ResourceExhausted, TooManyRequests
from services.chat_agent import ChatAgentService
from services.connection_manager import ConnectionManager
from api.v1.connection import get_connection_manager, get_supabase
from middleware.clerk_auth import ClerkUser, get_current_user


router = APIRouter(prefix="/chat", tags=["chat"])

# Cache chat agents per data_source_id (they hold the agent + runner)
_chat_agents: Dict[str, ChatAgentService] = {}


def get_adk_session_service():
    """Placeholder — overridden by main.py dependency injection."""
    raise RuntimeError("ADK session service not configured")


# Request/Response models
class ChatMessage(BaseModel):
    role: str
    content: str
    sql: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    semantic_model: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = None  # Kept for backward compat, ignored


class ExecuteRequest(BaseModel):
    sql: str


class SessionCreateRequest(BaseModel):
    project_id: str
    name: str = "New Chat"
    messages: Optional[List[Dict[str, Any]]] = None


class SessionUpdateRequest(BaseModel):
    name: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None


class ArtifactCreateRequest(BaseModel):
    project_id: str
    title: str
    sql: str
    data: Optional[List[Dict[str, Any]]] = None
    session_id: Optional[str] = None


async def _get_chat_agent(
    data_source_id: str,
    conn_mgr: ConnectionManager,
    supabase: Any,
    session_service: Any,
) -> ChatAgentService:
    """Get or create a chat agent for the given data source.

    Chat agents are cached per data_source_id because they hold the
    LLM agent and runner configuration.
    """
    if data_source_id not in _chat_agents:
        provider = await conn_mgr.get_provider(data_source_id, supabase)
        _chat_agents[data_source_id] = ChatAgentService(provider, session_service)
    return _chat_agents[data_source_id]


@router.post("/query")
async def chat_query(
    request: ChatRequest,
    data_source_id: str = Query(..., description="Data source ID to connect to"),
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
    session_service=Depends(get_adk_session_service),
):
    """
    Process a chat message and generate SQL.

    Returns an SSE stream with agent responses and generated SQL.
    """
    if not request.message:
        raise HTTPException(status_code=400, detail="No message provided")

    # Deduct 1 credit for chat query
    from services.billing import CreditService
    credit_service = CreditService(supabase)
    await credit_service.deduct_credits(
        user.user_id, cost=1, action="chat_query",
        reference_id=request.session_id,
    )

    try:
        chat_agent = await _get_chat_agent(data_source_id, conn_mgr, supabase, session_service)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Look up stored ADK session ID from Supabase
    stored_adk_session_id = None
    if request.session_id:
        try:
            result = supabase.table("chat_sessions") \
                .select("adk_session_id") \
                .eq("id", request.session_id) \
                .single() \
                .execute()
            if result.data:
                stored_adk_session_id = result.data.get("adk_session_id")
        except Exception:
            pass  # Session may not exist yet, continue

    async def event_stream():
        """Generate SSE events from chat agent."""
        success = False
        try:
            async for event in chat_agent.chat(
                message=request.message,
                semantic_model=request.semantic_model,
                session_id=request.session_id,
                stored_adk_session_id=stored_adk_session_id,
            ):
                # Intercept internal adk_session_id event — persist to Supabase
                if event["type"] == "adk_session_id":
                    if request.session_id:
                        try:
                            supabase.table("chat_sessions") \
                                .update({"adk_session_id": event["content"]}) \
                                .eq("id", request.session_id) \
                                .execute()
                        except Exception as e:
                            print(f"Warning: failed to persist adk_session_id: {e}")
                    continue  # Don't forward this internal event to the frontend
                yield f"data: {json.dumps(event)}\n\n"
            success = True
        except (ResourceExhausted, TooManyRequests):
            error_event = {"type": "error", "content": "Luna is experiencing high demand right now. Your credit has been refunded — please try again in a moment."}
            yield f"data: {json.dumps(error_event)}\n\n"
        except Exception as e:
            error_event = {"type": "error", "content": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"
        finally:
            if not success:
                try:
                    await credit_service.refund_credits(
                        user.user_id, cost=1, action="chat_query",
                        reference_id=request.session_id,
                    )
                except Exception as refund_err:
                    print(f"Warning: credit refund failed: {refund_err}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/execute")
async def execute_query(
    request: ExecuteRequest,
    data_source_id: str = Query(..., description="Data source ID to connect to"),
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
    session_service=Depends(get_adk_session_service),
):
    """
    Execute a SQL query against the data warehouse.

    Returns query results.
    """
    if not request.sql:
        raise HTTPException(status_code=400, detail="No SQL provided")

    try:
        chat_agent = await _get_chat_agent(data_source_id, conn_mgr, supabase, session_service)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = await chat_agent.execute_query(request.sql)

    if not result.get("success"):
        error_msg = result.get("error", "Query failed")
        raise HTTPException(status_code=400, detail=f"Query execution failed: {error_msg}")

    return result


# ---- Session CRUD ----

@router.get("/sessions")
async def list_sessions(
    project_id: str = Query(...),
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """List chat sessions for a project, newest first."""
    result = supabase.table("chat_sessions") \
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
    """Create a new chat session with a pre-created ADK session."""
    result = supabase.table("chat_sessions").insert({
        "project_id": request.project_id,
        "name": request.name,
        "messages": json.dumps(request.messages or []),
        "created_by": user.user_id,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session")

    session_row = result.data[0]
    supabase_session_id = session_row["id"]

    # Pre-create ADK session so it's ready for the first message
    try:
        adk_session = await session_service.create_session(
            app_name="lunara_chat",
            user_id=f"session_{supabase_session_id}",
            state={},
        )
        supabase.table("chat_sessions") \
            .update({"adk_session_id": adk_session.id}) \
            .eq("id", supabase_session_id) \
            .execute()
        session_row["adk_session_id"] = adk_session.id
    except Exception as e:
        print(f"Warning: failed to pre-create ADK session: {e}")
        # Non-fatal — will be created lazily on first message

    return session_row


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Get a single chat session by ID."""
    result = supabase.table("chat_sessions") \
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
    """Update a chat session (name and/or messages)."""
    update_data: Dict[str, Any] = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.messages is not None:
        update_data["messages"] = json.dumps(request.messages)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    result = supabase.table("chat_sessions") \
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
):
    """Delete a chat session and its ADK session."""
    # Fetch adk_session_id before deleting
    adk_session_id = None
    try:
        result = supabase.table("chat_sessions") \
            .select("adk_session_id") \
            .eq("id", session_id) \
            .single() \
            .execute()
        if result.data:
            adk_session_id = result.data.get("adk_session_id")
    except Exception:
        pass

    # Delete from Supabase
    supabase.table("chat_sessions") \
        .delete() \
        .eq("id", session_id) \
        .execute()

    # Clean up ADK session
    if adk_session_id:
        try:
            await session_service.delete_session(
                app_name="lunara_chat",
                user_id=f"session_{session_id}",
                session_id=adk_session_id,
            )
        except Exception:
            pass  # Non-fatal

    return {"ok": True}


# ---- Artifact CRUD ----

@router.get("/artifacts")
async def list_artifacts(
    project_id: str = Query(...),
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """List saved artifacts for a project, newest first."""
    result = supabase.table("chat_artifacts") \
        .select("*") \
        .eq("project_id", project_id) \
        .order("created_at", desc=True) \
        .execute()
    return result.data


@router.post("/artifacts")
async def create_artifact(
    request: ArtifactCreateRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Save a query + results as a reusable artifact."""
    result = supabase.table("chat_artifacts").insert({
        "project_id": request.project_id,
        "title": request.title,
        "sql": request.sql,
        "data": json.dumps(request.data or []),
        "session_id": request.session_id,
        "created_by": user.user_id,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create artifact")
    return result.data[0]


@router.delete("/artifacts/{artifact_id}")
async def delete_artifact(
    artifact_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Delete an artifact."""
    supabase.table("chat_artifacts") \
        .delete() \
        .eq("id", artifact_id) \
        .execute()
    return {"ok": True}
