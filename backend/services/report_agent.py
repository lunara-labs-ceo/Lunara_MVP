"""Report Agent Service v2 - Simplified architecture for better performance.

Architecture (v2):
- ReportBuilder (main agent) with direct tools for artifacts/blocks
  └── AgentTool(CodeExecutor) - only for Python code execution

This eliminates the DataAssistant AgentTool wrapper, reducing LLM calls for 
data operations from 2+ calls to 0 additional calls.
"""
import os
import json
import sqlite3
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, AsyncIterator

from google.adk.agents import LlmAgent
from google.adk.tools import agent_tool
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import InMemoryArtifactService
from google.adk.code_executors import BuiltInCodeExecutor
from google.adk.planners import BuiltInPlanner
from google.genai import types

# Database path
DB_PATH = Path(__file__).parent.parent / "lunara.db"

# Service account for BigQuery
SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent.parent / "lunara-dev-094f5e9e682e.json"

if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    if SERVICE_ACCOUNT_PATH.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")


class ReportAgentService:
    """Simplified report generation agent.
    
    Architecture v2:
    - ReportBuilder: Main agent with direct tools for data + AgentTool for code
    - Eliminates DataAssistant wrapper for faster data operations
    """
    
    def __init__(self):
        """Initialize the agent system."""
        self._runner: Optional[Runner] = None
        self._session_id: Optional[str] = None
        self._user_id: str = "default"
        self._report_blocks: List[Dict] = []
        self._seen_artifacts: set = set()
        self._pending_chart_filenames: List[Dict] = []
        self._generation_start: Optional[datetime] = None
        self._unassigned_chart_images: List[str] = []  # Stores base64 images waiting for add_chart_block
        
        # =====================================================
        # CodeExecutor Agent (wrapped as AgentTool)
        # Only used for matplotlib/pandas code execution
        # =====================================================
        self.code_executor = LlmAgent(
            model="gemini-3-flash-preview",
            name="CodeExecutor",
            description="Executes Python code for data analysis and chart generation. Use for pandas analysis, matplotlib charts, and calculations.",
            instruction="""You are a Python code execution specialist.

When given data, you should:
1. Write Python code using pandas, numpy, matplotlib
2. Execute the code to create visualizations or analyze data
3. Return the results clearly

For charts:
- Use plt.figure(figsize=(10, 6))
- Add clear titles, labels, and legends
- Use professional color schemes (blues, teals)
- Add data labels on bars when appropriate
- Always call plt.show() to render

For analysis:
- Use pandas for data manipulation
- Print key insights and statistics
- Be precise with numbers""",
            code_executor=BuiltInCodeExecutor(),
        )
        
        # =====================================================
        # ReportBuilder Agent (main agent with direct tools)
        # Has data tools directly + CodeExecutor as AgentTool
        # =====================================================
        self.report_builder = LlmAgent(
            model="gemini-3-flash-preview",
            name="ReportBuilder",
            description="Main report generation agent with data access and code execution capabilities.",
            instruction="""You are a helpful report building assistant for Lunara BI. Think of yourself as a skilled colleague who helps create professional reports - conversational, thoughtful, and focused on what the user actually wants.

**Your Approach:**
- Do EXACTLY what the user asks, nothing more, nothing less
- If they ask for "just the chart", give them just the chart - no extra KPIs, summaries, or analysis
- If you need clarification, ask! Don't assume.
- Be conversational in your responses, not robotic

**Tools at your disposal:**
- `get_artifacts()` - See what data is available
- `get_artifact_data(artifact_id)` - Fetch specific data
- `add_text_block(title, content)` - Add text/analysis (supports markdown)
- `add_kpi_block(title, value)` - Add a metric card
- `add_table_block(title, data)` - Add a data table
- `add_chart_block(title)` - Add a chart to the report (MUST call after generating chart!)
- `CodeExecutor` - For matplotlib charts and complex analysis

**IMPORTANT - Chart Workflow:**
1. Use CodeExecutor to generate the chart with matplotlib
2. THEN immediately call add_chart_block(title) to add it to the report
If you skip step 2, the chart won't appear in the report!

**When creating charts:**
- Use clean, professional styling (blues/teals work well)
- Add clear titles and labels
- Include data labels when appropriate

**Key principle:** You're here to help, not to show off. If someone asks for one chart, don't overwhelm them with an executive summary, three KPIs, and recommendations they didn't ask for. Just give them what they need.""",
            tools=[
                # Direct data tools (no LLM overhead)
                self.get_artifacts,
                self.get_artifact_data,
                self.add_text_block,
                self.add_kpi_block,
                self.add_table_block,
                self.add_chart_block,  # For adding charts after generating with CodeExecutor
                # Code execution via AgentTool (still needs LLM)
                agent_tool.AgentTool(agent=self.code_executor),
            ],
            # Enable thinking/reasoning output via BuiltInPlanner
            planner=BuiltInPlanner(
                thinking_config=types.ThinkingConfig(
                    include_thoughts=True,
                )
            ),
        )
    
    # =========================================================
    # Direct Data Tools (no AgentTool wrapper = fast)
    # =========================================================
    
    def get_artifacts(self) -> dict:
        """
        Get all saved artifacts from the database.
        
        Returns:
            List of artifacts with id, name, created_at.
        """
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
                {"id": row[0], "name": row[1], "created_at": row[2]}
                for row in rows
            ]
            return {"artifacts": artifacts, "count": len(artifacts)}
        except Exception as e:
            return {"error": str(e)}
    
    def get_artifact_data(self, artifact_id: str) -> dict:
        """
        Get full data from an artifact.
        
        Args:
            artifact_id (str): ID of the artifact to retrieve.
            
        Returns:
            Artifact data including SQL and results.
        """
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
                return {"error": f"Artifact {artifact_id} not found"}
            
            return {
                "id": row[0],
                "name": row[1],
                "sql": row[2],
                "data": json.loads(row[3]) if row[3] else [],
                "created_at": row[4],
            }
        except Exception as e:
            return {"error": str(e)}
    
    def add_text_block(self, title: str, content: str) -> dict:
        """
        Add a text block to the report.
        
        Args:
            title (str): Title for the block.
            content (str): Markdown-formatted text content.
            
        Returns:
            Confirmation with block ID.
        """
        block = {
            "id": len(self._report_blocks) + 1,
            "type": "text",
            "title": title,
            "content": content,
            "created_at": datetime.now().isoformat(),
        }
        self._report_blocks.append(block)
        return {"status": "success", "block_id": block["id"], "type": "text"}
    
    def add_kpi_block(self, title: str, value: str) -> dict:
        """
        Add a KPI metric block to the report.
        
        Args:
            title (str): Title for the KPI (e.g., "Total Revenue").
            value (str): The metric value (e.g., "$1.2M").
            
        Returns:
            Confirmation with block ID.
        """
        block = {
            "id": len(self._report_blocks) + 1,
            "type": "kpi",
            "title": title,
            "content": value,
            "created_at": datetime.now().isoformat(),
        }
        self._report_blocks.append(block)
        return {"status": "success", "block_id": block["id"], "type": "kpi"}
    
    def add_table_block(self, title: str, data: str) -> dict:
        """
        Add a data table block to the report.
        
        Args:
            title (str): Title for the table.
            data (str): JSON string of table data.
            
        Returns:
            Confirmation with block ID.
        """
        block = {
            "id": len(self._report_blocks) + 1,
            "type": "table",
            "title": title,
            "content": data,
            "created_at": datetime.now().isoformat(),
        }
        self._report_blocks.append(block)
        return {"status": "success", "block_id": block["id"], "type": "table"}
    
    def add_chart_block(self, title: str, filename: str = "") -> dict:
        """
        Add a chart/visualization block to the report.
        
        Call this AFTER generating a chart with CodeExecutor to formally add it to the report.
        The most recently generated chart image will be used.
        
        Args:
            title (str): Title/caption for the chart.
            filename (str): Optional filename (not typically needed).
            
        Returns:
            Confirmation that the chart was added.
        """
        # Use the most recent unassigned chart image
        if self._unassigned_chart_images:
            image_data = self._unassigned_chart_images.pop(0)
            block = {
                "id": len(self._report_blocks) + 1,
                "type": "chart",
                "title": title,
                "content": image_data,
                "created_at": datetime.now().isoformat(),
            }
            self._report_blocks.append(block)
            return {
                "status": "success",
                "message": f"Chart '{title}' has been added to the report.",
                "block_id": block["id"]
            }
        else:
            # No image available yet - store as pending for artifact retrieval
            self._pending_chart_filenames.append({
                "title": title,
                "filename": filename,
                "created_at": datetime.now().isoformat(),
            })
            return {
                "status": "pending",
                "message": f"Chart '{title}' will be added when the image is ready."
            }
    
    # =========================================================
    # Service methods
    # =========================================================
    
    def get_report_blocks(self) -> List[Dict]:
        """Get all blocks added to the report."""
        return self._report_blocks
    
    def get_new_blocks(self) -> List[Dict]:
        """Get only blocks created during the most recent generation.
        
        This prevents old blocks from being re-added when user sends a new message.
        """
        if not hasattr(self, '_generation_start') or self._generation_start is None:
            return self._report_blocks
        
        new_blocks = []
        for block in self._report_blocks:
            created = block.get("created_at")
            if created:
                # Compare ISO format timestamps
                if created >= self._generation_start.isoformat():
                    new_blocks.append(block)
        return new_blocks
    
    def clear_blocks(self):
        """Clear all report blocks."""
        self._report_blocks = []
        self._seen_artifacts = set()
        self._pending_chart_filenames = []
        self._generation_start = None
        self._unassigned_chart_images = []
    
    async def initialize(self, user_id: str = "default", force_new_session: bool = False):
        """Initialize runner and session.
        
        Args:
            user_id: User identifier
            force_new_session: If True, create a new session even if one exists
        """
        self._user_id = user_id
        
        # Create runner only once (it holds the agent configuration)
        if self._runner is None:
            self._session_service = InMemorySessionService()
            self._artifact_service = InMemoryArtifactService()
            
            self._runner = Runner(
                agent=self.report_builder,
                app_name="lunara_reports",
                session_service=self._session_service,
                artifact_service=self._artifact_service,
            )
        
        # Always create a new session when force_new_session is True
        # This gives each report/chat its own clean context
        if force_new_session or self._session_id is None:
            # Clear any existing state
            self._report_blocks = []
            self._seen_artifacts = set()
            self._pending_chart_filenames = []
            
            # Create new session
            session = await self._session_service.create_session(
                app_name="lunara_reports",
                user_id=self._user_id,
                state={"blocks": []}
            )
            self._session_id = session.id
            print(f"✓ Report Agent v2: Created NEW session {self._session_id} for user {self._user_id}")
    
    async def generate(self, prompt: str) -> AsyncIterator[Dict]:
        """
        Generate report content based on user prompt.
        
        Yields:
            Streaming response chunks with type and content.
            Only yields blocks created during THIS generation (not old ones).
        """
        if not self._runner:
            await self.initialize()
        
        # Track when this generation started - only yield blocks created after this
        self._generation_start = datetime.now()
        
        from google.genai import types
        
        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)]
        )
        
        try:
            async for event in self._runner.run_async(
                user_id=self._user_id,
                session_id=self._session_id,
                new_message=content,
            ):
                if hasattr(event, 'content') and event.content:
                    for part in event.content.parts:
                        # Check if this is a thought part (thought flag is True)
                        is_thought = getattr(part, 'thought', None) == True
                        
                        if is_thought and hasattr(part, 'text') and part.text:
                            # This is a thought - yield the thought content
                            yield {
                                "type": "thought",
                                "content": part.text
                            }
                        elif hasattr(part, 'text') and part.text and not is_thought:
                            # Regular text response
                            yield {
                                "type": "text",
                                "content": part.text,
                                "author": getattr(event, 'author', 'unknown')
                            }
                        elif hasattr(part, 'executable_code') and part.executable_code:
                            yield {
                                "type": "code",
                                "content": part.executable_code.code
                            }
                        elif hasattr(part, 'code_execution_result') and part.code_execution_result:
                            yield {
                                "type": "code_result",
                                "output": part.code_execution_result.output,
                                "outcome": str(part.code_execution_result.outcome)
                            }
                        elif hasattr(part, 'function_call') and part.function_call:
                            yield {
                                "type": "status",
                                "content": f"🔧 Calling {part.function_call.name}..."
                            }
                        elif hasattr(part, 'inline_data') and part.inline_data:
                            # Handle generated images from code execution
                            image_data = part.inline_data.data
                            if isinstance(image_data, bytes):
                                image_data = base64.b64encode(image_data).decode()
                            
                            # Check if there's a pending chart title (add_chart_block was called before)
                            if self._pending_chart_filenames:
                                # Use the pending title and create block now
                                pending = self._pending_chart_filenames.pop(0)
                                chart_title = pending.get("title", "Generated Chart")
                                self._report_blocks.append({
                                    "id": len(self._report_blocks) + 1,
                                    "type": "chart",
                                    "title": chart_title,
                                    "content": image_data,
                                    "created_at": datetime.now().isoformat(),
                                })
                            else:
                                # No pending title yet - store for add_chart_block to use later
                                self._unassigned_chart_images.append(image_data)
                            
                            # Still yield the image for real-time display
                            yield {
                                "type": "image",
                                "mime_type": part.inline_data.mime_type,
                                "data": image_data
                            }
        except Exception as e:
            yield {
                "type": "error",
                "content": str(e)
            }
        
        # After generation, fetch any NEW artifacts saved by CodeExecutor
        try:
            if self._runner and self._runner.artifact_service:
                artifact_names = await self._runner.artifact_service.list_artifact_keys(
                    app_name="lunara_reports",
                    user_id=self._user_id,
                    session_id=self._session_id,
                )
                
                for artifact_name in artifact_names:
                    if artifact_name in self._seen_artifacts:
                        continue
                    
                    self._seen_artifacts.add(artifact_name)
                    
                    artifact_part = await self._runner.artifact_service.load_artifact(
                        app_name="lunara_reports",
                        user_id=self._user_id,
                        session_id=self._session_id,
                        filename=artifact_name,
                    )
                    
                    if artifact_part and hasattr(artifact_part, 'inline_data') and artifact_part.inline_data:
                        image_data = artifact_part.inline_data.data
                        if isinstance(image_data, bytes):
                            image_data = base64.b64encode(image_data).decode()
                        
                        # Store for add_chart_block() to use (don't create block directly)
                        self._unassigned_chart_images.append(image_data)
                        
                        yield {
                            "type": "image",
                            "mime_type": artifact_part.inline_data.mime_type,
                            "data": image_data,
                            "filename": artifact_name,
                        }
        except Exception as e:
            print(f"Warning: Failed to retrieve artifacts: {e}")
        
        # Match any pending chart titles with unassigned images
        # This handles the case where add_chart_block was called before the image arrived
        while self._pending_chart_filenames and self._unassigned_chart_images:
            pending = self._pending_chart_filenames.pop(0)
            image_data = self._unassigned_chart_images.pop(0)
            block = {
                "id": len(self._report_blocks) + 1,
                "type": "chart",
                "title": pending.get("title", "Generated Chart"),
                "content": image_data,
                "created_at": datetime.now().isoformat(),
            }
            self._report_blocks.append(block)
        
        # Yield only NEW blocks created during this generation
        for block in self._report_blocks:
            created = block.get("created_at")
            if created and created >= self._generation_start.isoformat():
                yield {
                    "type": "block",
                    "block": block
                }
