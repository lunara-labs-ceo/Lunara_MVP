"""
Chat Agent Service using Google ADK with per-session persistence.

This agent generates SQL queries from natural language using the semantic model context.
Each Supabase chat session maps 1:1 to an ADK session for isolated conversation context.

Works with any warehouse backend that implements the WarehouseProvider protocol.
"""
from __future__ import annotations

from typing import Optional, Dict, Any, AsyncGenerator, List
from pathlib import Path

# pydantic no longer needed (output_schema removed)

# GCP credentials and config are set up by main.py before this module is imported.
from google.adk.agents import LlmAgent
from google.adk.planners import BuiltInPlanner
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types
from google.genai.types import ThinkingConfig

from services.retry_utils import run_with_retry
from services.warehouse_provider import WarehouseProvider


# SQLite database path for ADK session persistence
DB_PATH = Path(__file__).parent.parent / "lunara.db"


class ChatAgentService:
    """Service for text-to-SQL chat using LLM agent with per-session persistence."""

    def __init__(self, provider: WarehouseProvider):
        """Initialize the chat agent.

        Args:
            provider: WarehouseProvider instance for query execution and dialect info.
        """
        self.provider = provider
        self._runner: Optional[Runner] = None
        self._semantic_model: Optional[Dict] = None
        # Track which ADK sessions we've initialized (keyed by session_id)
        self._active_sessions: Dict[str, str] = {}  # supabase_session_id -> adk_session_id

        # Create the agent with tools
        # BuiltInPlanner with ThinkingConfig enables Gemini's native
        # thinking/reasoning — the model exposes its internal reasoning
        # as Part objects with thought=True, which we stream to the UI.
        self.agent = LlmAgent(
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
            ],
            planner=BuiltInPlanner(
                thinking_config=ThinkingConfig(
                    include_thoughts=True,
                    thinking_budget=2048,
                ),
            ),
        )

        # SQLite session service for ADK persistence
        self._session_service = DatabaseSessionService(
            db_url=f"sqlite:///{DB_PATH}"
        )

    # ------------------------------------------------------------------
    # SQL dialect helpers
    # ------------------------------------------------------------------

    def _quote(self, identifier: str) -> str:
        """Quote a single SQL identifier for the current dialect.

        PostgreSQL uses double quotes: "identifier"
        BigQuery uses backticks: `identifier`
        """
        dialect = self.provider.get_sql_dialect()
        if dialect == "bigquery":
            return f"`{identifier}`"
        # Default to standard SQL / PostgreSQL double-quote
        return f'"{identifier}"'

    def _quote_table(self, table: str) -> str:
        """Quote a table reference, handling schema-qualified names.

        Input formats:
          - "schema.table"  -> "schema"."table"   (PostgreSQL)
          - "schema.table"  -> `schema.table`      (BigQuery)
          - "table"         -> "table"             (PostgreSQL)
        """
        dialect = self.provider.get_sql_dialect()
        if dialect == "bigquery":
            return f"`{table}`"
        # PostgreSQL: split on dot for schema.table
        if "." in table:
            parts = table.split(".", 1)
            return f'"{parts[0]}"."{parts[1]}"'
        return f'"{table}"'

    def _get_system_instruction(self) -> str:
        """Get the system instruction for the agent."""
        dialect = self.provider.get_sql_dialect()
        dialect_upper = dialect.upper()

        if dialect == "postgresql":
            syntax_guide = (
                "- Use standard PostgreSQL SQL syntax\n"
                "- Use double quotes for identifiers: \"schema\".\"table\", \"column\"\n"
                "- Use ::TEXT for casting to text, ::FLOAT for float, ::INTEGER for integer\n"
                "- Use ILIKE for case-insensitive pattern matching\n"
                "- Use standard PostgreSQL date functions: DATE_TRUNC, EXTRACT, INTERVAL, etc.\n"
                "- Use LIMIT for row limits\n"
                "- Tables are schema-qualified: \"schema\".\"table\""
            )
        elif dialect == "bigquery":
            syntax_guide = (
                "- Use BigQuery SQL syntax\n"
                "- Use backticks for identifiers: `dataset.table`, `column`\n"
                "- Use CAST(expr AS STRING) for casting\n"
                "- Use LIKE for pattern matching (BigQuery LIKE is case-sensitive by default)\n"
                "- Use BigQuery date functions"
            )
        else:
            syntax_guide = f"- Use standard {dialect_upper} SQL syntax"

        return f"""You are **Luna**, the data analyst at Lunara. You're the user's go-to teammate for exploring their data — sharp, curious, and genuinely excited about finding insights.

## Personality
- You're a real colleague, not a chatbot. Talk like a smart analyst on the team — natural, direct, a little witty.
- Show enthusiasm when you find something interesting in the data. ("Nice — looks like Q4 revenue jumped 34%. Let me dig into what drove that.")
- Be proactive: if you spot something unexpected, call it out. If the data looks off, say so.
- Keep it conversational. No corporate speak. No "I'd be happy to assist you with that." Just talk like a person.
- Use short paragraphs. Bold key numbers or findings so they pop.
- When greeting or when there's no SQL needed, be warm but brief. Don't over-explain what you can do — just be ready.

## Your tools
1. get_semantic_context() — Understand what tables/columns exist. Always call this first.
2. lookup_column_values(table, column) — Check distinct values before filtering.
3. get_date_range(table, column) — Get date boundaries for time-based queries.
4. get_column_stats(table, column) — Get numeric stats (min/max/avg) for thresholds.
5. preview_table(table) — Peek at sample rows to understand the data shape.
6. search_value(table, column, term) — Fuzzy-search for specific values.

## Workflow
1. Call get_semantic_context to map out the data landscape
2. Use exploration tools to verify values, dates, or thresholds as needed
3. Write your response in natural markdown:
   - Explain your analysis in a conversational tone — highlight key findings, mention what you checked, suggest next steps
   - Include SQL queries as fenced code blocks using ```sql ... ``` syntax
   - You can include multiple queries if the user asks — each gets its own code block
   - If no query is needed, just respond normally without any code blocks

## SQL guidelines
- Always verify filter values with lookup_column_values or search_value
- Check date ranges before writing time-based queries
- Use get_column_stats for numeric thresholds
{syntax_guide}

## Tone examples
- Instead of "The query retrieves the top 10 customers by revenue" → "Here are your top 10 customers by revenue — looks like Acme Corp is way ahead of the pack."
- Instead of "I have generated a SQL query that calculates..." → "I pulled together a query that breaks down monthly revenue. Heads up — December looks unusually high, might be worth a closer look."
- Instead of "No data source found" → "Hmm, I don't see a connected database yet. Let's get that set up first!"
"""

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
                print(f"Restored ADK session for {key}: {adk_session_id}")
            else:
                session = await self._session_service.create_session(
                    app_name="lunara_chat",
                    user_id=adk_user,
                    state={"messages": []}
                )
                adk_session_id = session.id
                print(f"Created new ADK session for {key}: {adk_session_id}")
        except Exception as e:
            session = await self._session_service.create_session(
                app_name="lunara_chat",
                user_id=adk_user,
                state={"messages": []}
            )
            adk_session_id = session.id
            print(f"Created ADK session (fallback) for {key}: {adk_session_id}")

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
        print(f"Reset ADK session for {key}: {session.id}")
        return session.id

    def set_semantic_model(self, model: Dict):
        """Set the semantic model context for query generation."""
        self._semantic_model = model

    # ------------------------------------------------------------------
    # ADK tool methods
    # ------------------------------------------------------------------

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

    async def lookup_column_values(self, table: str, column: str, limit: int = 25) -> dict:
        """
        Get distinct values from a column. Use this to verify exact values before filtering.

        Args:
            table: Table name (e.g., 'public.products')
            column: Column name to get values from
            limit: Maximum number of values to return (default 25)

        Returns:
            List of distinct values in the column.
        """
        try:
            col_q = self._quote(column)
            tbl_q = self._quote_table(table)
            sql = (
                f"SELECT DISTINCT {col_q} FROM {tbl_q} "
                f"WHERE {col_q} IS NOT NULL "
                f"ORDER BY {col_q} LIMIT {limit}"
            )
            results = await self.provider.execute_query(sql)
            values = [row[column] for row in results]
            return {"values": values, "count": len(values)}
        except Exception as e:
            return {"error": str(e)}

    async def get_date_range(self, table: str, column: str) -> dict:
        """
        Get the min and max dates from a date/timestamp column.

        Args:
            table: Table name (e.g., 'public.orders')
            column: Date column name

        Returns:
            Min and max dates in the column.
        """
        try:
            col_q = self._quote(column)
            tbl_q = self._quote_table(table)
            dialect = self.provider.get_sql_dialect()

            if dialect == "bigquery":
                sql = (
                    f"SELECT CAST(MIN({col_q}) AS STRING) AS min_date, "
                    f"CAST(MAX({col_q}) AS STRING) AS max_date "
                    f"FROM {tbl_q}"
                )
            else:
                # PostgreSQL
                sql = (
                    f"SELECT MIN({col_q})::TEXT AS min_date, "
                    f"MAX({col_q})::TEXT AS max_date "
                    f"FROM {tbl_q}"
                )
            results = await self.provider.execute_query(sql)
            if results:
                return {
                    "min_date": str(results[0].get("min_date")),
                    "max_date": str(results[0].get("max_date"))
                }
            return {"error": "No results"}
        except Exception as e:
            return {"error": str(e)}

    async def get_column_stats(self, table: str, column: str) -> dict:
        """
        Get statistics (min, max, avg, count) for a numeric column.

        Args:
            table: Table name (e.g., 'public.order_items')
            column: Numeric column name

        Returns:
            Statistics: min, max, avg, count of the column.
        """
        try:
            col_q = self._quote(column)
            tbl_q = self._quote_table(table)
            dialect = self.provider.get_sql_dialect()

            if dialect == "bigquery":
                sql = (
                    f"SELECT "
                    f"CAST(MIN({col_q}) AS FLOAT64) AS min_val, "
                    f"CAST(MAX({col_q}) AS FLOAT64) AS max_val, "
                    f"CAST(AVG({col_q}) AS FLOAT64) AS avg_val, "
                    f"COUNT({col_q}) AS count_val "
                    f"FROM {tbl_q}"
                )
            else:
                # PostgreSQL
                sql = (
                    f"SELECT "
                    f"MIN({col_q})::FLOAT AS min_val, "
                    f"MAX({col_q})::FLOAT AS max_val, "
                    f"AVG({col_q})::FLOAT AS avg_val, "
                    f"COUNT({col_q}) AS count_val "
                    f"FROM {tbl_q}"
                )
            results = await self.provider.execute_query(sql)
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

    async def preview_table(self, table: str, limit: int = 5) -> dict:
        """
        Get sample rows from a table to understand its data format.

        Args:
            table: Table name (e.g., 'public.users')
            limit: Number of rows to return (default 5)

        Returns:
            Sample rows from the table.
        """
        try:
            tbl_q = self._quote_table(table)
            sql = f"SELECT * FROM {tbl_q} LIMIT {limit}"
            results = await self.provider.execute_query(sql)
            return {"rows": results, "count": len(results)}
        except Exception as e:
            return {"error": str(e)}

    async def search_value(self, table: str, column: str, search_term: str, limit: int = 10) -> dict:
        """
        Search for values in a column that contain the search term (case-insensitive).

        Args:
            table: Table name (e.g., 'public.users')
            column: Column to search in
            search_term: Term to search for
            limit: Maximum results to return (default 10)

        Returns:
            Matching values from the column.
        """
        try:
            col_q = self._quote(column)
            tbl_q = self._quote_table(table)
            dialect = self.provider.get_sql_dialect()
            # Escape single quotes in the search term to prevent SQL injection
            safe_term = search_term.replace("'", "''")

            if dialect == "bigquery":
                sql = (
                    f"SELECT DISTINCT {col_q} "
                    f"FROM {tbl_q} "
                    f"WHERE LOWER(CAST({col_q} AS STRING)) LIKE LOWER('%{safe_term}%') "
                    f"LIMIT {limit}"
                )
            else:
                # PostgreSQL: use ::TEXT cast and ILIKE for case-insensitive
                sql = (
                    f"SELECT DISTINCT {col_q} "
                    f"FROM {tbl_q} "
                    f"WHERE {col_q}::TEXT ILIKE '%{safe_term}%' "
                    f"LIMIT {limit}"
                )
            results = await self.provider.execute_query(sql)
            values = [row[column] for row in results]
            return {"matches": values, "count": len(values)}
        except Exception as e:
            return {"error": str(e)}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

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

        # Stream the agent response — text flows through as markdown
        # (no structured output; model writes SQL in fenced code blocks)
        try:
            async for event in run_with_retry(
                self._runner,
                user_id=f"session_{session_id or 'default'}",
                session_id=adk_session_id,
                new_message=user_content,
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            if getattr(part, 'thought', False):
                                yield {
                                    "type": "thinking",
                                    "content": part.text
                                }
                            else:
                                yield {
                                    "type": "text",
                                    "content": part.text
                                }
                        elif hasattr(part, 'function_call') and part.function_call:
                            yield {
                                "type": "status",
                                "content": f"Using {part.function_call.name}..."
                            }

            yield {"type": "done", "content": "Done"}

        except Exception as e:
            yield {"type": "error", "content": str(e)}

    async def execute_query(self, sql: str) -> Dict[str, Any]:
        """
        Execute a SQL query against the data warehouse.

        Args:
            sql: SQL query to execute

        Returns:
            Query results with columns and rows.
        """
        try:
            # Strip trailing semicolons — PostgreSQL prepared statements
            # reject multiple commands (including a bare trailing ";")
            sql = sql.strip().rstrip(";").strip()
            results = await self.provider.execute_query(sql)
            return {
                "success": True,
                "data": results
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
