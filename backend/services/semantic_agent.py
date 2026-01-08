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
# Look for credentials file in project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
CREDENTIALS_PATH = PROJECT_ROOT / "lunara-dev-094f5e9e682e.json"
if CREDENTIALS_PATH.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(CREDENTIALS_PATH)
    print(f"✓ Semantic Agent: Using credentials from {CREDENTIALS_PATH}")
else:
    print(f"⚠ Semantic Agent: Credentials file not found at {CREDENTIALS_PATH}")

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
        
        # Create the agent with tools
        self.agent = Agent(
            model="gemini-2.0-flash",
            name="semantic_layer_agent",
            description="Analyzes BigQuery schemas and generates semantic layer definitions",
            instruction=self._get_system_instruction(),
            tools=[
                self.get_table_schema,
                self.analyze_column,
            ],
        )
    
    def _get_system_instruction(self) -> str:
        """Get the system instruction for the agent."""
        return """You are an expert data modeler for the Lunara BI platform.

Your task is to analyze BigQuery table schemas and generate semantic layer definitions.
Think step-by-step and explain your reasoning as you analyze.

For each table:
1. First, fetch the schema using get_table_schema
2. Analyze each column to determine if it's a dimension, measure, or time column
3. Generate human-readable names and descriptions

Output your thinking in a conversational way so users can follow along:
- Start with "🔍 Analyzing table X..."
- Explain what you find: "📊 Found 5 columns..."
- Make recommendations: "💡 I recommend treating column Y as a measure because..."
- Summarize at the end: "✅ Created semantic model with X dimensions and Y measures"

Be concise but informative. Users want to see your progress."""

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
        """
        Get the schema of a BigQuery table.
        
        Args:
            table_id: Full table reference in format 'dataset.table'
            
        Returns:
            Dictionary with table schema information.
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

    def analyze_column(self, column_name: str, column_type: str, table_context: str) -> dict:
        """
        Analyze a column and suggest its semantic type.
        
        Args:
            column_name: Name of the column
            column_type: BigQuery data type
            table_context: Description of the table for context
            
        Returns:
            Suggested semantic classification for the column.
        """
        # Heuristics for column classification
        name_lower = column_name.lower()
        
        # Time columns
        if column_type in ["TIMESTAMP", "DATE", "DATETIME"] or any(
            kw in name_lower for kw in ["date", "time", "created", "updated", "at"]
        ):
            return {
                "column": column_name,
                "suggested_type": "time",
                "reason": f"Column type is {column_type} or name suggests temporal data"
            }
        
        # Measure columns (numeric that should be aggregated)
        if column_type in ["INT64", "FLOAT64", "NUMERIC", "BIGNUMERIC"]:
            if any(kw in name_lower for kw in ["amount", "price", "cost", "revenue", "count", "total", "sum", "qty", "quantity"]):
                return {
                    "column": column_name,
                    "suggested_type": "measure",
                    "suggested_aggregation": "SUM",
                    "reason": f"Numeric column '{column_name}' appears to be a measurable value"
                }
        
        # ID columns (foreign keys / dimensions)
        if any(kw in name_lower for kw in ["_id", "id_", "key", "code"]):
            return {
                "column": column_name,
                "suggested_type": "dimension",
                "reason": f"Column '{column_name}' appears to be an identifier or foreign key"
            }
        
        # Default: dimension
        return {
            "column": column_name,
            "suggested_type": "dimension",
            "reason": f"Column '{column_name}' classified as dimension by default"
        }


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
        
        # Collect table schemas for structured output
        collected_tables = []
        for table_id in tables:
            schema = self.get_table_schema(table_id)
            if "error" not in schema:
                # Classify columns
                classified_columns = []
                for col in schema.get("columns", []):
                    classification = self.analyze_column(
                        col["name"], 
                        col["type"], 
                        table_id
                    )
                    classified_columns.append({
                        "name": col["name"],
                        "type": col["type"],
                        "mode": col.get("mode", "NULLABLE"),
                        "description": col.get("description", ""),
                        "semantic_type": classification.get("suggested_type", "dimension"),
                        "aggregation": classification.get("suggested_aggregation"),
                    })
                
                collected_tables.append({
                    "table_id": table_id,
                    "name": table_id.split(".")[-1] if "." in table_id else table_id,
                    "row_count": schema.get("row_count"),
                    "columns": classified_columns,
                })
        
        # Build the prompt
        tables_str = ", ".join(tables)
        prompt = f"""Please analyze these BigQuery tables and generate a semantic layer:

Tables: {tables_str}

For each table:
1. Use get_table_schema to fetch the schema
2. Analyze each column using analyze_column to classify as dimension, measure, or time

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

