# Sandbox Code Executor Lifecycle Management

## Context

The report agent uses `AgentEngineSandboxCodeExecutor` which creates a GCP Vertex AI sandbox for Python code execution (chart generation). Right now the executor is instantiated at **module-level** as part of `_ANALYST_AGENT`, meaning:

1. **One sandbox for the entire server** — created on import, shared across ALL users and report sessions
2. **Sandbox leaks on every deploy** — Render restarts = old sandbox orphaned in GCP forever (no cleanup)
3. **No per-session isolation** — different users' report sessions execute code in the same sandbox
4. **Import-time side effect** — the module-level `AgentEngineSandboxCodeExecutor(agent_engine_resource_name=...)` makes a GCP API call on import, which is why `reports` is wrapped in try/except in `main.py`
5. **GCP sandbox limit** — Agent Engine has a max of ~100 concurrent sandboxes. Without cleanup, we'll hit this limit fast.

### How the executor works (from ADK 1.18.0 source)

- `AgentEngineSandboxCodeExecutor.__init__` has two paths:
  - Pass `agent_engine_resource_name` → **creates a NEW sandbox** (GCP API call)
  - Pass `sandbox_resource_name` → **reuses an EXISTING sandbox** (no API call)
- The executor stores `self.sandbox_resource_name` (e.g. `projects/.../sandboxEnvironments/789`)
- `execute_code()` runs code against that sandbox
- **No cleanup methods exist** — no `close()`, no `__del__`, no context manager
- Deletion requires manual API call: `client.agent_engines.sandboxes.delete(name=resource_name)`
- ADK has a TODO comment: `# @TODO - Add TTL for sandbox creation after it is available in SDK`

### Session = report chat window

One session = one report builder chat window. A user might have multiple sessions open across different projects. Each session gets its own sandbox while actively generating reports.

---

## Plan

### Step 1: Remove executor from module-level agent definition

**File: `backend/services/report_agent.py` (lines 69-100)**

Remove `code_executor=AgentEngineSandboxCodeExecutor(...)` from `_ANALYST_AGENT`. The agent becomes a template — executor is attached per-session at runtime.

### Step 2: Create SandboxManager class

**File: `backend/services/sandbox_manager.py` (NEW)**

A singleton that tracks all active sandboxes and handles lifecycle:

```python
class SandboxManager:
    """Manages GCP sandbox lifecycle with inactivity-based cleanup.

    Tracks active sandboxes in memory. Runs a background task that
    periodically kills sandboxes idle longer than the TTL.
    """

    def __init__(self, ttl_minutes: int = 30):
        self._ttl_minutes = ttl_minutes
        # sandbox_resource_name -> last_used timestamp
        self._active: Dict[str, datetime] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def register(self, sandbox_resource_name: str):
        """Register a sandbox as active (called on create or resume)."""
        self._active[sandbox_resource_name] = datetime.utcnow()

    def touch(self, sandbox_resource_name: str):
        """Update last-used timestamp (called on each generate_content)."""
        if sandbox_resource_name in self._active:
            self._active[sandbox_resource_name] = datetime.utcnow()

    def unregister(self, sandbox_resource_name: str):
        """Remove from tracking (called after explicit delete)."""
        self._active.pop(sandbox_resource_name, None)

    async def start(self):
        """Start the background cleanup loop."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        """Stop the cleanup loop and kill all remaining sandboxes."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
        # Shutdown: kill all tracked sandboxes
        for name in list(self._active):
            await self._delete_sandbox(name)
        self._active.clear()

    async def _cleanup_loop(self):
        """Runs every 5 minutes, kills sandboxes idle > TTL."""
        while True:
            await asyncio.sleep(300)  # 5 min check interval
            cutoff = datetime.utcnow() - timedelta(minutes=self._ttl_minutes)
            stale = [name for name, ts in self._active.items() if ts < cutoff]
            for name in stale:
                await self._delete_sandbox(name)
                self._active.pop(name, None)

    async def _delete_sandbox(self, sandbox_resource_name: str):
        """Delete a GCP sandbox. Non-fatal on failure."""
        try:
            parts = sandbox_resource_name.split("/")
            project_id, location = parts[1], parts[3]
            client = vertexai.Client(project=project_id, location=location)
            client.agent_engines.sandboxes.delete(name=sandbox_resource_name)
        except Exception as e:
            print(f"Warning: failed to delete sandbox {sandbox_resource_name}: {e}")
```

### Step 3: Add sandbox management to ReportAgentService

**File: `backend/services/report_agent.py`**

- Constructor accepts `sandbox_manager: SandboxManager` parameter
- Add method `_get_or_create_sandbox(session)` that:
  - Checks `session.state["_sandbox_resource_name"]` for a stored name
  - If found → creates executor with `sandbox_resource_name=stored_name`, calls `sandbox_manager.touch()`
  - If not found → creates executor with `agent_engine_resource_name`, stores name in session state, calls `sandbox_manager.register()`
  - Sets `stateful=True` so variables persist across code blocks

### Step 4: Create per-session agent copy in generate_content()

**File: `backend/services/report_agent.py` (in `generate_content()`)**

After session resume/creation:

```python
executor = self._get_or_create_sandbox(session)
session_analyst = _ANALYST_AGENT.model_copy(update={"code_executor": executor})
```

Use `session_analyst` for the analyst Runner instead of the module-level `_ANALYST_AGENT`.

### Step 5: Wire SandboxManager into main.py

**File: `backend/main.py`**

- Create `SandboxManager` singleton in `lifespan()` startup
- Call `sandbox_manager.start()` to begin the background cleanup task
- Wire it via DI to the reports module
- Call `sandbox_manager.stop()` in shutdown (kills all tracked sandboxes on deploy)

This also fixes sandbox leaks on Render deploys — the shutdown hook deletes all active sandboxes before the process exits.

### Step 6: Sandbox cleanup on session delete

**File: `backend/api/v1/reports.py` (in `delete_session`)**

Before deleting the ADK session:
1. Read `_sandbox_resource_name` from ADK session state
2. Call `sandbox_manager.delete_sandbox(name)` to delete from GCP
3. Call `sandbox_manager.unregister(name)` to remove from tracking
4. Then proceed with ADK session deletion as before

### Step 7: Remove try/except import guard in main.py

**File: `backend/main.py` (lines 99-103, 190-191, 250-251)**

Since there's no longer a module-level GCP API call, the import can't fail:
- Change `try: from api.v1 import reports` to a normal import
- Remove `if reports is not None:` guards

---

## Files to modify

| File | Change |
|------|--------|
| `backend/services/report_agent.py` | Remove executor from `_ANALYST_AGENT`, add `_get_or_create_sandbox()`, accept `sandbox_manager`, per-session agent copy, `stateful=True` |
| `backend/services/sandbox_manager.py` | **NEW** — SandboxManager class with tracking, TTL cleanup, shutdown cleanup |
| `backend/api/v1/reports.py` | Sandbox cleanup in `delete_session`, accept `sandbox_manager` dependency |
| `backend/main.py` | Create SandboxManager singleton, start/stop in lifespan, DI wiring, remove try/except import guard |

---

## Sandbox lifecycle (visual)

```
User opens report session
  → (no sandbox yet — created lazily)

User clicks "Generate Report"
  → _get_or_create_sandbox() creates NEW sandbox
  → sandbox_manager.register(name)
  → sandbox_resource_name stored in ADK session state
  → Analyst agent executes code in sandbox

User clicks "Refine Report"
  → _get_or_create_sandbox() reads name from session state
  → sandbox_manager.touch(name)  (resets TTL clock)
  → Same sandbox reused — variables from prior turn available

User goes idle for 30+ minutes
  → Background cleanup task detects stale sandbox
  → Sandbox DELETED from GCP
  → sandbox_manager removes from tracking
  → Session state still has the name (stale)
  → On next generate: _get_or_create_sandbox() tries to resume,
    fails (sandbox gone), creates a new one — self-healing

User deletes the session
  → delete_session reads sandbox name from session state
  → Sandbox DELETED from GCP immediately
  → sandbox_manager.unregister()

Server restarts (Render deploy)
  → lifespan shutdown → sandbox_manager.stop()
  → ALL tracked sandboxes deleted from GCP
  → On resume: session state has old name, self-healing creates new
```

---

## What this achieves

| Before | After |
|--------|-------|
| 1 sandbox for entire server | 1 sandbox per report session |
| Sandbox created on import | Sandbox created lazily on first generation |
| No cleanup — leaks forever | 3-layer cleanup: TTL (30min idle), explicit delete, shutdown |
| GCP sandbox limit will be hit | Active sandboxes bounded by concurrent users |
| All users share one sandbox | Each session isolated |
| Import failure kills reports module | No import-time GCP calls |
| `stateful=False` | `stateful=True` — variables persist across code blocks |
| Sandbox lost on restart | Self-healing: stale name detected, new sandbox created |

---

## Configuration

- `SANDBOX_TTL_MINUTES` env var (default 30) — how long an idle sandbox lives
- `SANDBOX_CLEANUP_INTERVAL_SECONDS` env var (default 300) — how often the cleanup loop runs

---

## Verification

1. **Start dev server** — confirm no GCP sandbox creation in startup logs
2. **Generate a report** — confirm sandbox created on demand, charts work, `_sandbox_resource_name` in session state
3. **Generate again in same session** — confirm sandbox REUSED (no new creation)
4. **Wait for TTL** (or set to 1 minute for testing) — confirm background task deletes idle sandbox
5. **Generate after TTL expiry** — confirm self-healing: new sandbox created transparently
6. **Delete session** — confirm sandbox deleted immediately
7. **Restart server** — confirm shutdown hook deletes all tracked sandboxes
