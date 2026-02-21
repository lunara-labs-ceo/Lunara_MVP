# ADK Session Persistence — Implementation Plan

## Background

The Google Agent Development Kit (ADK) has a built-in session system that tracks the full
conversation history natively — every user turn, agent response, tool call, and code execution
result is stored as a sequence of events in the session. This is the intended way to give ADK
agents multi-turn conversational memory.

Currently, Lunara's chat agent bypasses this in favour of a manual approach. This document
explains why, what the proper approach looks like, and exactly how to implement it.

---

## Current Approach (and Its Limitations)

### What we do today

**File:** `backend/services/chat_agent.py`

1. `ChatAgentService` is a **singleton** — one instance shared across all requests for the
   lifetime of the server process.
2. It uses `InMemorySessionService`, which stores all session state in a Python dict in RAM.
3. A dict `self._active_sessions` maps `supabase_session_id → adk_session_id` to try to
   reuse ADK sessions across HTTP requests.
4. When history needs to be injected (e.g. after a server restart wipes the in-memory state),
   `_build_history_prompt()` serialises the Supabase-stored messages as raw text and prepends
   them to the user prompt:

```
--- CONVERSATION HISTORY (for context) ---
USER: what is my top product?
ASSISTANT: Your top product is Widget A with $120k revenue.
--- END HISTORY ---

New question: show me the trend for Widget A
```

**File:** `backend/services/report_agent.py`

The report agent creates a **fresh** `InMemorySessionService` on every single API request.
There is no session reuse at all — each report generation call is fully stateless in the ADK
layer. History is injected the same way via `_build_history_prompt()`. **This is intentional
and correct for the report agent** — each generation is a one-shot task and the ADK's native
session continuity adds no value there. Do not change the report agent.

### Problems with the current chat agent approach

| Problem | Impact |
|---|---|
| Server restart wipes `InMemorySessionService` | ADK loses all conversation context; falls back to text-injected history, which degrades multi-turn quality |
| Prompt injection is not real multi-turn | ADK treats every message as a new single-turn conversation; it can't use native chain-of-thought across turns |
| `_active_sessions` dict grows unbounded | Memory leak over time as more sessions accumulate |
| Render restarts the server regularly | On Render's free/hobby tier, the server can restart every few hours, constantly invalidating in-memory state |

---

## Target Architecture

Replace `InMemorySessionService` with ADK's `DatabaseSessionService` backed by Supabase's
Postgres instance. The ADK will own conversation persistence natively — Supabase stores the
messages, and we just pass the session ID on each request.

### How ADK's DatabaseSessionService works

- Uses SQLAlchemy under the hood
- Creates its own tables (`sessions`, `events`) in the target database automatically
- On each `runner.run_async(session_id=...)` call, it loads the full event history from the DB
  and gives the agent real multi-turn context
- Survives server restarts — state is in the database, not in memory

---

## Implementation

### 1. Install dependencies

```bash
pip install psycopg2-binary sqlalchemy
```

Add to `backend/requirements.txt`:
```
psycopg2-binary>=2.9.9
sqlalchemy>=2.0.0
```

`asyncpg` is an alternative async driver — but `psycopg2-binary` is simpler and works fine
since ADK's `DatabaseSessionService` uses SQLAlchemy's sync interface internally.

### 2. Get the Supabase Postgres connection string

In the Supabase dashboard → Settings → Database → Connection string → URI (use the
"Transaction" mode pooler URL for Render, not the direct connection, to avoid connection
limits):

```
postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Add to `backend/.env`:
```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Add to Render environment variables: `DATABASE_URL` with the same value.

Add to `backend/.env.example`:
```
# Supabase Postgres — used by ADK DatabaseSessionService for chat session persistence
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@[host]:6543/postgres
```

### 3. Add `adk_session_id` to `chat_sessions` table

New migration: `backend/supabase_migrations/007_chat_sessions_add_adk_session_id.sql`

```sql
-- Add ADK session ID to chat_sessions so we can resume native ADK sessions
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS adk_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_adk_session_id
    ON chat_sessions(adk_session_id)
    WHERE adk_session_id IS NOT NULL;
```

Run this in the Supabase SQL Editor.

### 4. Refactor `backend/services/chat_agent.py`

#### 4a. Replace `InMemorySessionService` with `DatabaseSessionService`

```python
# Remove this import:
from google.adk.sessions import InMemorySessionService

# Add this import:
from google.adk.sessions import DatabaseSessionService
```

In `__init__`:
```python
import os

# Replace:
self._session_service = InMemorySessionService()

# With:
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL env var is required for chat session persistence")
self._session_service = DatabaseSessionService(db_url=database_url)
```

ADK will auto-create its own `sessions` and `events` tables in Postgres on first use.

#### 4b. Remove `_active_sessions` dict entirely

```python
# Remove:
self._active_sessions: Dict[str, str] = {}  # supabase_session_id -> adk_session_id
```

#### 4c. Simplify `_get_or_create_session`

The method currently checks `self._active_sessions` first, then tries to list existing ADK
sessions, then creates one. With `DatabaseSessionService`, session lookup is handled by the
service itself — you just call `create_session()` if you don't already know the ADK session ID,
or pass the stored one directly.

Replace the entire `_get_or_create_session` method with:

```python
async def _get_or_create_adk_session(
    self,
    supabase_session_id: Optional[str],
    adk_user: str,
) -> str:
    """
    Look up the persisted ADK session ID for this Supabase session.
    If none exists yet, create a new ADK session and return its ID.
    The caller is responsible for persisting the returned adk_session_id
    back to Supabase if it was newly created.
    """
    # Try to load an existing ADK session from the database
    # (DatabaseSessionService.get_session raises if not found)
    # We rely on the caller to pass in the stored adk_session_id when it exists.
    # If None is passed, we create a new one.
    session = await self._session_service.create_session(
        app_name="lunara_chat",
        user_id=adk_user,
        state={"messages": []},
    )
    return session.id
```

The cleaner pattern is to pass the stored `adk_session_id` from Supabase directly:

```python
async def get_or_resume_adk_session(
    self,
    supabase_session_id: str,
    stored_adk_session_id: Optional[str],
) -> str:
    """
    If a stored ADK session ID exists, verify it's still live and return it.
    Otherwise create a new ADK session and return its ID.
    """
    adk_user = f"session_{supabase_session_id}"

    if stored_adk_session_id:
        try:
            session = await self._session_service.get_session(
                app_name="lunara_chat",
                user_id=adk_user,
                session_id=stored_adk_session_id,
            )
            if session:
                return stored_adk_session_id
        except Exception:
            pass  # Session not found in DB, create a new one

    session = await self._session_service.create_session(
        app_name="lunara_chat",
        user_id=adk_user,
        state={},
    )
    return session.id
```

#### 4d. Remove `_build_history_prompt` and history injection

Once `DatabaseSessionService` is in place, the ADK loads full conversation history natively.
Remove:
- `_build_history_prompt()` method
- All history injection logic in `process_message()`
- The `history` parameter from `process_message()` (no longer needed)

The user message passed to `runner.run_async()` should just be the raw current message with
no prepended history blob.

#### 4e. Update `process_message` to persist the ADK session ID

After creating a new ADK session, persist its ID back to Supabase so we can resume it on the
next request:

```python
async def process_message(
    self,
    message: str,
    semantic_model: Optional[Dict] = None,
    session_id: Optional[str] = None,        # Supabase session UUID
    stored_adk_session_id: Optional[str] = None,  # from chat_sessions.adk_session_id
) -> AsyncGenerator[Dict[str, Any], None]:

    adk_session_id = await self.get_or_resume_adk_session(
        supabase_session_id=session_id,
        stored_adk_session_id=stored_adk_session_id,
    )

    # If we created a new ADK session, persist it back to Supabase
    if adk_session_id != stored_adk_session_id and session_id:
        yield {"type": "adk_session_id", "content": adk_session_id}
        # The API layer will save this to chat_sessions.adk_session_id

    # ... rest of the method unchanged
    async for event in self._runner.run_async(
        session_id=adk_session_id,
        user_id=f"session_{session_id or 'default'}",
        new_message=user_content,
    ):
        # ... event handling unchanged
```

### 5. Update `backend/api/v1/chat.py`

The chat API endpoint needs to:
1. Read `adk_session_id` from Supabase before calling the agent
2. Pass it to `process_message`
3. Handle the `adk_session_id` SSE event and save it back to Supabase

```python
# Before calling agent, fetch stored adk_session_id
stored_adk_session_id = None
if session_id:
    result = await supabase.from_("chat_sessions") \
        .select("adk_session_id") \
        .eq("id", session_id) \
        .single() \
        .execute()
    stored_adk_session_id = result.data.get("adk_session_id")

# In the SSE stream handler:
async for event in agent.process_message(
    message=request.message,
    session_id=session_id,
    stored_adk_session_id=stored_adk_session_id,
    ...
):
    if event["type"] == "adk_session_id":
        # Persist the new ADK session ID to Supabase
        await supabase.from_("chat_sessions") \
            .update({"adk_session_id": event["content"]}) \
            .eq("id", session_id) \
            .execute()
    else:
        yield f"data: {json.dumps(event)}\n\n"
```

### 6. Frontend — no changes needed

The frontend already passes `session_id` (the Supabase UUID) on every request. It doesn't
need to know about `adk_session_id` at all — that's an internal backend detail.

The `history` parameter can be removed from the API request body once the backend no longer
needs it, but it's safe to leave it in for backwards compatibility and simply ignore it.

---

## What Does NOT Change

| Component | Status |
|---|---|
| `report_agent.py` | **No change** — stateless per request is correct for report generation |
| `semantic_agent.py` | **No change** — single-turn, no session needed |
| `relationship_agent.py` | **No change** — single-turn, no session needed |
| Frontend (`chat_agent.html`) | **No change** — already passes `session_id` correctly |
| Supabase `chat_sessions` messages column | **Keep** — still used for the sidebar preview and session switching |

---

## Migration Path (Zero Downtime)

1. Run migration `007` in Supabase (adds nullable `adk_session_id` column — backwards compatible)
2. Deploy updated backend
3. Existing sessions: `adk_session_id` is NULL → backend creates a new ADK session on first
   message, persists the ID → subsequent messages resume that session natively
4. No history is lost — the messages JSONB column still has the full history; the first message
   after deploy injects it once via prompt if needed, then the ADK takes over

---

## Estimated Effort

- Backend refactor (`chat_agent.py` + `chat.py`): ~3 hours
- Supabase migration + env var setup: ~30 minutes
- Testing: ~1 hour

Total: ~4–5 hours
