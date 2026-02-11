"""Clean Report Agent Service - Document Copilot Architecture.

Uses ADK pattern from codelab:
- Main agent with data tools (no code executor)
- Separate code executor agent for charts
- Main agent calls code executor via AgentTool when needed
"""
from __future__ import annotations

import os
import json
import sqlite3
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, AsyncIterator, Any

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
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
    """Clean report agent - request-scoped, no shared state.
    
    Architecture:
    - ReportWriter (main agent) - has data tools, orchestrates
      └── AgentTool(CodeExecutor) - for charts only
    """
    
    def __init__(self, report_id: int):
        """Initialize service for a specific report.
        
        Args:
            report_id: The report ID this agent instance is working on.
        """
        self.report_id = report_id
        self._content_items: List[Dict[str, Any]] = []
        
        # Create agents
        self._create_agents()
    
    def _create_agents(self) -> None:
        """Create the agent hierarchy following ADK best practices."""
        
        # Agent 1: Code Executor - ONLY has code executor, no other tools
        self.code_executor = LlmAgent(
            model="gemini-3-flash-preview",
            name="CodeExecutor",
            description="Creates data visualizations using matplotlib. Call this when you need a chart.",
            instruction="""You are a data visualization specialist.

When given data, create professional charts using matplotlib:
1. Analyze the data structure
2. Choose appropriate chart type (bar, pie, line, etc.)
3. Write and execute Python code with matplotlib
4. Use professional styling:
   - plt.figure(figsize=(10, 6))
   - Clear titles and labels
   - Professional color schemes
   - Always call plt.show()

You have NO other tools - only code execution. Use it to create charts.""",
            code_executor=BuiltInCodeExecutor(),
        )
        
        # Agent 2: Report Writer (main) - has tools + CodeExecutor as sub-agent
        # Using sub_agents instead of AgentTool due to ADK bug #729
        # (AgentTool doesn't propagate multimodal content properly)
        self.report_writer = LlmAgent(
            model="gemini-3-flash-preview",
            name="ReportWriter",
            description="Document copilot that generates report content from data artifacts.",
            instruction="""You are a document copilot for Lunara BI.

Your job:
1. Understand what content the user wants
2. Fetch artifacts using list_artifacts() and get_artifact_data()
3. Generate content:
   - Text analysis → use add_text_content()
   - Data table → use add_table_content()
   - Charts/visualizations → delegate to CodeExecutor sub-agent

Workflow for charts:
1. Get artifact data first
2. Delegate to CodeExecutor sub-agent with the data and chart request
3. CodeExecutor will generate and execute matplotlib code
4. The chart will be automatically added to the report

Available tools:
- list_artifacts(): Get available artifacts
- get_artifact_data(id): Fetch specific artifact data
- add_text_content(title, markdown): Add text section
- add_table_content(title, data_json): Add table

To create charts, delegate to the CodeExecutor sub-agent.

Be conversational and helpful. Use markdown for text content.""",
            tools=[
                FunctionTool(self._list_artifacts),
                FunctionTool(self._get_artifact_data),
                FunctionTool(self._add_text_content),
                FunctionTool(self._add_table_content),
            ],
            sub_agents=[self.code_executor],
        )
    
    # ========================================================================
    # Tools for ReportWriter
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
    
    async def generate_content(self, prompt: str) -> AsyncIterator[Dict[str, Any]]:
        """Generate content based on user prompt."""
        # Create fresh services for this request
        session_service = InMemorySessionService()
        
        runner = Runner(
            agent=self.report_writer,
            app_name="lunara_reports",
            session_service=session_service,
        )
        
        # Create session
        session = await session_service.create_session(
            app_name="lunara_reports",
            user_id=f"report_{self.report_id}",
            state={"content_items": []}
        )
        
        # Create message
        content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        # Stream events
        try:
            async for event in runner.run_async(
                user_id=f"report_{self.report_id}",
                session_id=session.id,
                new_message=content
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        # Text content
                        if hasattr(part, 'text') and part.text:
                            yield {
                                "type": "text",
                                "content": part.text
                            }
                        
                        # Function calls (status updates)
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
            
            # Yield all content items at the end
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
