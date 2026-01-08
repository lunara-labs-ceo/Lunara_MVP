"""
Relationship Detection Agent using Google ADK.

This agent analyzes semantic layer definitions and uses LLM reasoning
to detect foreign key relationships between tables based on naming patterns,
data types, and database conventions.
"""
from __future__ import annotations

import os
import json
from typing import Optional, List, Dict, Any, AsyncGenerator
from pathlib import Path

# Configure for Vertex AI before importing ADK
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

# Set up service account credentials
PROJECT_ROOT = Path(__file__).parent.parent.parent
CREDENTIALS_PATH = PROJECT_ROOT / "lunara-dev-094f5e9e682e.json"
if CREDENTIALS_PATH.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(CREDENTIALS_PATH)
    print(f"✓ Relationship Agent: Using credentials from {CREDENTIALS_PATH}")
else:
    print(f"⚠ Relationship Agent: Credentials file not found at {CREDENTIALS_PATH}")

from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types


class RelationshipAgentService:
    """Service for detecting relationships between tables using LLM reasoning."""
    
    def __init__(self):
        """Initialize the relationship detection agent."""
        self._runner: Optional[InMemoryRunner] = None
        self._session_id: Optional[str] = None
        
        # Create the agent (no tools - pure LLM reasoning)
        self.agent = Agent(
            model="gemini-2.0-flash",
            name="relationship_detection_agent",
            description="Analyzes semantic models to detect foreign key relationships between tables",
            instruction=self._get_system_instruction(),
            tools=[],  # Pure reasoning, no tools needed
        )
    
    def _get_system_instruction(self) -> str:
        """Get the system instruction for the agent."""
        return """You are an expert database architect specializing in data modeling and relationship detection.

Your task is to analyze semantic layer definitions and detect foreign key relationships between tables.

ANALYSIS APPROACH:
1. Look for naming patterns that suggest relationships:
   - Column names like "customer_id" in one table likely reference "id" in a "customers" table
   - Columns ending with "_id", "_key", or "_fk" often indicate foreign keys
   - Matching column names across tables (e.g., "product_id" in multiple tables)

2. Consider data types - related columns should have compatible types

3. Use table context to infer relationships:
   - A table named "orders" likely has relationships to "customers" and "products"
   - Junction tables (like "order_items") connect multiple entities

OUTPUT FORMAT:
You MUST output your analysis in two parts:

1. First, explain your thinking briefly (2-3 sentences per relationship)

2. Then, output a JSON block with detected relationships in this exact format:
```json
{
  "relationships": [
    {
      "from_table": "dataset.orders",
      "from_column": "customer_id",
      "to_table": "dataset.customers",
      "to_column": "id",
      "relationship_type": "many-to-one",
      "confidence": "high",
      "reasoning": "customer_id naming pattern clearly references customers table"
    }
  ]
}
```

RELATIONSHIP TYPES:
- "one-to-one": Unique relationship (e.g., user to user_profile)
- "one-to-many": Parent to children (e.g., customer to orders)
- "many-to-one": Child to parent (inverse of one-to-many)
- "many-to-many": Usually through a junction table

CONFIDENCE LEVELS:
- "high": Clear naming pattern match (e.g., customer_id → customers.id)
- "medium": Likely relationship based on context/types
- "low": Possible relationship, needs user verification

Be thorough but avoid false positives. Only report relationships you're confident about."""

    async def initialize(self) -> None:
        """Initialize the runner and session."""
        if self._runner is None:
            self._runner = InMemoryRunner(
                agent=self.agent,
                app_name="lunara_relationships"
            )
            session = await self._runner.session_service.create_session(
                app_name="lunara_relationships",
                user_id="system",
                state={"relationships_detected": []}
            )
            self._session_id = session.id

    async def detect_relationships(
        self,
        semantic_model: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Detect relationships between tables in a semantic model.
        
        Args:
            semantic_model: The semantic model output from SemanticAgentService,
                           containing tables with their columns and types.
            
        Yields:
            Stream events with analysis progress and detected relationships.
        """
        await self.initialize()
        
        # Format the semantic model for the LLM
        tables_description = self._format_tables_for_prompt(semantic_model)
        
        prompt = f"""Analyze these tables from a semantic layer and detect foreign key relationships:

{tables_description}

For each potential relationship you find:
1. Briefly explain your reasoning
2. Classify the relationship type (one-to-one, one-to-many, many-to-one, many-to-many)
3. Rate your confidence (high, medium, low)

At the end, output a JSON block with all detected relationships in the specified format."""

        # Create user message
        user_content = types.Content(
            role="user",
            parts=[types.Part(text=prompt)]
        )
        
        # Track the full response to extract JSON at the end
        full_response = ""
        
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
                            full_response += part.text
                            yield {
                                "type": "text",
                                "content": part.text
                            }
            
            # Try to extract JSON from the response
            relationships = self._extract_relationships_json(full_response)
            if relationships:
                yield {
                    "type": "relationships",
                    "data": relationships
                }
            
            yield {"type": "done", "content": "Relationship detection complete!"}
            
        except Exception as e:
            yield {"type": "error", "content": str(e)}

    def _format_tables_for_prompt(self, semantic_model: Dict[str, Any]) -> str:
        """Format semantic model tables for the LLM prompt."""
        lines = []
        
        tables = semantic_model.get("tables", [])
        if not tables:
            # If no structured tables, try to use raw schema info
            tables = semantic_model.get("schemas", [])
        
        for table in tables:
            table_id = table.get("table_id") or table.get("name", "unknown")
            lines.append(f"\n### Table: {table_id}")
            
            if table.get("description"):
                lines.append(f"Description: {table['description']}")
            
            columns = table.get("columns", [])
            if columns:
                lines.append("Columns:")
                for col in columns:
                    col_name = col.get("name", "unknown")
                    col_type = col.get("type") or col.get("data_type", "unknown")
                    semantic_type = col.get("semantic_type") or col.get("suggested_type", "")
                    
                    col_line = f"  - {col_name} ({col_type})"
                    if semantic_type:
                        col_line += f" [semantic: {semantic_type}]"
                    lines.append(col_line)
        
        return "\n".join(lines)

    def _extract_relationships_json(self, response: str) -> Optional[Dict[str, Any]]:
        """Extract JSON relationship data from the LLM response."""
        try:
            # Look for JSON block in the response
            import re
            
            # Try to find JSON between ```json and ``` markers
            json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
                return json.loads(json_str)
            
            # Try to find raw JSON object
            json_match = re.search(r'\{[^{}]*"relationships"[^{}]*\[.*?\]\s*\}', response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(0))
            
            return None
        except (json.JSONDecodeError, AttributeError):
            return None
