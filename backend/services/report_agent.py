"""Report Agent Service - generates reports using Gemini's built-in code execution.

Uses multi-agent pattern due to ADK limitation:
Code execution cannot be combined with other tools in the same agent.
"""
import os
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, AsyncIterator

from google.adk.agents import LlmAgent, Agent
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.adk.code_executors import BuiltInCodeExecutor

# Database path
DB_PATH = Path(__file__).parent.parent / "lunara.db"

# Service account for BigQuery
SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent.parent / "lunara-dev-094f5e9e682e.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
os.environ["GOOGLE_CLOUD_PROJECT"] = "lunara-dev"
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"


class ReportAgentService:
    """AI Agent for generating reports with Gemini's built-in code execution.
    
    Uses multi-agent architecture:
    - CodeExecutorAgent: Has code_executor for Python analysis/charts
    - DataToolsAgent: Has tools for artifacts and report blocks
    - RootAgent: Orchestrates between them
    """
    
    def __init__(self):
        """Initialize the Report Agent."""
        self._runner: Optional[Runner] = None
        self._session_id: Optional[str] = None
        self._report_blocks: List[Dict] = []
        
        # Agent 1: Code Execution (no other tools allowed per ADK limitations)
        self.code_executor_agent = LlmAgent(
            model="gemini-3-flash-preview",
            name="code_executor",
            description="Executes Python code for data analysis and chart generation. Use this for pandas analysis, matplotlib charts, and calculations.",
            instruction="""You are a Python code executor. When given data and a task:
1. Write Python code using pandas, matplotlib, numpy
2. Execute the code to analyze data or create charts
3. Return the results

For charts, use matplotlib with clean styling.
For analysis, use pandas and print key insights.""",
            code_executor=BuiltInCodeExecutor(),
        )
        
        # Agent 2: Data Tools (artifacts + blocks)
        self.data_tools_agent = LlmAgent(
            model="gemini-3-flash-preview",
            name="data_tools",
            description="Manages artifacts and report blocks. Use this to list/get artifacts and add blocks to the report.",
            instruction="""You manage data artifacts and report blocks.

Available tools:
- get_artifacts(): List all saved artifacts
- get_artifact_data(artifact_id): Get full data from an artifact
- add_block(block_type, content, title): Add content to report

Call these tools when asked about artifacts or adding to the report.""",
            tools=[
                self.get_artifacts,
                self.get_artifact_data,
                self.add_block,
            ],
        )
        
        # Root Agent: Orchestrates sub-agents
        self.root_agent = Agent(
            model="gemini-3-flash-preview",
            name="report_agent",
            description="Generates data reports with charts and analysis",
            instruction="""You are a report generation AI for Lunara BI.

You have two specialized sub-agents:
1. data_tools: Use to list/get artifacts and add blocks to report
2. code_executor: Use to run Python code for analysis and charts

Workflow:
1. Ask data_tools to list available artifacts
2. Ask data_tools to get the data you need
3. Ask code_executor to analyze data or create charts
4. Ask data_tools to add results to the report

Be helpful and insightful in your analysis.""",
            sub_agents=[
                self.data_tools_agent,
                self.code_executor_agent,
            ],
        )
        
        # Session persistence
        self._session_service = DatabaseSessionService(
            db_url=f"sqlite:///{DB_PATH}"
        )
    
    async def initialize(self, user_id: str = "default"):
        """Initialize runner and session."""
        self._runner = Runner(
            agent=self.root_agent,
            app_name="lunara_report_builder",
            session_service=self._session_service,
        )
        
        self._session_id = f"report_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        await self._runner.session_service.create_session(
            app_name="lunara_report_builder",
            user_id=user_id,
            session_id=self._session_id,
        )
    
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
                SELECT id, name, created_at 
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
    
    def get_artifact_data(self, artifact_id: int) -> dict:
        """
        Get full data from an artifact.
        
        Args:
            artifact_id: ID of the artifact to retrieve.
            
        Returns:
            Artifact data including SQL and results.
        """
        try:
            conn = sqlite3.connect(str(DB_PATH))
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, sql_query, data, created_at 
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
    
    def add_block(self, block_type: str, content: str, title: str = "") -> dict:
        """
        Add a block to the report.
        
        Args:
            block_type: Type of block ('chart', 'text', 'kpi', 'table')
            content: Content (base64 for charts, text/JSON for others)
            title: Optional title for the block
            
        Returns:
            Confirmation with block ID.
        """
        block = {
            "id": len(self._report_blocks) + 1,
            "type": block_type,
            "title": title,
            "content": content,
            "created_at": datetime.now().isoformat(),
        }
        self._report_blocks.append(block)
        return {"status": "success", "block_id": block["id"]}
    
    def get_report_blocks(self) -> List[Dict]:
        """Get all blocks added to the report."""
        return self._report_blocks
    
    def clear_blocks(self):
        """Clear all report blocks."""
        self._report_blocks = []
    
    async def generate(
        self,
        prompt: str,
    ) -> AsyncIterator[Dict]:
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
        
        async for event in self._runner.run_async(
            user_id="default",
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
                            "content": f"🔧 {part.function_call.name}..."
                        }
                    elif hasattr(part, 'inline_data') and part.inline_data:
                        # Handle generated images from code execution
                        import base64
                        yield {
                            "type": "image",
                            "mime_type": part.inline_data.mime_type,
                            "data": base64.b64encode(part.inline_data.data).decode() if isinstance(part.inline_data.data, bytes) else part.inline_data.data
                        }
        
        # After generation, yield any new blocks
        for block in self._report_blocks:
            yield {
                "type": "block",
                "block": block
            }
