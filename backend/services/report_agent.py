"""Clean Report Agent Service - Document Copilot.

Simplified architecture:
- Single agent for data fetching and text generation (no code executor)
- Backend explicitly calls chart generation when needed
- No sub-agents, no AgentTool complexity
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
    """Clean report agent - request-scoped, no shared state."""
    
    def __init__(self, report_id: int):
        """Initialize service for a specific report."""
        self.report_id = report_id
        self._content_items: List[Dict[str, Any]] = []
        
        # Create agent (NO code executor - charts handled separately)
        self.agent = LlmAgent(
            model="gemini-3-flash-preview",
            name="ReportWriter",
            description="Document copilot that generates report content from data artifacts.",
            instruction="""You are a document copilot for Lunara BI.

Your job is to help users create reports from their saved data artifacts.

You can:
1. List available artifacts
2. Fetch artifact data
3. Add text analysis/summaries
4. Add data tables
5. REQUEST chart generation (the backend will handle this)

Available tools:
- list_artifacts(): Get list of saved artifacts
- get_artifact_data(id): Fetch full data from an artifact
- add_text_content(title, markdown): Add formatted text section
- add_table_content(title, data_json): Add data table

For CHARTS:
When the user wants a chart, do this:
1. Fetch the artifact data using get_artifact_data()
2. Add a text note saying "CHART_REQUEST: [description]" using add_text_content
3. The backend will see this and generate the chart automatically

Example workflow for charts:
User: "Create a bar chart of sales"
You: 
  1. list_artifacts() to find sales data
  2. get_artifact_data(id) to fetch the data
  3. add_text_content(title="Chart Request", markdown="CHART_REQUEST: Create a bar chart from this data showing...")
  4. add_table_content(title="Sales Data", data_json=...) to show the raw data too

Be conversational and helpful.""",
            tools=[
                FunctionTool(self._list_artifacts),
                FunctionTool(self._get_artifact_data),
                FunctionTool(self._add_text_content),
                FunctionTool(self._add_table_content),
            ],
        )
        
        # Separate chart generator (called explicitly by backend, not as agent tool)
        self.chart_generator = LlmAgent(
            model="gemini-3-flash-preview",
            name="ChartGenerator",
            description="Creates data visualizations using matplotlib",
            instruction="""You are a data visualization specialist.

Create professional charts using matplotlib:
1. Analyze the data provided
2. Choose appropriate chart type (bar, pie, line, etc.)
3. Write and execute Python code
4. Use professional styling:
   - plt.figure(figsize=(10, 6))
   - Clear titles, labels, legend
   - Professional colors
   - Always call plt.show()

The chart will be automatically captured and added to the report.""",
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
    # Chart Generation (called explicitly by backend)
    # ========================================================================
    
    async def generate_chart(self, description: str, data: List[Dict]) -> Optional[str]:
        """Generate a chart using the standalone chart generator.
        
        Args:
            description: What chart to create
            data: The data to visualize
            
        Returns:
            Base64 encoded chart image or None if failed
        """
        session_service = InMemorySessionService()
        
        runner = Runner(
            agent=self.chart_generator,
            app_name="lunara_charts",
            session_service=session_service,
        )
        
        session = await session_service.create_session(
            app_name="lunara_charts",
            user_id=f"chart_{self.report_id}",
            state={}
        )
        
        # Create prompt with data
        prompt = f"""{description}

Data:
{json.dumps(data, indent=2)}

Create a professional chart using matplotlib. Call plt.show() to render it."""
        
        content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        chart_data = None
        
        try:
            async for event in runner.run_async(
                user_id=f"chart_{self.report_id}",
                session_id=session.id,
                new_message=content
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        # Capture inline data (chart image)
                        if hasattr(part, 'inline_data') and part.inline_data:
                            image_data = part.inline_data.data
                            if isinstance(image_data, bytes):
                                chart_data = base64.b64encode(image_data).decode()
                            else:
                                chart_data = image_data
                            break
        except Exception as e:
            print(f"Chart generation error: {e}")
        
        return chart_data
    
    # ========================================================================
    # Public API
    # ========================================================================
    
    def get_content_items(self) -> List[Dict[str, Any]]:
        """Get all content items generated so far."""
        return self._content_items.copy()
    
    async def generate_content(self, prompt: str) -> AsyncIterator[Dict[str, Any]]:
        """Generate content based on user prompt."""
        session_service = InMemorySessionService()
        
        runner = Runner(
            agent=self.agent,
            app_name="lunara_reports",
            session_service=session_service,
        )
        
        session = await session_service.create_session(
            app_name="lunara_reports",
            user_id=f"report_{self.report_id}",
            state={"content_items": []}
        )
        
        content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        # Track if we need to generate a chart
        chart_request = None
        chart_data = None
        
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
                        
                        # Function calls
                        elif hasattr(part, 'function_call') and part.function_call:
                            fn_name = part.function_call.name
                            yield {
                                "type": "status",
                                "content": f"🔍 {fn_name}..."
                            }
            
            # Check for chart requests in text content
            for item in self._content_items:
                if item["type"] == "text" and "CHART_REQUEST:" in item["content"]:
                    # Extract chart request
                    lines = item["content"].split('\n')
                    for line in lines:
                        if line.startswith("CHART_REQUEST:"):
                            chart_request = line.replace("CHART_REQUEST:", "").strip()
                            break
                    
                    # Find associated data (look for table with same ID or recent data)
                    # For now, use the most recent table
                    for prev_item in reversed(self._content_items):
                        if prev_item["type"] == "table":
                            try:
                                chart_data = json.loads(prev_item["content"])
                            except:
                                pass
                            break
                    
                    if chart_request and chart_data:
                        yield {
                            "type": "status",
                            "content": "📊 Generating chart..."
                        }
                        
                        # Generate chart
                        chart_image = await self.generate_chart(chart_request, chart_data)
                        
                        if chart_image:
                            # Add chart as content item
                            chart_item = {
                                "id": len(self._content_items) + 1,
                                "type": "chart",
                                "title": "Generated Chart",
                                "content": chart_image,
                                "mime_type": "image/png",
                                "created_at": datetime.now().isoformat(),
                            }
                            self._content_items.append(chart_item)
                            
                            yield {
                                "type": "chart",
                                "data": chart_image,
                                "mime_type": "image/png"
                            }
                        
                        # Remove the CHART_REQUEST text item
                        self._content_items = [i for i in self._content_items if "CHART_REQUEST:" not in i.get("content", "")]
                    
                    break
            
            # Yield all content items
            for item in self._content_items:
                yield {
                    "type": "content_item",
                    "item": item
                }
            
            yield {"type": "done", "items_added": len(self._content_items)}
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {
                "type": "error",
                "content": str(e)
            }
