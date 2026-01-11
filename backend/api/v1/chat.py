"""API endpoints for chat agent and artifacts."""
from __future__ import annotations

import json
import uuid
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.bigquery import BigQueryService
from services.chat_agent import ChatAgentService
from api.v1.connection import get_bigquery_service


router = APIRouter(prefix="/chat", tags=["chat"])

# SQLite database path
DB_PATH = Path(__file__).parent.parent.parent / "lunara.db"

# Global chat agent instance
_chat_agent: Optional[ChatAgentService] = None


# Request/Response models
class ChatRequest(BaseModel):
    message: str
    semantic_model: Optional[Dict[str, Any]] = None


class ExecuteRequest(BaseModel):
    sql: str


class ArtifactCreate(BaseModel):
    title: str
    sql: str
    data: List[Dict[str, Any]]


class Artifact(BaseModel):
    id: str
    title: str
    sql: str
    data: List[Dict[str, Any]]
    created_at: str


def get_chat_agent(
    bq_service: BigQueryService = Depends(get_bigquery_service)
) -> ChatAgentService:
    """Get or create the chat agent service."""
    global _chat_agent
    if _chat_agent is None:
        _chat_agent = ChatAgentService(bq_service)
    return _chat_agent


def init_artifacts_db():
    """Initialize the artifacts table if it doesn't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            sql TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


# Initialize DB on module load
init_artifacts_db()


@router.post("/query")
async def chat_query(
    request: ChatRequest,
    chat_agent: ChatAgentService = Depends(get_chat_agent)
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
            async for event in chat_agent.chat(
                message=request.message,
                semantic_model=request.semantic_model
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
    chat_agent: ChatAgentService = Depends(get_chat_agent)
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


@router.post("/artifacts", response_model=Artifact)
async def create_artifact(artifact: ArtifactCreate):
    """
    Save a query result as an artifact.
    """
    artifact_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO artifacts (id, title, sql, data, created_at) VALUES (?, ?, ?, ?, ?)",
        (artifact_id, artifact.title, artifact.sql, json.dumps(artifact.data), created_at)
    )
    conn.commit()
    conn.close()
    
    return Artifact(
        id=artifact_id,
        title=artifact.title,
        sql=artifact.sql,
        data=artifact.data,
        created_at=created_at
    )


@router.get("/artifacts", response_model=List[Artifact])
async def list_artifacts():
    """
    Get all saved artifacts.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, sql, data, created_at FROM artifacts ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    return [
        Artifact(
            id=row[0],
            title=row[1],
            sql=row[2],
            data=json.loads(row[3]),
            created_at=row[4]
        )
        for row in rows
    ]


@router.get("/artifacts/{artifact_id}", response_model=Artifact)
async def get_artifact(artifact_id: str):
    """
    Get a single artifact by ID.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, sql, data, created_at FROM artifacts WHERE id = ?", (artifact_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Artifact not found")
    
    return Artifact(
        id=row[0],
        title=row[1],
        sql=row[2],
        data=json.loads(row[3]),
        created_at=row[4]
    )


@router.delete("/artifacts/{artifact_id}")
async def delete_artifact(artifact_id: str):
    """
    Delete an artifact by ID.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM artifacts WHERE id = ?", (artifact_id,))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Artifact not found")
    conn.commit()
    conn.close()
    
    return {"status": "deleted", "id": artifact_id}
