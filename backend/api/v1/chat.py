"""API endpoints for chat agent.

Uses the WarehouseProvider abstraction so the chat agent works with
any supported data warehouse (PostgreSQL, BigQuery, etc.).
"""
from __future__ import annotations

import json
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.chat_agent import ChatAgentService
from services.connection_manager import ConnectionManager
from api.v1.connection import get_connection_manager, get_supabase
from middleware.clerk_auth import ClerkUser, get_current_user


router = APIRouter(prefix="/chat", tags=["chat"])

# Cache chat agents per data_source_id (they hold ADK session state)
_chat_agents: Dict[str, ChatAgentService] = {}


# Request/Response models
class ChatMessage(BaseModel):
    role: str
    content: str
    sql: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    semantic_model: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = None


class ExecuteRequest(BaseModel):
    sql: str


async def _get_chat_agent(
    data_source_id: str,
    conn_mgr: ConnectionManager,
    supabase: Any,
) -> ChatAgentService:
    """Get or create a chat agent for the given data source.

    Chat agents are cached per data_source_id because they hold ADK
    session state that should persist across requests.
    """
    if data_source_id not in _chat_agents:
        provider = await conn_mgr.get_provider(data_source_id, supabase)
        _chat_agents[data_source_id] = ChatAgentService(provider)
    return _chat_agents[data_source_id]


@router.post("/query")
async def chat_query(
    request: ChatRequest,
    data_source_id: str = Query(..., description="Data source ID to connect to"),
    user: ClerkUser = Depends(get_current_user),
    conn_mgr: ConnectionManager = Depends(get_connection_manager),
    supabase=Depends(get_supabase),
):
    """
    Process a chat message and generate SQL.

    Returns an SSE stream with agent responses and generated SQL.
    """
    if not request.message:
        raise HTTPException(status_code=400, detail="No message provided")

    try:
        chat_agent = await _get_chat_agent(data_source_id, conn_mgr, supabase)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    async def event_stream():
        """Generate SSE events from chat agent."""
        try:
            history_dicts = [m.model_dump() for m in request.history] if request.history else None
            async for event in chat_agent.chat(
                message=request.message,
                semantic_model=request.semantic_model,
                session_id=request.session_id,
                history=history_dicts
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            error_event = {"type": "error", "content": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"

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
):
    """
    Execute a SQL query against the data warehouse.

    Returns query results.
    """
    if not request.sql:
        raise HTTPException(status_code=400, detail="No SQL provided")

    try:
        chat_agent = await _get_chat_agent(data_source_id, conn_mgr, supabase)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = await chat_agent.execute_query(request.sql)

    if not result.get("success"):
        error_msg = result.get("error", "Query failed")
        raise HTTPException(status_code=400, detail=f"Query execution failed: {error_msg}")

    return result
