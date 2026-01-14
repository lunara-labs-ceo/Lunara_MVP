"""Report Agent Service - hierarchical agent architecture using AgentTool pattern.

Architecture:
- ReportWriter (main) - orchestrates report building
  └── AgentTool(DataAssistant) - fetches artifacts, manages blocks
  └── AgentTool(CodeExecutor) - runs Python for charts/analysis
"""
import os
import json
import sqlite3
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
# Check if already set (e.g., by main.py on Render), otherwise look for local file
SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent.parent / "lunara-dev-094f5e9e682e.json"

if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    if SERVICE_ACCOUNT_PATH.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")


class ReportAgentService:
    """Hierarchical agent system for report generation.
    
    Uses AgentTool pattern:
    - ReportWriter: Main agent that orchestrates
    - DataAssistant: Agent wrapped as tool for artifact operations
    - CodeExecutor: Agent wrapped as tool for Python execution
    """
    
    def __init__(self):
        """Initialize the hierarchical agent system."""
        self._runner: Optional[Runner] = None
        self._session_id: Optional[str] = None
        self._user_id: str = "default"
        self._report_blocks: List[Dict] = []
        self._seen_artifacts: set = set()  # Track artifacts we've already added
        
        # =====================================================
        # Agent 1: CodeExecutor (only has code execution)
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
- Use professional color schemes
- Always call plt.show() to render

For analysis:
- Use pandas for data manipulation
- Print key insights and statistics
- Be precise with numbers""",
            code_executor=BuiltInCodeExecutor(),
        )
        
        # =====================================================
        # Agent 2: DataAssistant (only has custom tools)
        # =====================================================
        self.data_assistant = LlmAgent(
            model="gemini-3-flash-preview",
            name="DataAssistant", 
            description="Manages data artifacts and report blocks. Use to list/get artifacts and add content to the report.",
            instruction="""You manage data artifacts and report blocks.

Available tools:
- get_artifacts(): List all saved data artifacts
- get_artifact_data(artifact_id): Get full data from a specific artifact  
- add_block(block_type, content, title): Add content to the report canvas

Block types:
- 'text': For written analysis and summaries (supports markdown)
- 'chart': For images (base64 encoded)
- 'kpi': For key metrics (e.g. "Total Revenue: $1.2M")
- 'table': For tabular data (JSON string)

IMPORTANT formatting rules for 'text' blocks:
- Use markdown formatting (headers, bold, lists)
- Create SEPARATE blocks for each major section
- For an executive summary, create ONE text block
- For insights/analysis, create ANOTHER text block
- Do NOT combine everything into one giant block
- Use proper markdown:
  * ## for section headers
  * **bold** for emphasis
  * - or * for bullet lists
  * 1. 2. 3. for numbered lists

Example text block content:
'''
## Key Findings

The analysis reveals three major trends:

1. **Revenue Growth**: 23% increase YoY
2. **Top Performer**: Carhartt leads with $31.4K
3. **Seasonal Peak**: December shows highest volume

### Recommendations
- Focus inventory on top 3 brands
- Increase marketing spend in Q4
'''

Always call get_artifacts() first to see what data is available.""",
            tools=[
                self.get_artifacts,
                self.get_artifact_data,
                self.add_block,
            ],
        )
        
        # =====================================================
        # Agent 3: ReportWriter (orchestrator with AgentTools)
        # =====================================================
        self.report_writer = LlmAgent(
            model="gemini-3-flash-preview",
            name="ReportWriter",
            description="Main report generation agent that orchestrates data retrieval and code execution.",
            instruction="""You are a report generation AI for Lunara BI.

You have two specialized assistants available as tools:
1. **DataAssistant** - Use to list/get artifacts and add blocks to the report
2. **CodeExecutor** - Use to run Python code for analysis and charts

Workflow:
1. Call DataAssistant to list available artifacts
2. Call DataAssistant to get specific artifact data
3. Call CodeExecutor with the data to create analysis/charts
4. Call DataAssistant to add the results as SEPARATE blocks

IMPORTANT - Report Structure:
- Create SEPARATE blocks for each section (don't dump everything in one block)
- Use descriptive titles for each block
- Structure a typical report as:
  1. Executive Summary block (key highlights)
  2. Chart block (visualization)
  3. Analysis block (detailed insights)
  4. Recommendations block (action items)

Be helpful, insightful, and create professional visualizations.
When the user asks for a report, coordinate between your assistants to build it.""",
            tools=[
                agent_tool.AgentTool(agent=self.data_assistant),
                agent_tool.AgentTool(agent=self.code_executor),
            ],
        )
        
        # Session service removed - InMemoryRunner handles it internally
    
    # =========================================================
    # Tools for DataAssistant
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
            artifact_id: ID of the artifact to retrieve.
            
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
    
    # =========================================================
    # Service methods
    # =========================================================
    
    def get_report_blocks(self) -> List[Dict]:
        """Get all blocks added to the report."""
        return self._report_blocks
    
    def clear_blocks(self):
        """Clear all report blocks."""
        self._report_blocks = []
    
    async def initialize(self, user_id: str = "default"):
        """Initialize runner and session."""
        self._user_id = user_id
        if self._runner is None:
            # Create services
            session_service = InMemorySessionService()
            artifact_service = InMemoryArtifactService()
            
            # Create Runner with both services
            self._runner = Runner(
                agent=self.report_writer,
                app_name="lunara_reports",
                session_service=session_service,
                artifact_service=artifact_service,
            )
            
            # Create session
            session = await session_service.create_session(
                app_name="lunara_reports",
                user_id=self._user_id,
                state={"blocks": []}
            )
            self._session_id = session.id
            print(f"✓ Report Agent: Created session {self._session_id} for user {self._user_id}")
    
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
                            import base64
                            image_data = part.inline_data.data
                            
                            # DEBUG: Log what we're getting
                            print(f"🖼️ INLINE_DATA DEBUG:")
                            print(f"   Type: {type(image_data)}")
                            print(f"   Is bytes: {isinstance(image_data, bytes)}")
                            if isinstance(image_data, bytes):
                                print(f"   Bytes len: {len(image_data)}, preview: {image_data[:50]}")
                            else:
                                print(f"   String value: {str(image_data)[:100]}")
                            print(f"   MIME: {part.inline_data.mime_type}")
                            
                            if isinstance(image_data, bytes):
                                image_data = base64.b64encode(image_data).decode()
                            
                            print(f"   Final data len: {len(image_data) if image_data else 0}")
                            
                            yield {
                                "type": "image",
                                "mime_type": part.inline_data.mime_type,
                                "data": image_data
                            }
                            # Also add as a block
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
        
        # After generation, try to fetch any NEW artifacts saved by CodeExecutor
        try:
            if self._runner and self._runner.artifact_service:
                artifact_names = await self._runner.artifact_service.list_artifact_keys(
                    app_name="lunara_reports",
                    user_id=self._user_id,
                    session_id=self._session_id,
                )
                
                print(f"🎨 DEBUG: Found {len(artifact_names)} artifacts: {artifact_names}")
                
                for artifact_name in artifact_names:
                    # Skip artifacts we've already processed
                    if artifact_name in self._seen_artifacts:
                        print(f"  ⏭️ Skipping already seen: {artifact_name}")
                        continue
                    
                    # Mark as seen
                    self._seen_artifacts.add(artifact_name)
                    
                    # Fetch the artifact
                    artifact_part = await self._runner.artifact_service.load_artifact(
                        app_name="lunara_reports",
                        user_id=self._user_id,
                        session_id=self._session_id,
                        filename=artifact_name,
                    )
                    
                    print(f"  📦 Artifact: {artifact_name}")
                    print(f"     Type: {type(artifact_part)}")
                    print(f"     Has inline_data: {hasattr(artifact_part, 'inline_data')}")
                    if hasattr(artifact_part, 'inline_data') and artifact_part.inline_data:
                        print(f"     inline_data.data type: {type(artifact_part.inline_data.data)}")
                        print(f"     inline_data.mime_type: {artifact_part.inline_data.mime_type}")
                        data_sample = artifact_part.inline_data.data
                        if isinstance(data_sample, bytes):
                            print(f"     Data (bytes): len={len(data_sample)}, preview={data_sample[:50]}")
                        else:
                            print(f"     Data (other): {str(data_sample)[:100]}")
                    
                    if artifact_part and hasattr(artifact_part, 'inline_data') and artifact_part.inline_data:
                        import base64
                        image_data = artifact_part.inline_data.data
                        if isinstance(image_data, bytes):
                            image_data = base64.b64encode(image_data).decode()
                        
                        print(f"     ✅ Final image_data length: {len(image_data) if image_data else 0}")
                        
                        yield {
                            "type": "image",
                            "mime_type": artifact_part.inline_data.mime_type,
                            "data": image_data,
                            "filename": artifact_name,
                        }
                        
                        # Add as a block with better title
                        self._report_blocks.append({
                            "id": len(self._report_blocks) + 1,
                            "type": "chart",
                            "title": "Generated Chart",  # Can be improved with context
                            "content": image_data,
                            "created_at": datetime.now().isoformat(),
                        })
        except Exception as e:
            print(f"Warning: Failed to retrieve artifacts: {e}")
        
        # After generation, yield any new blocks
        for block in self._report_blocks:
            yield {
                "type": "block",
                "block": block
            }
