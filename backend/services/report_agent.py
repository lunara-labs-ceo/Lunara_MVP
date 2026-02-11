"""Clean Report Agent Service - Document Copilot.

Simple architecture like the chat agent:
- Single agent with tools
- Streams text responses
- Adds content via tool calls
"""
from __future__ import annotations

import os
import json
import sqlite3
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, AsyncIterator, Any

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.code_executors import BuiltInCodeExecutor
from google.genai import types

# Database path
DB_PATH = Path(__file__).parent.parent / "lunara.db"

# Configure credentials
SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent.parent / "lunara-dev-094f5e9e682e.json"
if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    if SERVICE_ACCOUNT_PATH.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")


class ReportAgentService:
    """Clean report agent - request-scoped, no shared state."""
    
    def __init__(self, report_id: int):
        """Initialize service for a specific report.
        
        Args:
            report_id: The report ID this agent instance is working on.
        """
        self.report_id = report_id
        self._content_items: List[Dict[str, Any]] = []
        self._runner: Optional[Runner] = None
        self._session_id: Optional[str] = None
        
        # Create the agent with all tools
        self.agent = Agent(
            model="gemini-3-flash-preview",
            name="report_copilot",
            description="Document copilot that generates report content from data artifacts",
            instruction="""You are a document copilot for Lunara BI. You help users create reports from their saved data artifacts.

Your job is to:
1. Understand what content the user wants to create
2. Fetch relevant artifacts using list_artifacts and get_artifact_data
3. Generate appropriate content using the add_* tools

Available tools:
- list_artifacts(): Get list of all saved artifacts with IDs and titles
- get_artifact_data(artifact_id): Get full data from a specific artifact
- add_text_content(title, markdown_content): Add formatted text analysis
- add_table_content(title, data_json): Add a data table (pass artifact data as JSON string)

When the user asks for:
- "Summary", "analysis", "insights" → Use add_text_content with markdown
- "Chart", "graph", "visualization" → Write Python code with matplotlib, it will auto-execute
- "Table", "show data", "raw data" → Use add_table_content with the artifact data

Workflow:
1. Call list_artifacts() to see what's available
2. Call get_artifact_data() to fetch relevant data
3. Generate content using the appropriate add_* tool

Be conversational in your text responses. Use markdown formatting for text content.
When creating charts via code, use professional styling with clear labels.""",
            tools=[
                self._list_artifacts,
                self._get_artifact_data,
                self._add_text_content,
                self._add_table_content,
            ],
            code_executor=BuiltInCodeExecutor(),
        )
    
    # ========================================================================
    # Tools
    # ========================================================================
    
    def _list_artifacts(self) -> str:
        """List all saved artifacts."""
        try:
            conn = sqlite3.connect(str(DB_PATH))
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, title, created_at 
                FROM artifacts 
                ORDER BY created_at DESC
            """)
            rows = cursor.fetchall()
            conn.close()
            
            artifacts = [
                {"id": row[0], "title": row[1], "created_at": row[2]}
                for row in rows
            ]
            return json.dumps(artifacts, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    def _get_artifact_data(self, artifact_id: str) -> str:
        """Get full data from an artifact."""
        try:
            conn = sqlite3.connect(str(DB_PATH))
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, title, sql, data, created_at 
                FROM artifacts WHERE id = ?
            """, (artifact_id,))
            row = cursor.fetchone()
            conn.close()
            
            if not row:
                return json.dumps({"error": f"Artifact {artifact_id} not found"})
            
            data = json.loads(row[3]) if row[3] else []
            return json.dumps({
                "id": row[0],
                "title": row[1],
                "sql": row[2],
                "data": data,
                "row_count": len(data) if isinstance(data, list) else 0,
                "created_at": row[4],
            }, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    def _add_text_content(self, title: str, markdown_content: str) -> str:
        """Add formatted text content to the report."""
        item = {
            "id": len(self._content_items) + 1,
            "type": "text",
            "title": title,
            "content": markdown_content,
            "created_at": datetime.now().isoformat(),
        }
        self._content_items.append(item)
        return f"Added text section: {title}"
    
    def _add_table_content(self, title: str, data_json: str) -> str:
        """Add a data table to the report."""
        try:
            data = json.loads(data_json) if isinstance(data_json, str) else data_json
            item = {
                "id": len(self._content_items) + 1,
                "type": "table",
                "title": title,
                "content": json.dumps(data),
                "row_count": len(data) if isinstance(data, list) else 0,
                "created_at": datetime.now().isoformat(),
            }
            self._content_items.append(item)
            return f"Added table: {title} ({item['row_count']} rows)"
        except Exception as e:
            return f"Error adding table: {str(e)}"
    
    # ========================================================================
    # Public API
    # ========================================================================
    
    def get_content_items(self) -> List[Dict[str, Any]]:
        """Get all content items generated so far."""
        return self._content_items.copy()
    
    async def initialize(self):
        """Initialize runner and session."""
        if self._runner is None:
            session_service = InMemorySessionService()
            
            self._runner = Runner(
                agent=self.agent,
                app_name="lunara_reports",
                session_service=session_service,
            )
            
            session = await session_service.create_session(
                app_name="lunara_reports",
                user_id=f"report_{self.report_id}",
                state={"content_items": []}
            )
            self._session_id = session.id
    
    async def generate_content(self, prompt: str) -> AsyncIterator[Dict[str, Any]]:
        """Generate content based on user prompt."""
        await self.initialize()
        
        # Create message
        content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        # Stream events like the chat agent
        try:
            async for event in self._runner.run_async(
                session_id=self._session_id,
                user_id=f"report_{self.report_id}",
                new_message=content
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        # Text response from agent
                        if hasattr(part, 'text') and part.text:
                            yield {
                                "type": "text",
                                "content": part.text
                            }
                        
                        # Function calls
                        elif hasattr(part, 'function_call') and part.function_call:
                            fn_name = part.function_call.name
                            if fn_name.startswith("add_"):
                                yield {
                                    "type": "status",
                                    "content": f"✨ Creating content..."
                                }
                            else:
                                yield {
                                    "type": "status",
                                    "content": f"🔍 {fn_name}..."
                                }
                        
                        # Executable code (chart generation)
                        elif hasattr(part, 'executable_code') and part.executable_code:
                            yield {
                                "type": "code",
                                "content": part.executable_code.code
                            }
                        
                        # Code execution result
                        elif hasattr(part, 'code_execution_result') and part.code_execution_result:
                            yield {
                                "type": "code_result",
                                "output": part.code_execution_result.output
                            }
                        
                        # Inline data (generated images/charts)
                        elif hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            if isinstance(image_data, bytes):
                                image_data = base64.b64encode(image_data).decode()
                            
                            # Add as content item
                            item = {
                                "id": len(self._content_items) + 1,
                                "type": "chart",
                                "title": "Generated Chart",
                                "content": image_data,
                                "mime_type": part.inline_data.mime_type,
                                "created_at": datetime.now().isoformat(),
                            }
                            self._content_items.append(item)
                            
                            yield {
                                "type": "chart",
                                "data": image_data,
                                "mime_type": part.inline_data.mime_type
                            }
            
            # Yield final content items
            for item in self._content_items:
                yield {
                    "type": "content_item",
                    "item": item
                }
                
            yield {"type": "done", "items_added": len(self._content_items)}
            
        except Exception as e:
            yield {
                "type": "error",
                "content": str(e)
            }
