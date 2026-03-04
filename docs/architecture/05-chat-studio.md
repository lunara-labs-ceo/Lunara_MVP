# 05 — Chat Studio: Sessions, Context Windows & Artifacts

**Scope:** How chat sessions bind to semantic models, how the user manages multiple chats, how artifacts are organized, and how the chat agent becomes warehouse-agnostic.

**Depends on:** 04 (Semantic studio — models must exist before chat can use them)

---

## Current State

### Chat Agent (`chat_agent.py`)

- `ChatAgentService` — singleton, uses Google ADK + Gemini.
- 7 tools: `get_semantic_context`, `lookup_column_values`, `get_date_range`, `get_column_stats`, `preview_table`, `search_value`, `generate_sql`.
- All tool methods construct **BigQuery-specific SQL** (backticks, `CAST(...AS STRING)`).
- Semantic model passed per-call via request body.
- Sessions persisted in SQLite (`lunara.db`) via `DatabaseSessionService`.

### Chat API (`api/v1/chat.py`)

- `POST /chat/query` — streams text + SQL via SSE.
- `POST /chat/execute` — executes SQL against BigQuery.
- **No `project_id`**, no `data_source_id`, no `session_id` in request model (session_id is optional).
- Uses global `BigQueryService` singleton for execution.

### `chat_sessions` Table (Migration 004)

```
chat_sessions
  id UUID PK
  project_id UUID NOT NULL           ← becomes nullable (doc 02)
  name TEXT ('New Chat')
  messages JSONB
  semantic_model_id UUID → semantic_models(id) SET NULL    ← EXISTS!
  created_by TEXT
  created_at, updated_at
```

**Key finding:** `semantic_model_id` FK already exists. The schema already supports binding a chat to a specific model. But the API doesn't use it — the semantic model is passed in the request body.

### `chat_artifacts` Table (Migration 004)

```
chat_artifacts
  id UUID PK
  project_id UUID NOT NULL           ← becomes nullable (doc 02)
  session_id UUID → chat_sessions(id) SET NULL
  title TEXT
  sql TEXT
  data JSONB
  created_by TEXT
  created_at
```

**Missing:** No `semantic_model_id` or `data_source_id` on artifacts. Can't trace an artifact back to its context.

---

## Problems to Solve

1. **Which semantic model is this chat using?** The `semantic_model_id` FK exists but isn't populated by the API. The model is passed in the request body each time, with no guarantee it's the same model across turns.

2. **Which data source should the agent query?** Chat tools call `bigquery_service.execute_query()` directly. With multiple connections, the agent needs to know which provider to use.

3. **SQL dialect mismatch.** Chat tool methods hardcode BigQuery syntax. A PostgreSQL data source would get incorrect SQL.

4. **Session organization.** The current UI is a single-session experience. There's no session list, no way to switch between conversations, no way to see which model a session used.

5. **Artifact organization.** Artifacts are flat — listed by project, not grouped by session or model. The report builder needs to find relevant artifacts but has no way to filter.

6. **Session ↔ model binding.** If a user changes their semantic model mid-conversation, the context window becomes incoherent (earlier messages assumed a different schema). Should model changes start a new session?

---

## Proposed Design

### 1. Session Context: Model + Data Source Binding

When a user starts a new chat, they select a semantic model. The session is permanently bound to that model and its data source:

```python
# Creating a new chat session
session = supabase.table("chat_sessions").insert({
    "organization_id": user.org_id,
    "project_id": project_id,           # nullable
    "semantic_model_id": model_id,       # REQUIRED for new sessions
    "data_source_id": model.data_source_id,  # inherited from model
    "name": "New Chat",
    "messages": [],
    "created_by": user.user_id,
}).execute()
```

**The model cannot be changed mid-session.** If the user wants to chat with a different model, they start a new session. This keeps the context window coherent — every message in a session was generated with the same schema context.

### 2. Chat Agent Becomes Warehouse-Agnostic

The chat agent receives a `WarehouseProvider` instead of a `BigQueryService`:

```python
class ChatAgentService:
    def __init__(self, provider: WarehouseProvider, sql_dialect: str):
        self.provider = provider
        self.sql_dialect = sql_dialect
```

Tool methods use the provider for query execution and adapt SQL syntax:

```python
# Before (BigQuery-specific)
async def lookup_column_values(self, table: str, column: str, limit: int = 20):
    sql = f"SELECT DISTINCT `{column}` FROM `{table}` WHERE `{column}` IS NOT NULL LIMIT {limit}"
    return self.bigquery_service.execute_query(sql)

# After (dialect-aware)
async def lookup_column_values(self, table: str, column: str, limit: int = 20):
    q = self._quote  # dialect-aware identifier quoting
    sql = f"SELECT DISTINCT {q(column)} FROM {q(table)} WHERE {q(column)} IS NOT NULL LIMIT {limit}"
    return await self.provider.execute_query(sql)

def _quote(self, identifier: str) -> str:
    """Quote a table or column name for the current dialect."""
    if self.sql_dialect == "bigquery":
        return f"`{identifier}`"
    else:
        # PostgreSQL, Snowflake, Redshift use double quotes
        return f'"{identifier}"'
```

The agent's system prompt also includes the dialect:

```python
CHAT_AGENT_INSTRUCTION = f"""
You are a SQL analyst. The user's data is in a {self.sql_dialect} database.

When generating SQL:
- Use {self.sql_dialect} syntax
- Quote identifiers with {"backticks (`)" if self.sql_dialect == "bigquery" else 'double quotes (")'}
- For string casting use {"CAST(col AS STRING)" if self.sql_dialect == "bigquery" else "col::TEXT"}
- For date functions use {self.sql_dialect}-native functions
...
"""
```

### 3. Chat Agent Is No Longer a Singleton

Like the semantic agent, the chat agent must be instantiated per-session because each session may use a different data source:

```python
# api/v1/chat.py
@router.post("/chat/query")
async def chat_query(
    request: ChatRequest,
    user: ClerkUser = Depends(get_current_user),
    conn_manager: ConnectionManager = Depends(get_connection_manager),
):
    # Load session to get data_source_id
    session = supabase.table("chat_sessions") \
        .select("semantic_model_id, data_source_id") \
        .eq("id", request.session_id) \
        .eq("organization_id", user.org_id) \
        .single().execute()

    provider = await conn_manager.get_provider(session.data["data_source_id"])
    agent = ChatAgentService(provider, provider.get_sql_dialect())

    # Load semantic model
    model = supabase.table("semantic_models") \
        .select("model") \
        .eq("id", session.data["semantic_model_id"]) \
        .single().execute()

    # Stream response
    return EventSourceResponse(
        agent.chat(request.message, model.data["model"], request.session_id, request.history)
    )
```

### 4. Chat Studio UX: The Two-Panel Layout

```
┌──────────────────┬──────────────────────────────────────────┐
│   SESSIONS       │   CHAT AREA                              │
│                  │                                          │
│  🔍 Search...    │  Model: Sales Analytics (BigQuery)       │
│                  │  ─────────────────────────────────────── │
│  ┌────────────┐  │                                          │
│  │ Revenue    │◄─│  User: Show me monthly revenue           │
│  │ Analysis   │  │                                          │
│  │ Mar 4, 2:30│  │  Agent: Here's the SQL for monthly...    │
│  └────────────┘  │  ┌──────────────────────────────────┐   │
│                  │  │ SELECT                            │   │
│  ┌────────────┐  │  │   DATE_TRUNC(order_date, MONTH)  │   │
│  │ User       │  │  │   AS month,                      │   │
│  │ Retention  │  │  │   SUM(total) AS revenue           │   │
│  │ Mar 3, 5pm │  │  │ FROM `orders`                    │   │
│  └────────────┘  │  │ GROUP BY 1                       │   │
│                  │  └──────────────────────────────────┘   │
│  ┌────────────┐  │                                          │
│  │ Product    │  │  [▶ Run]  [💾 Save as Artifact]         │
│  │ Mix Q4     │  │                                          │
│  │ Mar 1      │  │  ┌─────────────────────────────────┐    │
│  └────────────┘  │  │ Results Table                    │    │
│                  │  │ month    │ revenue               │    │
│  [+ New Chat]    │  │ 2026-01  │ $142,350              │    │
│                  │  │ 2026-02  │ $168,420              │    │
│                  │  └─────────────────────────────────┘    │
│                  │                                          │
│                  │  Mode: [Ask] [Plan] [Agent]              │
│                  │  ┌──────────────────────────────────┐   │
│                  │  │ Ask a question...            [→] │   │
│                  │  └──────────────────────────────────┘   │
└──────────────────┴──────────────────────────────────────────┘
```

### Session List Behavior

- **Left sidebar:** Lists all chat sessions for the org (or filtered by project).
- **Each card shows:** Session name, semantic model name, last activity time.
- **"+ New Chat"** button at bottom → opens model selector.
- **Clicking a session** loads its messages, SQL editor state, and results.
- **Search** filters by session name or content.

### Starting a New Chat

```
User clicks "+ New Chat"
  → Modal/dropdown: "Select a Semantic Model"
    ├── Sales Analytics (BigQuery · 12 tables)
    ├── User Events (PostgreSQL · 5 tables)
    └── [No models yet? "Create one in Semantic Studio →"]
  → User selects model
  → New session created with semantic_model_id + data_source_id
  → Chat area opens, ready for first question
```

**Why select model first, not data source?**
- The semantic model IS the context window. It defines what the agent knows about.
- The data source is implicit — it comes from the model's `data_source_id`.
- Users think in terms of "I want to analyze sales data" not "I want to query BigQuery."

### 5. Artifact Organization

Artifacts are saved query results. Currently they're flat. We need better organization:

#### Artifact Card (In Session Context)

When viewing a chat session, saved artifacts appear as cards in the conversation:

```
  Agent: Here's the revenue data...

  ┌──────────────────────────────────────┐
  │ 📊 Monthly Revenue 2026              │
  │ SQL: SELECT DATE_TRUNC(order_da...   │
  │ 8 rows · Saved Mar 4, 2:35 PM       │
  │ [View Data] [Use in Report] [Delete] │
  └──────────────────────────────────────┘
```

#### Artifact Browser (Cross-Session)

A separate view showing all artifacts in the org, filterable:

```
/studio/chat/artifacts  (or sidebar tab)

  Filter: [All Models ▼] [All Sessions ▼] [Date Range]

  ┌────────────────────────────────────────────────────┐
  │ Monthly Revenue 2026                               │
  │ Model: Sales Analytics · Session: Revenue Analysis │
  │ 8 rows · Mar 4, 2:35 PM                           │
  ├────────────────────────────────────────────────────┤
  │ Top 10 Customers                                   │
  │ Model: Sales Analytics · Session: Revenue Analysis │
  │ 10 rows · Mar 4, 2:20 PM                          │
  ├────────────────────────────────────────────────────┤
  │ Daily Active Users                                 │
  │ Model: User Events · Session: User Retention       │
  │ 30 rows · Mar 3, 5:10 PM                          │
  └────────────────────────────────────────────────────┘
```

#### Why This Matters for Reports

The Report Studio (doc 06) needs to select input data. With artifact organization:
- User can browse artifacts by model/session.
- User can see which SQL generated the data.
- User can pick multiple artifacts from different sessions as report inputs.

### 6. Updated API Endpoints

```
POST /api/v1/chat/sessions
  Body: { semantic_model_id, name?, project_id? }
  Auth: Clerk JWT, verify model belongs to org
  → Creates session with model + data_source binding
  → Returns session_id

GET /api/v1/chat/sessions
  Query: ?project_id=xxx&model_id=xxx (optional filters)
  Auth: Clerk JWT, filter by org_id
  → Returns session list with model names

GET /api/v1/chat/sessions/{id}
  Auth: Clerk JWT, verify org ownership
  → Returns session with messages

DELETE /api/v1/chat/sessions/{id}
  Auth: Clerk JWT
  → Deletes session (artifacts preserved with session_id SET NULL)

PUT /api/v1/chat/sessions/{id}
  Body: { name }
  Auth: Clerk JWT
  → Rename session

POST /api/v1/chat/query          ← existing, updated
  Body: { session_id, message, history? }
  Auth: Clerk JWT
  → Loads model + provider from session
  → Streams response

POST /api/v1/chat/execute        ← existing, updated
  Body: { session_id, sql }
  Auth: Clerk JWT
  → Uses session's data_source_id for provider
  → Executes SQL, returns results

POST /api/v1/chat/artifacts
  Body: { session_id, title, sql, data }
  Auth: Clerk JWT
  → Saves artifact linked to session + model + org

GET /api/v1/chat/artifacts
  Query: ?session_id=xxx&model_id=xxx (optional)
  Auth: Clerk JWT, filter by org_id
  → Returns artifact list

DELETE /api/v1/chat/artifacts/{id}
  Auth: Clerk JWT
  → Deletes artifact
```

---

## Schema Changes

### In Migration 008 (Combined)

```sql
-- Add data_source_id to chat_sessions (so agent knows which provider to use)
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS
    data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;

-- Add semantic_model_id to chat_artifacts (trace artifact back to context)
ALTER TABLE chat_artifacts ADD COLUMN IF NOT EXISTS
    semantic_model_id UUID REFERENCES semantic_models(id) ON DELETE SET NULL;

-- Add data_source_id to chat_artifacts (trace artifact back to warehouse)
ALTER TABLE chat_artifacts ADD COLUMN IF NOT EXISTS
    data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;

-- organization_id and nullable project_id already handled in 02-resource-scoping
```

### Updated Column Lists (Post-Migration)

```
chat_sessions
  id UUID PK
  organization_id TEXT NOT NULL          ← NEW (doc 02)
  project_id UUID NULLABLE               ← CHANGED (doc 02)
  semantic_model_id UUID → semantic_models  ← EXISTED (now always populated)
  data_source_id UUID → data_sources     ← NEW (this doc)
  name TEXT
  messages JSONB
  created_by TEXT
  created_at, updated_at

chat_artifacts
  id UUID PK
  organization_id TEXT NOT NULL          ← NEW (doc 02)
  project_id UUID NULLABLE               ← CHANGED (doc 02)
  session_id UUID → chat_sessions
  semantic_model_id UUID → semantic_models  ← NEW (this doc)
  data_source_id UUID → data_sources     ← NEW (this doc)
  title TEXT
  sql TEXT
  data JSONB
  created_by TEXT
  created_at
```

---

## Context Window Integrity

### The Rule

**One semantic model per session. No switching.**

If the user wants to analyze a different dataset:
- Start a new chat session.
- Select a different semantic model.
- Previous session's history remains intact.

### Why This Matters

The agent's context window includes the semantic model schema. If the model changes mid-conversation:
- Earlier SQL references tables that might not exist in the new model.
- The agent's tool call history (column lookups, schema inspections) becomes stale.
- The user's mental model of "what this chat knows" breaks.

A clean session boundary keeps everything consistent.

### What If the Semantic Model Is Updated?

If the user edits or refreshes the semantic model:
- Existing sessions still work — they reference the model by ID.
- The model JSON is loaded fresh on each request (not cached in the session).
- New tables/columns are automatically available in the next turn.
- Removed tables/columns may cause errors in old SQL — but that's expected behavior.

---

## Open Questions

1. **Session auto-naming:** Should sessions be auto-named based on the first question (e.g., "Revenue analysis" from "Show me monthly revenue")?
   - **Recommendation:** Yes. Use the LLM's response to suggest a name after the first turn. Allow manual rename.

2. **Session archiving:** What happens to old sessions? Infinite list, or auto-archive after 30 days?
   - **Recommendation:** Keep all sessions. Add date grouping in the sidebar (Today, This Week, Older). No auto-delete.

3. **Cross-model artifact use:** Can a report use artifacts from different semantic models (different data sources)?
   - **Recommendation:** Yes, but with a warning. The report won't be able to join data across models since they may be on different warehouses.

---

*Last updated: March 4, 2026*
