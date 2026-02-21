"""
Chat Agent Service using Google ADK with per-session persistence.

This agent generates SQL queries from natural language using the semantic model context.
Each Supabase chat session maps 1:1 to an ADK session for isolated conversation context.
"""
from __future__ import annotations

import os
import json
from typing import Optional, Dict, Any, AsyncGenerator, List
from datetime import datetime
from pathlib import Path

# GCP credentials and config are set up by main.py before this module is imported.
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types


# SQLite database path for ADK session persistence
DB_PATH = Path(__file__).parent.parent / "lunara.db"


class ChatAgentService:
    """Service for text-to-SQL chat using LLM agent with per-session persistence."""
    
    def __init__(self, bigquery_service):
        """Initialize the chat agent.
        
        Args:
            bigquery_service: BigQueryService instance for query execution.
        """
        self.bq_service = bigquery_service
        self._runner: Optional[Runner] = None
        self._semantic_model: Optional[Dict] = None
        self._generated_sql: Optional[str] = None
        # Track which ADK sessions we've initialized (keyed by session_id)
        self._active_sessions: Dict[str, str] = {}  # supabase_session_id -> adk_session_id
        
        # Create the agent with tools
        self.agent = Agent(
            model="gemini-3-flash-preview",
            name="chat_agent",
            description="Generates SQL queries from natural language using semantic model context",
            instruction=self._get_system_instruction(),
            tools=[
                self.get_semantic_context,
                self.lookup_column_values,
                self.get_date_range,
                self.get_column_stats,
                self.preview_table,
                self.search_value,
                self.generate_sql,
            ],
        )
        
        # SQLite session service for ADK persistence
        self._session_service = DatabaseSessionService(
            db_url=f"sqlite:///{DB_PATH}"
        )
    
    def _get_system_instruction(self) -> str:
        """Get the system instruction for the agent."""
        return """You are an expert SQL analyst for the Lunara.

Your task is to generate accurate BigQuery SQL queries from natural language questions.

You have these tools available:

1. get_semantic_context() - Get tables, columns, relationships. Call this first.
2. lookup_column_values(table, column) - Get distinct values. Use before filtering by a categorical column.
3. get_date_range(table, column) - Get min/max dates. Use for time-based queries.
4. get_column_stats(table, column) - Get min/max/avg for numbers. Use for thresholds.
5. preview_table(table) - Get sample rows. Use to understand data format.
6. search_value(table, column, term) - Fuzzy search values. Use when user mentions a name/term.
7. generate_sql(sql, explanation) - Output the final SQL query.

Workflow:
1. Call get_semantic_context to understand available data
2. Use exploration tools to verify values, dates, or thresholds as needed
3. Generate accurate SQL with generate_sql

Guidelines:
- Always verify filter values using lookup_column_values or search_value
- Use get_date_range to understand date boundaries for time queries
- Use get_column_stats to determine reasonable thresholds
- Use proper BigQuery SQL syntax with backticks for table names
- Be concise in your explanations"""

    def _build_history_prompt(self, history: List[Dict]) -> str:
        """Build a conversation history prompt to inject context for resumed sessions."""
        if not history:
            return ""
        
        lines = ["\n\n--- CONVERSATION HISTORY (for context) ---"]
        for msg in history:
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            sql = msg.get("sql")
            lines.append(f"{role}: {content}")
            if sql:
                lines.append(f"[Generated SQL: {sql}]")
        lines.append("--- END HISTORY ---\n")
        return "\n".join(lines)

    async def _ensure_runner(self):
        """Initialize the runner if not already created."""
        if self._runner is None:
            self._runner = Runner(
                agent=self.agent,
                app_name="lunara_chat",
                session_service=self._session_service
            )

    async def _get_or_create_session(
        self,
        session_id: Optional[str] = None,
        user_id: str = "default"
    ) -> str:
        """Get or create an ADK session for the given Supabase session ID.
        
        Args:
            session_id: Supabase chat session UUID. If None, creates a default session.
            user_id: User identifier for the ADK session.
            
        Returns:
            The ADK session ID to use.
        """
        await self._ensure_runner()
        
        # Use session_id as the key, or "default" 
        key = session_id or "default"
        
        # Already tracked in this server lifecycle
        if key in self._active_sessions:
            return self._active_sessions[key]
        
        # Use the supabase session_id directly as the ADK session user_id
        # so sessions are isolated per chat
        adk_user = f"session_{key}"
        
        try:
            # Check if ADK already has a session for this user
            sessions = await self._session_service.list_sessions(
                app_name="lunara_chat",
                user_id=adk_user
            )
            if sessions:
                adk_session_id = sessions[0].id
                print(f"✓ Restored ADK session for {key}: {adk_session_id}")
            else:
                session = await self._session_service.create_session(
                    app_name="lunara_chat",
                    user_id=adk_user,
                    state={"messages": []}
                )
                adk_session_id = session.id
                print(f"✓ Created new ADK session for {key}: {adk_session_id}")
        except Exception as e:
            session = await self._session_service.create_session(
                app_name="lunara_chat",
                user_id=adk_user,
                state={"messages": []}
            )
            adk_session_id = session.id
            print(f"✓ Created ADK session (fallback) for {key}: {adk_session_id}")
        
        self._active_sessions[key] = adk_session_id
        return adk_session_id

    async def reset_session(self, session_id: Optional[str] = None):
        """Create a fresh ADK session for a new chat.
        
        Args:
            session_id: Supabase session ID to reset.
        """
        await self._ensure_runner()
        
        key = session_id or "default"
        adk_user = f"session_{key}"
        
        session = await self._session_service.create_session(
            app_name="lunara_chat",
            user_id=adk_user,
            state={"messages": []}
        )
        self._active_sessions[key] = session.id
        print(f"✓ Reset ADK session for {key}: {session.id}")
        return session.id

    def set_semantic_model(self, model: Dict):
        """Set the semantic model context for query generation."""
        self._semantic_model = model

    def get_semantic_context(self) -> dict:
        """
        Get the semantic model context for SQL generation.
        
        Returns:
            Dictionary containing tables, columns, relationships, and their meanings.
        """
        if not self._semantic_model:
            return {"error": "No semantic model loaded"}
        
        # Format the semantic model for the LLM
        context = {
            "tables": [],
            "relationships": self._semantic_model.get("relationships", [])
        }
        
        for table in self._semantic_model.get("tables", []):
            table_info = {
                "name": table.get("table_id", table.get("name")),
                "columns": []
            }
            for col in table.get("columns", []):
                table_info["columns"].append({
                    "name": col["name"],
                    "type": col.get("type", "STRING"),
                    "semantic_type": col.get("semantic_type", "dimension"),
                    "description": col.get("description", ""),
                    "aggregation": col.get("aggregation")
                })
            context["tables"].append(table_info)
        
        return context

    def generate_sql(self, sql_query: str, explanation: str = "") -> dict:
        """
        Store the generated SQL query.
        
        Args:
            sql_query: The SQL query to execute
            explanation: Brief explanation of what the query does
            
        Returns:
            Confirmation that SQL was generated.
        """
        self._generated_sql = sql_query
        return {
            "status": "success",
            "sql": sql_query,
            "explanation": explanation
        }

    def lookup_column_values(self, table: str, column: str, limit: int = 25) -> dict:
        """
        Get distinct values from a column. Use this to verify exact values before filtering.
        
        Args:
            table: Table name (e.g., 'thelook_ecom.products')
            column: Column name to get values from
            limit: Maximum number of values to return (default 25)
            
        Returns:
            List of distinct values in the column.
        """
        try:
            sql = f"SELECT DISTINCT `{column}` FROM `{table}` WHERE `{column}` IS NOT NULL LIMIT {limit}"
            results = self.bq_service.execute_query(sql)
            values = [row[column] for row in results]
            return {"values": values, "count": len(values)}
        except Exception as e:
            return {"error": str(e)}

    def get_date_range(self, table: str, column: str) -> dict:
        """
        Get the min and max dates from a date/timestamp column.
        
        Args:
            table: Table name (e.g., 'thelook_ecom.orders')
            column: Date column name
            
        Returns:
            Min and max dates in the column.
        """
        try:
            sql = f"SELECT MIN(`{column}`) as min_date, MAX(`{column}`) as max_date FROM `{table}`"
            results = self.bq_service.execute_query(sql)
            if results:
                return {
                    "min_date": str(results[0].get("min_date")),
                    "max_date": str(results[0].get("max_date"))
                }
            return {"error": "No results"}
        except Exception as e:
            return {"error": str(e)}

    def get_column_stats(self, table: str, column: str) -> dict:
        """
        Get statistics (min, max, avg, count) for a numeric column.
        
        Args:
            table: Table name (e.g., 'thelook_ecom.order_items')
            column: Numeric column name
            
        Returns:
            Statistics: min, max, avg, count of the column.
        """
        try:
            sql = f"""
                SELECT 
                    MIN(`{column}`) as min_val,
                    MAX(`{column}`) as max_val,
                    AVG(`{column}`) as avg_val,
                    COUNT(`{column}`) as count_val
                FROM `{table}`
            """
            results = self.bq_service.execute_query(sql)
            if results:
                return {
                    "min": results[0].get("min_val"),
                    "max": results[0].get("max_val"),
                    "avg": round(results[0].get("avg_val", 0), 2),
                    "count": results[0].get("count_val")
                }
            return {"error": "No results"}
        except Exception as e:
            return {"error": str(e)}

    def preview_table(self, table: str, limit: int = 5) -> dict:
        """
        Get sample rows from a table to understand its data format.
        
        Args:
            table: Table name (e.g., 'thelook_ecom.users')
            limit: Number of rows to return (default 5)
            
        Returns:
            Sample rows from the table.
        """
        try:
            sql = f"SELECT * FROM `{table}` LIMIT {limit}"
            results = self.bq_service.execute_query(sql)
            return {"rows": results, "count": len(results)}
        except Exception as e:
            return {"error": str(e)}

    def search_value(self, table: str, column: str, search_term: str, limit: int = 10) -> dict:
        """
        Search for values in a column that contain the search term (case-insensitive).
        
        Args:
            table: Table name (e.g., 'thelook_ecom.users')
            column: Column to search in
            search_term: Term to search for
            limit: Maximum results to return (default 10)
            
        Returns:
            Matching values from the column.
        """
        try:
            sql = f"""
                SELECT DISTINCT `{column}` 
                FROM `{table}` 
                WHERE LOWER(CAST(`{column}` AS STRING)) LIKE LOWER('%{search_term}%')
                LIMIT {limit}
            """
            results = self.bq_service.execute_query(sql)
            values = [row[column] for row in results]
            return {"matches": values, "count": len(values)}
        except Exception as e:
            return {"error": str(e)}

    def get_last_sql(self) -> Optional[str]:
        """Get the last generated SQL query."""
        return self._generated_sql

    async def chat(
        self,
        message: str,
        semantic_model: Optional[Dict] = None,
        session_id: Optional[str] = None,
        history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a chat message and generate SQL.
        
        Args:
            message: User's natural language question
            semantic_model: Optional semantic model to use for context
            session_id: Supabase session ID for isolated conversation context
            history: Previous messages in this session for context injection
            
        Yields:
            Stream events with response text and generated SQL.
        """
        adk_session_id = await self._get_or_create_session(session_id)
        
        if semantic_model:
            self.set_semantic_model(semantic_model)
        
        # Reset generated SQL
        self._generated_sql = None
        
        # If we have history and this is a fresh ADK session (server restarted),
        # prepend history context so the agent knows what was discussed before
        user_message = message
        if history and len(history) > 0:
            # Check if this ADK session has prior turns by seeing if it's newly created
            try:
                adk_user = f"session_{session_id or 'default'}"
                session_obj = await self._session_service.get_session(
                    app_name="lunara_chat",
                    user_id=adk_user,
                    session_id=adk_session_id
                )
                # If session has no events/turns, inject history
                has_turns = bool(session_obj and hasattr(session_obj, 'events') and session_obj.events)
                if not has_turns:
                    history_context = self._build_history_prompt(history)
                    user_message = f"{history_context}\nNew question: {message}"
            except Exception:
                # If we can't check, inject history to be safe
                history_context = self._build_history_prompt(history)
                user_message = f"{history_context}\nNew question: {message}"
        
        # Create user message
        user_content = types.Content(
            role="user",
            parts=[types.Part(text=user_message)]
        )
        
        # Stream the agent response
        try:
            async for event in self._runner.run_async(
                session_id=adk_session_id,
                user_id=f"session_{session_id or 'default'}",
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
                                "content": f"🔧 {part.function_call.name}..."
                            }
            
            # Yield the generated SQL if available
            if self._generated_sql:
                yield {
                    "type": "sql",
                    "content": self._generated_sql
                }
            
            yield {"type": "done", "content": "Query generated!"}
            
        except Exception as e:
            yield {"type": "error", "content": str(e)}

    async def execute_query(self, sql: str) -> Dict[str, Any]:
        """
        Execute a SQL query against BigQuery.
        
        Args:
            sql: SQL query to execute
            
        Returns:
            Query results with columns and rows.
        """
        try:
            results = self.bq_service.execute_query(sql)
            return {
                "success": True,
                "data": results
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

