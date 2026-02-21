"""Report generation API endpoints.

CRUD operations (create, list, get, update, delete) are now handled
client-side via the Supabase JS client against the `report_sessions`
and `report_items` tables.  This module only exposes the SSE-based
content generation endpoint, which still runs server-side.
"""
from __future__ import annotations

import json
from typing import Optional, List, Dict, Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.report_agent import ReportAgentService


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


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/{report_id}/generate")
async def generate_content(report_id: str, request: GenerateRequest):
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
    
    # Convert artifact inputs to dicts for the agent
    artifacts_data = [art.model_dump() for art in request.artifacts]
    
    async def event_stream():
        # Create fresh service instance (NO singleton - prevents race conditions)
        agent = ReportAgentService(
            report_id=report_id,
            artifacts=artifacts_data,
        )
        
        try:
            # Stream generation events
            async for event in agent.generate_content(request.prompt, history=request.history):
                yield f"data: {json.dumps(event)}\n\n"
            
            # Collect generated items and emit them as content_item events
            items = agent.get_content_items()
            for item in items:
                yield f"data: {json.dumps({'type': 'content_item', 'item': item})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done', 'items_added': len(items)})}\n\n"
            
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
