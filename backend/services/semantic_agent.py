"""
Semantic Layer Generation Agent using Google ADK.

This agent analyzes data warehouse table schemas and generates semantic layer
definitions with dimensions, measures, and time columns.

Works with any warehouse backend that implements the WarehouseProvider protocol.
"""
from __future__ import annotations

from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime
from pydantic import BaseModel, Field
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types

from services.retry_utils import run_with_retry
from services.warehouse_provider import WarehouseProvider


class SemanticColumnOutput(BaseModel):
    """Structured output for a single column classification."""
    name: str = Field(description="Column name")
    semantic_type: str = Field(description="One of: dimension, measure, time")
    description: str = Field(description="Business-friendly description of the column")
    aggregation: Optional[str] = Field(None, description="For measures: SUM, AVG, COUNT, MIN, MAX")


class SemanticTableOutput(BaseModel):
    """Structured output for a single table's semantic layer."""
    table_id: str = Field(description="Fully qualified table name (schema.table)")
    columns: List[SemanticColumnOutput] = Field(description="Classified columns")


class SemanticLayerOutput(BaseModel):
    """Structured output from the semantic layer agent."""
    tables: List[SemanticTableOutput] = Field(description="All analyzed tables with classified columns")
    summary: str = Field(description="Brief summary of the semantic layer")


class SemanticAgentService:
    """Service for generating semantic layers using LLM agent."""

    def __init__(self, provider: WarehouseProvider):
        """Initialize the semantic agent.

        Args:
            provider: WarehouseProvider instance for schema access.
        """
        self.provider = provider
        self._runner: Optional[InMemoryRunner] = None
        self._session_id: Optional[str] = None
        self._schema_cache: Dict[str, dict] = {}  # Pre-fetched schemas from provider

        # Create the agent with tools
        self.agent = LlmAgent(
            model="gemini-3-flash-preview",
            name="semantic_layer_agent",
            description="Analyzes data warehouse schemas and generates semantic layer definitions",
            instruction=self._get_system_instruction(),
            tools=[
                self.get_table_schema,
            ],
            output_schema=SemanticLayerOutput,
            output_key="semantic_output",
        )
    
    def _get_system_instruction(self) -> str:
        """Get the system instruction for the agent."""
        dialect = self.provider.get_sql_dialect()
        return f"""You are an expert data modeler for the Lunara BI platform.

Your task is to analyze {dialect} table schemas and generate semantic layer definitions.

For each table:
1. Fetch the schema using get_table_schema
2. Analyze ALL columns and classify each as dimension, measure, or time

When classifying columns, for each column provide:
- name: column name
- semantic_type: 'dimension', 'measure', or 'time'
- description: clear, business-friendly description (e.g., "Customer's first name")
- aggregation: for measures only, specify SUM, AVG, COUNT, MIN, MAX

Column types come from {dialect}. Map them to semantic types using these guidelines:
- INTEGER, BIGINT, NUMERIC, FLOAT, DOUBLE, DECIMAL, REAL → likely 'measure' (unless it's an ID/FK)
- VARCHAR, TEXT, CHAR, STRING, BOOLEAN, ENUM → likely 'dimension'
- DATE, TIMESTAMP, DATETIME, TIME, TIMESTAMPTZ → likely 'time'
- Columns ending in '_id' or 'id' are typically 'dimension' (foreign keys), not measures

Return your analysis as structured JSON matching the output schema with all tables and their classified columns.

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

    async def _prefetch_schemas(self, tables: List[str]) -> None:
        """Pre-fetch all table schemas from the provider.

        Called before the agent runs so the synchronous get_table_schema tool
        can serve results from cache (ADK tools must be synchronous).

        Args:
            tables: List of qualified table names in 'schema.table' format.
        """
        self._schema_cache = {}
        for table_id in tables:
            try:
                schema_name, table_name = self._parse_table_id(table_id)
                result = await self.provider.get_table_schema(schema_name, table_name)
                columns = []
                for col in result.get("columns", []):
                    columns.append({
                        "name": col["name"],
                        "type": col.get("type", "UNKNOWN"),
                        "nullable": col.get("nullable", "YES"),
                        "description": col.get("description", ""),
                    })
                self._schema_cache[table_id] = {
                    "table_id": table_id,
                    "columns": columns,
                    "column_count": len(columns),
                }
            except Exception as e:
                self._schema_cache[table_id] = {"error": str(e)}

    @staticmethod
    def _parse_table_id(table_id: str) -> tuple[str, str]:
        """Parse a 'schema.table' identifier into (schema, table).

        Falls back to ('public', table_id) when there is no dot separator.
        """
        if "." in table_id:
            parts = table_id.split(".", 1)
            return parts[0], parts[1]
        return "public", table_id

    def get_table_schema(self, table_id: str) -> dict:
        """Get the schema of a data warehouse table.

        table_id: Full table reference in format 'schema.table' (e.g., 'public.users')
        """
        cached = self._schema_cache.get(table_id)
        if cached is not None:
            return cached
        return {"error": f"Schema not pre-fetched for table: {table_id}"}

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

        # Pre-fetch all schemas so the synchronous ADK tool can serve them
        await self._prefetch_schemas(tables)

        # Build the prompt
        dialect = self.provider.get_sql_dialect()
        tables_str = ", ".join(tables)
        prompt = f"""Please analyze these {dialect} tables and generate a semantic layer:

Tables: {tables_str}

For each table:
1. Use get_table_schema to fetch the schema
2. Analyze ALL columns and classify each one

Return your full analysis as structured JSON with all tables and their classified columns."""

        # Create user message
        user_content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        # Stream the agent response
        try:
            async for event in run_with_retry(
                self._runner,
                user_id="system",
                session_id=self._session_id,
                new_message=user_content,
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
            
            # Read structured output from session state
            session = await self._runner.session_service.get_session(
                app_name="lunara_semantic",
                user_id="system",
                session_id=self._session_id,
            )
            semantic_output = session.state.get("semantic_output") if session else None

            collected_tables = []
            if semantic_output and isinstance(semantic_output, dict):
                for table_data in semantic_output.get("tables", []):
                    table_id = table_data.get("table_id", "")
                    schema = self.get_table_schema(table_id)

                    # Merge LLM classifications with pre-fetched schema data
                    llm_columns = {
                        c.get("name"): c for c in table_data.get("columns", [])
                    }

                    classified_columns = []
                    for col in schema.get("columns", []):
                        col_name = col["name"]
                        llm_data = llm_columns.get(col_name, {})
                        nullable = col.get("nullable", "YES")
                        mode = "NULLABLE" if nullable == "YES" else "REQUIRED"

                        classified_columns.append({
                            "name": col_name,
                            "type": col["type"],
                            "mode": mode,
                            "description": llm_data.get("description", ""),
                            "semantic_type": llm_data.get("semantic_type", "dimension"),
                            "aggregation": llm_data.get("aggregation"),
                        })

                    collected_tables.append({
                        "table_id": table_id,
                        "name": table_id.split(".")[-1] if "." in table_id else table_id,
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
