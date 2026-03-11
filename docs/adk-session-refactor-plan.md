# ADK Session Management Refactor

## Context

Currently we have a broken hybrid session system:
- **Chat agent** uses `DatabaseSessionService` with a local SQLite file (`lunara.db`) that was never supposed to exist. It maintains a dual-ID mapping (Supabase UUID <-> ADK session ID) in an in-memory dict, and injects conversation history as a text blob when ADK sessions are lost.
- **Report agent** creates a throwaway `InMemorySessionService` per request — zero multi-turn capability, no sandbox state persistence across turns.

This needs to become: **ADK owns session IDs, ADK handles multi-turn natively, no local SQLite, persistent sessions backed by Supabase PostgreSQL.**

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/services/chat_agent.py` | Accept injected session service, remove `DB_PATH`/`lunara.db`, remove `_active_sessions` cache, remove `_build_history_prompt`, remove history injection, simplify `chat()` |
| `backend/services/report_agent.py` | Accept injected session service + `adk_session_id`, remove per-request `InMemorySessionService`, remove `_build_history_prompt`, enable session reuse |
| `backend/api/v1/chat.py` | Look up `adk_session_id` from Supabase, persist new ADK session IDs, inject session service dependency, pre-create ADK sessions on session create, clean up on delete |
| `backend/api/v1/reports.py` | Same pattern as chat API |
| `backend/main.py` | Initialize shared `DatabaseSessionService` singleton with PostgreSQL, wire DI |
| `backend/.env.example` | Add `DATABASE_URL` |
| `render.yaml` | Add `DATABASE_URL` env var |
| `.gitignore` | Add `backend/lunara.db` |

## New File

| File | Purpose |
|------|---------|
| `backend/supabase_migrations/009_adk_session_ids.sql` | Add `adk_session_id TEXT` column to `chat_sessions` and `report_sessions` |

## File to Delete

| File | Reason |
|------|--------|
| `backend/lunara.db` | SQLite dependency being removed |

---

## Implementation Steps

### Step 1: Dependencies & Environment

- Add `DATABASE_URL` to `backend/.env.example` with comment explaining Supabase Session mode pooler (port 5432, NOT Transaction mode port 6543)
- Add `DATABASE_URL` entry to `render.yaml` backend envVars
- Add `backend/lunara.db` and `*.db` to `.gitignore`
- No new pip dependencies needed — `asyncpg` is already in `requirements.txt`, `sqlalchemy` is a transitive dep of `google-adk`

### Step 2: Supabase Migration

Create `backend/supabase_migrations/009_adk_session_ids.sql`:
- `ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS adk_session_id TEXT`
- `ALTER TABLE report_sessions ADD COLUMN IF NOT EXISTS adk_session_id TEXT`
- Add indexes on the new columns
- Backward compatible — nullable column, existing rows unaffected

### Step 3: Shared Session Service in `main.py`

In the `lifespan()` function, after Supabase client init:
- Read `DATABASE_URL` from env
- Create a `DatabaseSessionService(db_url=database_url)` singleton using `postgresql+asyncpg://` connection string
- Add `get_adk_session_service` dependency function
- Wire dependency overrides for `chat.get_adk_session_service` and `reports.get_adk_session_service`

### Step 4: Chat Agent Refactor (`chat_agent.py`)

**Remove:**
- `DB_PATH` constant (line 29)
- `self._active_sessions` dict (line 45)
- Internal `DatabaseSessionService` instantiation (lines 73-75)
- `_get_or_create_session()` method (lines 200-254)
- `reset_session()` method (lines 256-273)
- `_build_history_prompt()` method (lines 175-189)
- All history injection logic in `chat()` (lines 519-537)
- `history` parameter from `chat()` signature

**Change:**
- Constructor accepts `session_service` parameter (injected, shared singleton)
- New `get_or_resume_session(supabase_session_id, stored_adk_session_id)` method that:
  - Tries to resume existing ADK session if `stored_adk_session_id` provided
  - Falls back to creating a new session
  - Returns `(adk_session_id, is_new)` tuple
- `chat()` method takes `stored_adk_session_id` parameter instead of `history`
- Yields `{"type": "adk_session_id", "content": id}` event when a new session is created (API layer persists this)
- User message is sent as-is — no history prepending

### Step 5: Chat API Refactor (`api/v1/chat.py`)

- Add `get_adk_session_service()` placeholder dependency
- Update `_get_chat_agent()` to pass `session_service` to `ChatAgentService` constructor
- In `chat_query` endpoint:
  - Look up `adk_session_id` from Supabase `chat_sessions` table before calling agent
  - Pass it to `chat_agent.chat(stored_adk_session_id=...)`
  - Intercept `adk_session_id` events in the SSE stream and persist to Supabase (don't forward to frontend)
- In `create_session` endpoint: pre-create ADK session, store ID in Supabase
- In `delete_session` endpoint: clean up ADK session via `session_service.delete_session()`
- Keep `history` field in `ChatRequest` for backward compat (ignored by backend)

### Step 6: Report Agent Refactor (`report_agent.py`)

**Remove:**
- `from google.adk.sessions import InMemorySessionService` import
- `_build_history_prompt()` method (lines 276-287)

**Constructor changes:**
- Accept `session_service` and `adk_session_id` parameters
- Store as `self._session_service` and `self._adk_session_id`

**`generate_content()` method — detailed changes:**

Lines 308-319 (session creation) — Replace with session resume/create:
```python
# OLD: fresh InMemorySessionService per request
session_service = InMemorySessionService()
session = await session_service.create_session(...)

# NEW: resume stored session or create new one
session = None
if self._adk_session_id:
    try:
        session = await self._session_service.get_session(
            app_name=app_name, user_id=user_id,
            session_id=self._adk_session_id,
        )
    except Exception:
        pass
if session is None:
    session = await self._session_service.create_session(
        app_name=app_name, user_id=user_id, state={},
    )
    yield {"type": "adk_session_id", "content": session.id}
```

Lines 321-328 (analyst prompt) — Remove history injection:
```python
# OLD: prepends _build_history_prompt(history)
# NEW: just the prompt + artifacts — ADK session has prior turn context
analyst_prompt_text = (
    f"User request: {prompt}\n\n"
    "Artifacts JSON:\n"
    f"{json.dumps(artifacts, ensure_ascii=True)}"
)
```

Lines 334-338 (analyst runner) — Use `self._session_service`:
```python
analyst_runner = Runner(
    agent=_ANALYST_AGENT,
    app_name=app_name,
    session_service=self._session_service,  # was: local session_service
    artifact_service=artifact_service,
)
```

Lines 371-374 (read analysis state) — Use `self._session_service`:
```python
cur_session = await self._session_service.get_session(
    app_name=app_name, user_id=user_id, session_id=session.id
)
```

Lines 385-389 (reporter runner) — Same change:
```python
reporter_runner = Runner(
    agent=_REPORTER_AGENT,
    app_name=app_name,
    session_service=self._session_service,
    artifact_service=artifact_service,
)
```

Lines 453-456 (read report state) — Same change:
```python
final_session = await self._session_service.get_session(
    app_name=app_name, user_id=user_id, session_id=session.id
)
```

**Remove `history` parameter** from `generate_content()` signature — ADK handles multi-turn natively.

**Note:** Artifact service (`_make_artifact_service()`) stays per-request — it's GCS in prod (persistent) and InMemory locally (ephemeral). This is fine; chart images are embedded as base64 in the final HTML saved to Supabase `report_items`.

**Existing bugs to fix while we're here:**
- Line 460: references undefined `manifest` variable — should use `analysis_text`
- Line 490: references undefined `chart_descriptions` — should use `chart_filenames` or a fallback

### Step 7: Report API Refactor (`api/v1/reports.py`)

- Same pattern as chat API: session service DI, ADK session ID lookup/persistence/cleanup
- In `generate_content` endpoint: look up `adk_session_id` from `report_sessions`, pass to `ReportAgentService`
- In `create_session` endpoint: pre-create ADK session
- In `delete_session` endpoint: clean up ADK session

### Step 8: Cleanup

- Delete `backend/lunara.db`
- Verify `.gitignore` covers it

---

## Migration Path (Zero Downtime)

1. Run migration 009 in Supabase SQL Editor — adds nullable columns, no risk
2. Set `DATABASE_URL` env var locally and on Render (Supabase Session mode pooler URL, port 5432)
3. Deploy — ADK auto-creates its own tables (`sessions`, `events`, `app_states`, `user_states`) in Supabase PostgreSQL
4. Existing sessions: `adk_session_id` is NULL. On first message after deploy, new ADK session is created and stored. One-time loss of ADK multi-turn context for legacy sessions (Supabase message history is still visible in UI)
5. No frontend changes needed

---

## Gotchas

- **Supabase pooler mode**: MUST use Session mode (port 5432), not Transaction mode (port 6543). Transaction mode breaks SQLAlchemy prepared statements.
- **ADK table naming**: ADK creates `sessions`, `events` etc in public schema. No collision with our tables (`chat_sessions`, `report_sessions`).
- **Connection limits**: Supabase free tier ~20 connections. DatabaseSessionService default pool is fine but can be tuned if needed.

---

## Verification

1. Start backend with `DATABASE_URL` pointing to Supabase
2. Confirm ADK tables are created in Supabase (check via SQL editor)
3. Create a chat session -> verify `adk_session_id` is populated in `chat_sessions` table
4. Send multiple messages -> verify ADK handles multi-turn without history injection (agent remembers prior messages)
5. Restart backend -> send another message to the same session -> verify it resumes the ADK session (no context loss)
6. Create a report session -> verify multi-turn report refinement works
7. Confirm `lunara.db` is no longer created/used
