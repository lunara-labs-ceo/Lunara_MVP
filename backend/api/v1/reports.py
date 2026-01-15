"""API endpoints for report management and generation."""
import json
import sqlite3
from typing import Optional
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.report_agent import ReportAgentService


router = APIRouter(prefix="/reports", tags=["reports"])

# Database path
DB_PATH = Path(__file__).parent.parent.parent / "lunara.db"

# Global report agent instance
_report_agent: Optional[ReportAgentService] = None
_current_report_id: Optional[int] = None


def get_report_agent() -> ReportAgentService:
    """Get or create report agent instance."""
    global _report_agent
    if _report_agent is None:
        _report_agent = ReportAgentService()
    return _report_agent


def init_reports_table():
    """Initialize the reports table in the database."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            blocks TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


# Initialize table on module load
init_reports_table()


# Pydantic models
class ReportCreate(BaseModel):
    name: str = "Untitled Report"


class ReportUpdate(BaseModel):
    name: Optional[str] = None
    blocks: Optional[list] = None


class GenerateRequest(BaseModel):
    prompt: str


# CRUD Endpoints

@router.post("")
async def create_report(request: ReportCreate):
    """Create a new report."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        
        cursor.execute(
            "INSERT INTO reports (name, blocks, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (request.name, "[]", now, now)
        )
        report_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return {
            "id": report_id,
            "name": request.name,
            "blocks": [],
            "created_at": now,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_reports():
    """List all reports."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, created_at, updated_at FROM reports ORDER BY updated_at DESC")
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {"id": row[0], "name": row[1], "created_at": row[2], "updated_at": row[3]}
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{report_id}")
async def get_report(report_id: int):
    """Get a specific report with blocks."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, blocks, created_at, updated_at FROM reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            "id": row[0],
            "name": row[1],
            "blocks": json.loads(row[2]) if row[2] else [],
            "created_at": row[3],
            "updated_at": row[4],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{report_id}")
async def update_report(report_id: int, request: ReportUpdate):
    """Update a report."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        # Get current report
        cursor.execute("SELECT name, blocks FROM reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Report not found")
        
        name = request.name if request.name else row[0]
        blocks = json.dumps(request.blocks) if request.blocks is not None else row[1]
        now = datetime.now().isoformat()
        
        cursor.execute(
            "UPDATE reports SET name = ?, blocks = ?, updated_at = ? WHERE id = ?",
            (name, blocks, now, report_id)
        )
        conn.commit()
        conn.close()
        
        return {"status": "updated", "id": report_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{report_id}")
async def delete_report(report_id: int):
    """Delete a report."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM reports WHERE id = ?", (report_id,))
        conn.commit()
        conn.close()
        return {"status": "deleted", "id": report_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# AI Generation Endpoint

@router.post("/{report_id}/generate")
async def generate_report_content(report_id: int, request: GenerateRequest):
    """
    Generate report content using AI.
    
    Streams SSE events with generated content.
    """
    global _current_report_id
    
    agent = get_report_agent()
    
    # If switching to a different report, create a new session
    # This prevents session creep between reports
    force_new = _current_report_id != report_id
    if force_new:
        _current_report_id = report_id
        
    await agent.initialize(user_id=f"report_{report_id}", force_new_session=force_new)
    
    async def event_stream():
        try:
            async for chunk in agent.generate(request.prompt):
                yield f"data: {json.dumps(chunk)}\n\n"
            
            # After generation, get only NEW blocks (not old accumulated ones)
            blocks = agent.get_new_blocks()
            if blocks:
                # Save blocks to report
                conn = sqlite3.connect(str(DB_PATH))
                cursor = conn.cursor()
                cursor.execute("SELECT blocks FROM reports WHERE id = ?", (report_id,))
                row = cursor.fetchone()
                
                if row:
                    existing = json.loads(row[0]) if row[0] else []
                    existing.extend(blocks)
                    now = datetime.now().isoformat()
                    cursor.execute(
                        "UPDATE reports SET blocks = ?, updated_at = ? WHERE id = ?",
                        (json.dumps(existing), now, report_id)
                    )
                    conn.commit()
                
                conn.close()
                agent.clear_blocks()
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
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
