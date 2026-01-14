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
            instruction="""You are a report generation AI for Lunara BI.

You have these tools available:

**Data Tools (direct, fast):**
- get_artifacts(): List all saved data artifacts
- get_artifact_data(artifact_id): Get full data from a specific artifact  
- add_text_block(title, content): Add a text/analysis section
- add_kpi_block(title, value): Add a KPI metric
- add_table_block(title, data): Add a data table

**Code Execution (for charts):**
- CodeExecutor: Use for matplotlib charts and complex analysis

Workflow:
1. First call get_artifacts() to see available data
2. Call get_artifact_data() to fetch the data you need
3. For charts: Call CodeExecutor with the data
4. Add blocks to build the report

IMPORTANT - Report Structure:
- Create SEPARATE blocks for each section
- Use descriptive titles for each block
- Use markdown formatting in text blocks:
  * ## for section headers
  * **bold** for emphasis
  * - or * for bullet lists

Block Structure Example:
1. Executive Summary block (2-3 key highlights)
2. Chart block (visualization)
3. Analysis block (detailed insights)
4. Recommendations block (action items)

Be concise and professional.""",
            tools=[
                # Direct data tools (no LLM overhead)
                self.get_artifacts,
                self.get_artifact_data,
                self.add_text_block,
                self.add_kpi_block,
                self.add_table_block,
                # Code execution via AgentTool (still needs LLM)
                agent_tool.AgentTool(agent=self.code_executor),
            ],
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
    
    # =========================================================
    # Service methods
    # =========================================================
    
    def get_report_blocks(self) -> List[Dict]:
        """Get all blocks added to the report."""
        return self._report_blocks
    
    def clear_blocks(self):
        """Clear all report blocks."""
        self._report_blocks = []
        self._seen_artifacts = set()
        self._pending_chart_filenames = []
    
    async def initialize(self, user_id: str = "default"):
        """Initialize runner and session."""
        self._user_id = user_id
        if self._runner is None:
            session_service = InMemorySessionService()
            artifact_service = InMemoryArtifactService()
            
            self._runner = Runner(
                agent=self.report_builder,
                app_name="lunara_reports",
                session_service=session_service,
                artifact_service=artifact_service,
            )
            
            session = await session_service.create_session(
                app_name="lunara_reports",
                user_id=self._user_id,
                state={"blocks": []}
            )
            self._session_id = session.id
            print(f"✓ Report Agent v2: Created session {self._session_id} for user {self._user_id}")
    
    async def generate(self, prompt: str) -> AsyncIterator[Dict]:
        """
        Generate report content based on user prompt.
        
        Yields:
            Streaming response chunks with type and content.
        """
        if not self._runner:
            await self.initialize()
        
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
                        if hasattr(part, 'text') and part.text:
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
                            
                            yield {
                                "type": "image",
                                "mime_type": part.inline_data.mime_type,
                                "data": image_data
                            }
                            
                            # Add as a chart block
                            self._report_blocks.append({
                                "id": len(self._report_blocks) + 1,
                                "type": "chart",
                                "title": "Generated Chart",
                                "content": image_data,
                                "created_at": datetime.now().isoformat(),
                            })
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
                        
                        yield {
                            "type": "image",
                            "mime_type": artifact_part.inline_data.mime_type,
                            "data": image_data,
                            "filename": artifact_name,
                        }
                        
                        # Check for pending title
                        chart_title = "Generated Chart"
                        for pending in self._pending_chart_filenames:
                            if pending["filename"] == artifact_name:
                                chart_title = pending["title"]
                                break
                        
                        self._report_blocks.append({
                            "id": len(self._report_blocks) + 1,
                            "type": "chart",
                            "title": chart_title,
                            "content": image_data,
                            "created_at": datetime.now().isoformat(),
                        })
        except Exception as e:
            print(f"Warning: Failed to retrieve artifacts: {e}")
        
        # Yield all blocks
        for block in self._report_blocks:
            yield {
                "type": "block",
                "block": block
            }
