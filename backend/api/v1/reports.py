"""Clean API endpoints for report management."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.report_agent import ReportAgentService


router = APIRouter(prefix="/reports", tags=["reports"])
DB_PATH = Path(__file__).parent.parent.parent / "lunara.db"


# ============================================================================
# Database Schema
# ============================================================================

def init_db():
    """Initialize reports tables."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # Reports table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Untitled Report',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    
    # Report content items (document sections)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS report_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            type TEXT NOT NULL,  -- 'text', 'chart', 'table'
            title TEXT,
            content TEXT NOT NULL,  -- markdown, base64 image, or JSON
            position INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()


# Initialize on module load
init_db()


# ============================================================================
# Pydantic Models
# ============================================================================

class ReportCreate(BaseModel):
    title: str = "Untitled Report"


class ReportUpdate(BaseModel):
    title: Optional[str] = None


class GenerateRequest(BaseModel):
    prompt: str


class ContentItem(BaseModel):
    id: int
    type: str
    title: Optional[str]
    content: str


class Report(BaseModel):
    id: int
    title: str
    items: List[ContentItem]
    created_at: str
    updated_at: str


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("")
async def create_report(request: ReportCreate):
    """Create a new empty report."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO reports (title, created_at, updated_at) VALUES (?, ?, ?)",
        (request.title, now, now)
    )
    report_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "id": report_id,
        "title": request.title,
        "items": [],
        "created_at": now,
        "updated_at": now
    }


@router.get("")
async def list_reports():
    """List all reports."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT r.id, r.title, r.created_at, r.updated_at,
               COUNT(rc.id) as item_count
        FROM reports r
        LEFT JOIN report_content rc ON r.id = rc.report_id
        GROUP BY r.id
        ORDER BY r.updated_at DESC
    """)
    
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": row[0],
            "title": row[1],
            "created_at": row[2],
            "updated_at": row[3],
            "item_count": row[4]
        }
        for row in rows
    ]


@router.get("/{report_id}")
async def get_report(report_id: int):
    """Get a report with all its content items."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # Get report
    cursor.execute(
        "SELECT id, title, created_at, updated_at FROM reports WHERE id = ?",
        (report_id,)
    )
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Get content items
    cursor.execute("""
        SELECT id, type, title, content, position
        FROM report_content
        WHERE report_id = ?
        ORDER BY position ASC
    """, (report_id,))
    
    items = [
        {
            "id": item[0],
            "type": item[1],
            "title": item[2],
            "content": item[3],
            "position": item[4]
        }
        for item in cursor.fetchall()
    ]
    
    conn.close()
    
    return {
        "id": row[0],
        "title": row[1],
        "items": items,
        "created_at": row[2],
        "updated_at": row[3]
    }


@router.put("/{report_id}")
async def update_report(report_id: int, request: ReportUpdate):
    """Update report metadata."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM reports WHERE id = ?", (report_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")
    
    now = datetime.now().isoformat()
    
    if request.title:
        cursor.execute(
            "UPDATE reports SET title = ?, updated_at = ? WHERE id = ?",
            (request.title, now, report_id)
        )
    
    conn.commit()
    conn.close()
    
    return {"status": "updated", "id": report_id}


@router.delete("/{report_id}")
async def delete_report(report_id: int):
    """Delete a report and all its content."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found")
    
    conn.commit()
    conn.close()
    
    return {"status": "deleted", "id": report_id}


@router.post("/{report_id}/generate")
async def generate_content(report_id: int, request: GenerateRequest):
    """Generate content using AI copilot.
    
    Streams SSE events:
    - type: 'text' - Agent thinking/response text
    - type: 'status' - Action being performed
    - type: 'code' - Code being executed
    - type: 'code_result' - Code execution output
    - type: 'chart' - Generated chart (base64)
    - type: 'content_item' - Final content item added to report
    - type: 'done' - Generation complete
    """
    
    async def event_stream():
        # Create fresh service instance (NO singleton - prevents race conditions)
        agent = ReportAgentService(report_id=report_id)
        
        try:
            # Stream generation events
            async for event in agent.generate_content(request.prompt):
                yield f"data: {json.dumps(event)}\n\n"
            
            # Save generated content to database
            items = agent.get_content_items()
            if items:
                conn = sqlite3.connect(str(DB_PATH))
                cursor = conn.cursor()
                
                # Get current max position
                cursor.execute(
                    "SELECT MAX(position) FROM report_content WHERE report_id = ?",
                    (report_id,)
                )
                result = cursor.fetchone()
                next_position = (result[0] or 0) + 1
                
                # Insert new items
                now = datetime.now().isoformat()
                for item in items:
                    cursor.execute("""
                        INSERT INTO report_content 
                        (report_id, type, title, content, position, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        report_id,
                        item["type"],
                        item.get("title", ""),
                        item["content"],
                        next_position,
                        now
                    ))
                    next_position += 1
                
                # Update report timestamp
                cursor.execute(
                    "UPDATE reports SET updated_at = ? WHERE id = ?",
                    (now, report_id)
                )
                
                conn.commit()
                conn.close()
            
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


@router.delete("/{report_id}/items/{item_id}")
async def delete_content_item(report_id: int, item_id: int):
    """Delete a content item from the report."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # Verify item belongs to report
    cursor.execute(
        "SELECT id FROM report_content WHERE id = ? AND report_id = ?",
        (item_id, report_id)
    )
    
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Content item not found")
    
    cursor.execute("DELETE FROM report_content WHERE id = ?", (item_id,))
    
    # Update positions of remaining items
    cursor.execute("""
        SELECT id FROM report_content 
        WHERE report_id = ? 
        ORDER BY position ASC
    """, (report_id,))
    
    ids = [row[0] for row in cursor.fetchall()]
    for idx, id_val in enumerate(ids, start=1):
        cursor.execute(
            "UPDATE report_content SET position = ? WHERE id = ?",
            (idx, id_val)
        )
    
    # Update report timestamp
    now = datetime.now().isoformat()
    cursor.execute(
        "UPDATE reports SET updated_at = ? WHERE id = ?",
        (now, report_id)
    )
    
    conn.commit()
    conn.close()
    
    return {"status": "deleted", "id": item_id}
