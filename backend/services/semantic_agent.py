"""
Semantic Layer Generation Agent using Google ADK.

This agent analyzes BigQuery table schemas and generates semantic layer definitions
with dimensions, measures, and time columns.
"""
from __future__ import annotations

import os
import json
from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime
from pathlib import Path

# Configure for Vertex AI before importing ADK
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

# Set up service account credentials
# Check if already set (e.g., by main.py on Render), otherwise look for local file
PROJECT_ROOT = Path(__file__).parent.parent.parent
CREDENTIALS_PATH = PROJECT_ROOT / "lunara-dev-094f5e9e682e.json"

if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    print(f"✓ Semantic Agent: Using credentials from env var")
elif CREDENTIALS_PATH.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(CREDENTIALS_PATH)
    print(f"✓ Semantic Agent: Using credentials from {CREDENTIALS_PATH}")
else:
    print(f"⚠ Semantic Agent: No credentials found")

from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types


class SemanticAgentService:
    """Service for generating semantic layers using LLM agent."""
    
    def __init__(self, bigquery_service):
        """Initialize the semantic agent.
        
        Args:
            bigquery_service: BigQueryService instance for schema access.
        """
        self.bq_service = bigquery_service
        self._runner: Optional[InMemoryRunner] = None
        self._session_id: Optional[str] = None
        self._table_cache: Dict[str, List[dict]] = {}  # Cache for LLM-classified columns
        
        # Create the agent with tools
        self.agent = Agent(
            model="gemini-3-flash-preview",
            name="semantic_layer_agent",
            description="Analyzes BigQuery schemas and generates semantic layer definitions",
            instruction=self._get_system_instruction(),
            tools=[
                self.get_table_schema,
                self.classify_table_columns,
            ],
        )
    
    def _get_system_instruction(self) -> str:
        """Get the system instruction for the agent."""
        return """You are an expert data modeler for the Lunara BI platform.

Your task is to analyze BigQuery table schemas and generate semantic layer definitions.

For each table:
1. Fetch the schema using get_table_schema
2. Analyze ALL columns together, then call classify_table_columns ONCE with a JSON array of all classifications

When classifying columns, for each column provide:
- name: column name
- semantic_type: 'dimension', 'measure', or 'time'
- description: clear, business-friendly description (e.g., "Customer's first name")
- aggregation: for measures only, specify SUM, AVG, COUNT, MIN, MAX

Output your thinking conversationally:
- "🔍 Analyzing table X with Y columns..."
- Brief summary of what you found
- "✅ Classified X dimensions, Y measures, Z time columns"

Be concise. Process each table completely before moving to the next."""

    async def initialize(self):
        """Initialize the runner and session."""
        if self._runner is None:
            self._runner = InMemoryRunner(
                agent=self.agent,
                app_name="lunara_semantic"
            )
            session = await self._runner.session_service.create_session(
                app_name="lunara_semantic",
                user_id="system",
                state={"tables_analyzed": [], "semantic_model": None}
            )
            self._session_id = session.id

    def get_table_schema(self, table_id: str) -> dict:
        """Get the schema of a BigQuery table.
        
        table_id: Full table reference in format 'dataset.table' (e.g., 'thelook_ecom.users')
        """
        if self.bq_service.client is None:
            return {"error": "Not connected to BigQuery"}
        
        try:
            table_ref = self.bq_service.client.get_table(table_id)
            columns = []
            for field in table_ref.schema:
                columns.append({
                    "name": field.name,
                    "type": field.field_type,
                    "mode": field.mode,
                    "description": field.description or ""
                })
            
            return {
                "table_id": table_id,
                "row_count": table_ref.num_rows,
                "columns": columns,
                "column_count": len(columns)
            }
        except Exception as e:
            return {"error": str(e)}

    def classify_table_columns(
        self, 
        table_id: str,
        columns: str
    ) -> dict:
        """Classify all columns in a table at once.
        
        table_id: Full table identifier (e.g., 'thelook_ecom.users')
        columns: JSON array of column classifications with name, semantic_type, description, aggregation
        """
        try:
            # Parse the JSON array of columns
            column_list = json.loads(columns) if isinstance(columns, str) else columns
            
            # Store in cache for later retrieval
            self._table_cache[table_id] = column_list
            
            # Count by type
            dimensions = sum(1 for c in column_list if c.get('semantic_type') == 'dimension')
            measures = sum(1 for c in column_list if c.get('semantic_type') == 'measure')
            time_cols = sum(1 for c in column_list if c.get('semantic_type') == 'time')
            
            return {
                "status": "success",
                "table_id": table_id,
                "columns_classified": len(column_list),
                "dimensions": dimensions,
                "measures": measures,
                "time_columns": time_cols
            }
        except json.JSONDecodeError as e:
            return {"error": f"Invalid JSON: {str(e)}"}
        except Exception as e:
            return {"error": str(e)}


    async def generate_semantic_layer(
        self,
        tables: List[str]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Generate semantic layer for the given tables, yielding events as stream.
        
        Args:
            tables: List of fully qualified table names (dataset.table)
            
        Yields:
            Stream events with progress and results.
            Final event includes type='model' with structured semantic model data.
        """
        await self.initialize()
        
        # Clear the table cache for fresh LLM classifications
        self._table_cache = {}
        
        # Build the prompt
        tables_str = ", ".join(tables)
        prompt = f"""Please analyze these BigQuery tables and generate a semantic layer:

Tables: {tables_str}

For each table:
1. Use get_table_schema to fetch the schema
2. For EACH column, call analyze_column with:
   - column_name: the column name
   - column_type: the BigQuery data type
   - table_context: the full table ID
   - description: a clear, human-readable description you generate
   - semantic_type: 'dimension', 'measure', or 'time'
   - aggregation: for measures, specify SUM, AVG, COUNT, etc.

Output your thinking step-by-step as you work. At the end, provide a summary of the semantic model you've created."""

        # Create user message
        user_content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        # Stream the agent response
        try:
            async for event in self._runner.run_async(
                session_id=self._session_id,
                user_id="system",
                new_message=user_content
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            yield {
                                "type": "text",
                                "content": part.text
                            }
                        elif hasattr(part, 'function_call') and part.function_call:
                            yield {
                                "type": "status",
                                "content": f"🔧 Calling {part.function_call.name}..."
                            }
            
            # After LLM finishes, collect structured data using cached table classifications
            collected_tables = []
            for table_id in tables:
                schema = self.get_table_schema(table_id)
                if "error" not in schema:
                    # Get LLM classifications from cache
                    llm_columns = {c.get('name'): c for c in self._table_cache.get(table_id, [])}
                    
                    classified_columns = []
                    for col in schema.get("columns", []):
                        col_name = col["name"]
                        llm_data = llm_columns.get(col_name, {})
                        
                        classified_columns.append({
                            "name": col_name,
                            "type": col["type"],
                            "mode": col.get("mode", "NULLABLE"),
                            "description": llm_data.get("description", ""),
                            "semantic_type": llm_data.get("semantic_type", "dimension"),
                            "aggregation": llm_data.get("aggregation"),
                        })
                    
                    collected_tables.append({
                        "table_id": table_id,
                        "name": table_id.split(".")[-1] if "." in table_id else table_id,
                        "row_count": schema.get("row_count"),
                        "columns": classified_columns,
                    })
            
            # Yield the structured model data for the relationship agent
            yield {
                "type": "model",
                "data": {
                    "tables": collected_tables,
                    "generated_at": datetime.utcnow().isoformat(),
                }
            }
            
            yield {"type": "done", "content": "Semantic layer generation complete!"}
            
        except Exception as e:
            yield {"type": "error", "content": str(e)}
