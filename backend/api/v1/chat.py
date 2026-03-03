"""API endpoints for chat agent."""
from __future__ import annotations

import json
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.bigquery import BigQueryService
from services.chat_agent import ChatAgentService
from api.v1.connection import get_bigquery_service
from middleware.clerk_auth import ClerkUser, get_current_user


router = APIRouter(prefix="/chat", tags=["chat"])

# Global chat agent instance
_chat_agent: Optional[ChatAgentService] = None


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


def get_chat_agent(
    bq_service: BigQueryService = Depends(get_bigquery_service)
) -> ChatAgentService:
    """Get or create the chat agent service."""
    global _chat_agent
    if _chat_agent is None:
        _chat_agent = ChatAgentService(bq_service)
    return _chat_agent


@router.post("/query")
async def chat_query(
    request: ChatRequest,
    user: ClerkUser = Depends(get_current_user),
    chat_agent: ChatAgentService = Depends(get_chat_agent),
):
    """
    Process a chat message and generate SQL.
    
    Returns an SSE stream with agent responses and generated SQL.
    """
    if not request.message:
        raise HTTPException(status_code=400, detail="No message provided")
    
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
    user: ClerkUser = Depends(get_current_user),
    chat_agent: ChatAgentService = Depends(get_chat_agent),
):
    """
    Execute a SQL query against BigQuery.
    
    Returns query results.
    """
    if not request.sql:
        raise HTTPException(status_code=400, detail="No SQL provided")
    
    result = await chat_agent.execute_query(request.sql)
    
    if not result.get("success"):
        error_msg = result.get("error", "Query failed")
        raise HTTPException(status_code=400, detail=f"Query execution failed: {error_msg}")
    
    return result
