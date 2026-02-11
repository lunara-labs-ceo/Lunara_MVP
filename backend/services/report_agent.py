"""Clean Report Agent Service - Document Copilot Architecture.

Like Word with Copilot:
- User chats naturally
- AI picks artifacts and generates content
- Content appears as sections in a document
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
from google.adk.tools import agent_tool
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
    
    Each request creates a fresh instance, eliminating race conditions.
    """
    
    def __init__(self, report_id: int):
        """Initialize service for a specific report.
        
        Args:
            report_id: The report ID this agent instance is working on.
        """
        self.report_id = report_id
        self._content_items: List[Dict[str, Any]] = []
        
        # Create sub-agents
        self._create_agents()
    
    def _create_agents(self) -> None:
        """Create the agent hierarchy."""
        
        # Agent 1: Data Assistant - fetches artifacts
        self.data_assistant = LlmAgent(
            model="gemini-2.0-flash",
            name="DataAssistant",
            description="Fetches data artifacts when requested by the ReportWriter.",
            instruction="""You fetch artifact data from the database.

Available tools:
- list_artifacts(): Get list of all saved artifacts
- get_artifact_data(artifact_id): Get full data from a specific artifact

When asked for data:
1. Use list_artifacts() to see what's available
2. Use get_artifact_data() to fetch specific artifact data
3. Return the data as JSON

Be concise - just return the data, no extra commentary.""",
            tools=[
                self._list_artifacts,
                self._get_artifact_data,
            ],
        )
        
        # Agent 2: Code Executor - creates charts
        self.code_executor = LlmAgent(
            model="gemini-2.0-flash",
            name="CodeExecutor",
            description="Creates data visualizations using Python and matplotlib.",
            instruction="""You create professional data visualizations.

When given data:
1. Write Python code using matplotlib to create the chart
2. Use professional styling (colors, labels, titles)
3. Execute the code to generate the chart
4. The chart will be automatically captured and added to the report

Chart guidelines:
- Use plt.figure(figsize=(10, 6)) for good size
- Use modern color schemes (blues, teals)
- Always add clear titles and labels
- Call plt.show() to render the chart

For analysis:
- Use pandas for data manipulation
- Print key insights""",
            code_executor=BuiltInCodeExecutor(),
        )
        
        # Agent 3: Report Writer - orchestrates everything
        self.report_writer = LlmAgent(
            model="gemini-2.0-flash",
            name="ReportWriter",
            description="Document copilot that generates report content from artifacts.",
            instruction="""You are a document copilot for Lunara BI. You help users create reports from their data artifacts.

Your job:
1. Understand what the user wants to create
2. Fetch relevant artifacts using DataAssistant
3. Generate appropriate content:
   - **Text summaries**: Use add_text_content() for analysis and insights
   - **Charts**: Use CodeExecutor to create visualizations
   - **Tables**: Use add_table_content() to display data

Workflow:
1. Ask DataAssistant to list available artifacts
2. Fetch the relevant artifact data
3. Based on user request, generate appropriate content:
   - For "summarize" → add_text_content()
   - For "chart" or "visualization" → CodeExecutor (chart auto-captured)
   - For "table" or "show data" → add_table_content()

Content types:
- **Text**: Markdown-formatted analysis (headers, bold, lists)
- **Charts**: Generated via CodeExecutor (automatically captured)
- **Tables**: JSON data formatted as clean tables

Always be helpful and create professional, insightful content.""",
            tools=[
                agent_tool.AgentTool(agent=self.data_assistant),
                agent_tool.AgentTool(agent=self.code_executor),
                self._add_text_content,
                self._add_table_content,
            ],
        )
    
    # ========================================================================
    # Tools for DataAssistant
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
    
    # ========================================================================
    # Tools for ReportWriter
    # ========================================================================
    
    def _add_text_content(self, title: str, markdown_content: str) -> str:
        """Add formatted text content to the report.
        
        Args:
            title: Section title
            markdown_content: Markdown-formatted text
        """
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
        """Add a data table to the report.
        
        Args:
            title: Table title
            data_json: JSON array of objects (artifact data)
        """
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
        """Generate content based on user prompt.
        
        Yields streaming events with agent progress and final content.
        """
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
                            yield {
                                "type": "status",
                                "content": f"🔄 {part.function_call.name}..."
                            }
                        
                        # Executable code (chart generation)
                        elif hasattr(part, 'executable_code') and part.executable_code:
                            yield {
                                "type": "code",
                                "content": part.executable_code.code
                            }
                        
                        # Code execution results
                        elif hasattr(part, 'code_execution_result') and part.code_execution_result:
                            yield {
                                "type": "code_result",
                                "output": part.code_execution_result.output
                            }
                        
                        # Inline data (generated images)
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
                
        except Exception as e:
            yield {
                "type": "error",
                "content": str(e)
            }
