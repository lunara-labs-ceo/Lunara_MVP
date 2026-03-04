# Demo Mode Design (V2)

## Overview
Demo mode lets signed-in prospects use Lunara immediately without uploading BigQuery credentials.

Core requirements:
- No anonymous demo usage (must authenticate with Supabase).
- One-click activation from landing/dashboard.
- Read-only demo datasets.
- Hard server-side limits that cannot be bypassed.
- Automatic demo project expiry/cleanup.

This version replaces the previous draft and fixes the bypass/security issues.

---

## Goals and Non-Goals

### Goals
- Create or reuse one active demo project per user.
- Route demo requests to demo credentials safely.
- Enforce limits on all cost-driving endpoints (including SQL execute).
- Keep UX simple: "Try Demo" -> login -> auto-activate -> start exploring.

### Non-Goals (this iteration)
- Full multi-warehouse credential refactor for all non-demo traffic.
- Anonymous trial sessions.
- Complex quota plans per persona.

---

## Current Constraints to Respect

- Backend BigQuery service is currently singleton-style and stateful.
- Chat and semantic routes currently use long-lived singleton agent services.
- SSE endpoints are used for chat/report/semantic generation.
- Frontend fetch calls currently do not consistently send JWT auth headers.

Implication:
- Demo must not rely on mutable global prompt/connection state per request.
- We must pass authenticated context and project context into every protected API call.

---

## Architecture Decisions

### 1) Auth is mandatory for demo APIs
- `POST /api/v1/demo/activate` and `GET /api/v1/demo/status` require `Authorization: Bearer <supabase_access_token>`.
- Protected generation/execute endpoints also require JWT.

### 2) Demo project is explicit and server-owned
- Demo is represented as a normal `projects` row with `is_demo=true`.
- Activation is idempotent: return existing active demo project instead of creating unlimited new sessions.

### 3) Limits are enforced server-side and atomically
- Quota is consumed in database transaction/RPC, not in frontend.
- Frontend flags (`?demo=true`, localStorage) are cosmetic only.

### 4) Demo BigQuery client is separate from user-connected client
- Do **not** auto-connect demo credentials into the global user connection.
- Use a dedicated demo credential provider for demo projects.

### 5) No hidden bypass endpoints
- `/chat/execute` is included in limit enforcement.
- Any endpoint that can trigger BigQuery work is included in policy checks.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DEMO_MODE_ENABLED` | yes | Feature flag (`true`/`false`) |
| `DEMO_BQ_CREDENTIALS_JSON` | yes | Base64 demo service-account JSON |
| `DEMO_TTL_DAYS` | yes | Expiry window (default `7`) |
| `DEMO_LIMIT_CHAT_TURNS` | yes | Max chat generations (default `20`) |
| `DEMO_LIMIT_SQL_EXECUTES` | yes | Max SQL executions (default `10`) |
| `DEMO_LIMIT_REPORT_RUNS` | yes | Max report generations (default `2`) |
| `DEMO_LIMIT_SEMANTIC_RUNS` | yes | Max semantic generations (default `1`) |
| `DEMO_ALLOWED_DATASETS` | yes | Comma-separated dataset allowlist |

Notes:
- Demo SA permissions: `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` on demo datasets only.
- No write permissions.

---

## Database Changes

## Migration: `backend/supabase_migrations/007_demo_mode.sql`

```sql
-- 1) Mark demo projects directly on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo_origin TEXT CHECK (demo_origin IN ('landing', 'dashboard'));

-- 2) One usage row per demo project
CREATE TABLE IF NOT EXISTS demo_usage (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    chat_turns_used INTEGER NOT NULL DEFAULT 0,
    sql_executes_used INTEGER NOT NULL DEFAULT 0,
    report_runs_used INTEGER NOT NULL DEFAULT 0,
    semantic_runs_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        chat_turns_used >= 0 AND
        sql_executes_used >= 0 AND
        report_runs_used >= 0 AND
        semantic_runs_used >= 0
    )
);

-- One active demo project per user/org (enforced by activation flow + unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_usage_user_org
ON demo_usage(user_id, organization_id);

-- Keep table service-role-only
ALTER TABLE demo_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct demo_usage access" ON demo_usage;
CREATE POLICY "No direct demo_usage access" ON demo_usage
FOR ALL USING (false) WITH CHECK (false);
```

Cleanup rule:
- Expired demos are cleaned by deleting expired demo `projects` rows.
- `ON DELETE CASCADE` removes `demo_usage`, chat sessions, artifacts, report sessions, and report items via existing FKs.

---

## Backend Components

## 1) New auth helper

`backend/utils/auth.py`
- `require_user_from_bearer(...) -> AuthUser`
- Validates Supabase token via admin client.
- Returns `user_id`, `email`, `organization_id`.
- Raises `401` on missing/invalid token.

## 2) New demo service

`backend/services/demo_service.py`
- `activate_demo(user, origin) -> DemoActivationResponse`
- `get_demo_status(user_id, project_id) -> DemoStatusResponse`
- `consume_quota(user_id, project_id, action) -> QuotaResult`
- `cleanup_expired_demo_projects(user_id)` (idempotent, safe)

Quota actions:
- `chat_turn`
- `sql_execute`
- `report_run`
- `semantic_run`

## 3) New BigQuery provider

`backend/services/bigquery_provider.py`
- `get_client_for_project(project_id, user_id)`:
  - if project is demo -> use cached demo credentials client
  - else -> use existing user-connection flow
- Ensures demo and non-demo credentials cannot overwrite each other at runtime.

## 4) New demo API router

`backend/api/v1/demo.py`

### `POST /api/v1/demo/activate`
Request:
```json
{ "origin": "landing" }
```

Behavior:
1. Require JWT.
2. Cleanup expired demo projects for this user.
3. If active demo exists, return it.
4. Else create demo project + demo_usage row.
5. Return limits, usage, project info.

Response:
```json
{
  "project_id": "uuid",
  "is_new": true,
  "expires_at": "2026-03-01T10:00:00Z",
  "limits": {
    "chat_turns": 20,
    "sql_executes": 10,
    "report_runs": 2,
    "semantic_runs": 1
  },
  "usage": {
    "chat_turns_used": 0,
    "sql_executes_used": 0,
    "report_runs_used": 0,
    "semantic_runs_used": 0
  }
}
```

### `GET /api/v1/demo/status?project_id=<uuid>`
Behavior:
- Require JWT.
- Validate project ownership.
- Return `is_demo`, `expires_at`, limits, usage, remaining.

---

## Existing Endpoint Changes

All protected backend endpoints must require JWT and project scope checks.

## Chat

### `POST /api/v1/chat/query`
- Add `project_id` to request model.
- Validate user can access `project_id`.
- If demo project: `consume_quota(..., "chat_turn")`.
- Use project-scoped BigQuery client.

### `POST /api/v1/chat/execute`
- Add `project_id` to request model.
- Validate ownership.
- If demo project: `consume_quota(..., "sql_execute")`.
- Use project-scoped BigQuery client.

## Reports

### `POST /api/v1/reports/{report_id}/generate`
- Require JWT.
- Resolve `project_id` from `report_id` server-side.
- If demo project: `consume_quota(..., "report_run")`.

## Semantic

### `POST /api/v1/semantic/generate`
- Add `project_id` to request body.
- Require JWT and ownership.
- If demo project: `consume_quota(..., "semantic_run")`.

## Datasets

### `GET /api/v1/datasets?project_id=<uuid>`
### `GET /api/v1/datasets/{dataset_id}/tables?project_id=<uuid>`
- Require JWT + ownership.
- For demo projects, enforce dataset allowlist from `DEMO_ALLOWED_DATASETS`.

---

## SSE and Error Contract

For streaming endpoints, on quota hit emit:

```json
{
  "type": "demo_limit_reached",
  "content": "Demo limit reached for sql_execute",
  "action": "sql_execute",
  "used": 10,
  "limit": 10,
  "remaining": 0
}
```

Then emit `done` and close stream.

For non-streaming endpoints (example: `/chat/execute`), return HTTP `429`:

```json
{
  "error": "demo_limit_reached",
  "action": "sql_execute",
  "used": 10,
  "limit": 10
}
```

---

## Frontend Changes

## 1) `landing.html`
- Add "Try Demo" CTA in nav + hero.
- Click handler:
  - `localStorage.setItem('lunara_demo_pending', 'true')`
  - redirect to `/login.html`

## 2) `auth/callback.html`
- After org setup:
  - if `lunara_demo_pending === 'true'`:
    - clear flag
    - call `POST /api/v1/demo/activate` with JWT
    - redirect to `/semantic_layer_setup.html?project_id={id}&demo=true`
  - else normal dashboard redirect.

## 3) `dashboard.html`
- Add "Explore Demo" button.
- Call `/api/v1/demo/activate` with JWT.
- Redirect same as callback flow.

## 4) Shared API header helper
- In `chat_agent.html`, `report_builder.html`, `schema_browser.html`, `semantic_layer_setup.html`:
  - implement `getAuthHeaders()`
  - include JWT in every `/api/v1/*` call
  - include `project_id` where required.

## 5) Demo banner
- Show banner only after server confirms project is demo via `/api/v1/demo/status?project_id=...`.
- Do not trust URL `demo=true` as source of truth.
- Handle `demo_limit_reached` event with inline upgrade CTA card.

---

## Security and Abuse Controls

- JWT required for all demo-relevant endpoints.
- Project ownership check on every request.
- Quota consumed atomically server-side.
- Demo credentials are isolated from user-uploaded credentials.
- Demo datasets restricted by allowlist.
- Optional: add IP-based global throttling at edge (Render/Cloudflare) for brute-force protection.

---

## Rollout Plan

### Phase 1: Foundation (backend contract)
1. Add migration `007_demo_mode.sql`.
2. Add `utils/auth.py`, `services/demo_service.py`, `api/v1/demo.py`.
3. Register demo router in `backend/main.py`.

### Phase 2: Endpoint enforcement
1. Add JWT requirement + project checks in chat/report/semantic/datasets.
2. Add quota checks for all four demo actions.
3. Add limit event/429 contract handling.

### Phase 3: Frontend wiring
1. Landing/dashboard/callback activation flow.
2. Auth headers on all API fetch calls.
3. Add `project_id` propagation and demo banner/status.

### Phase 4: Hardening
1. Add structured logs for activate/quota/limit-hit events.
2. Add cleanup cron or lazy cleanup on activate/status.
3. Add regression tests for non-demo users.

---

## Test Plan (Must Pass)

1. New user clicks Try Demo -> signs in -> demo project created once.
2. Re-click Explore Demo -> existing active demo returned (no duplicate project).
3. Expired demo -> activation creates fresh project and old project is deleted.
4. Demo user hits each quota limit and receives proper server response.
5. `/chat/execute` is blocked at quota limit (no bypass).
6. Non-demo user flow remains unchanged.
7. Attempt to spoof another `project_id` returns `403`.
8. Demo project cannot browse non-allowlisted datasets.

---

## File Change Summary

| File | Change |
|---|---|
| `backend/supabase_migrations/007_demo_mode.sql` | NEW migration for demo metadata + usage |
| `backend/utils/auth.py` | NEW JWT dependency helpers |
| `backend/services/demo_service.py` | NEW demo activation/status/quota service |
| `backend/services/bigquery_provider.py` | NEW project-scoped BQ client routing |
| `backend/api/v1/demo.py` | NEW demo endpoints |
| `backend/main.py` | Register demo router + initialize demo provider |
| `backend/api/v1/chat.py` | Require JWT, add `project_id`, enforce quota on query + execute |
| `backend/api/v1/reports.py` | Require JWT, resolve project, enforce report quota |
| `backend/api/v1/semantic.py` | Require JWT, add `project_id`, enforce semantic quota |
| `backend/api/v1/datasets.py` | Require JWT, add `project_id`, allowlist enforcement for demo |
| `landing.html` | Try Demo CTA and localStorage pending flag |
| `auth/callback.html` | Activate demo and redirect logic |
| `dashboard.html` | Explore Demo button and activation call |
| `chat_agent.html` | Auth headers, project_id propagation, demo banner, limit card |
| `report_builder.html` | Auth headers, demo banner, limit card |
| `schema_browser.html` | Auth headers + project_id query param |
| `semantic_layer_setup.html` | Auth headers + project_id in generate payload |

---

*Last updated: February 22, 2026*
