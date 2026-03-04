# Agent Modes Architecture (V2)

## Overview
This document defines a production-grade implementation of three agent modes for Lunara:
- `ask`: informational only
- `plan`: propose actions, no side effects
- `agent`: execute allowed actions

Scope:
- SQL Chat (`/api/v1/chat/query`, `/api/v1/chat/execute`)
- Report Builder (`/api/v1/reports/{id}/generate`)

This version replaces the previous design and aligns with how robust systems are implemented in practice: explicit capability gating on the backend, stable API contracts, and approval handshakes for plans.

---

## Current State (As Implemented Today)

### SQL Chat
- `POST /api/v1/chat/query` streams text + generated SQL only.
- SQL execution is a separate explicit call: `POST /api/v1/chat/execute`.
- The backend uses a singleton `ChatAgentService` instance.

### Report Builder
- `POST /api/v1/reports/{id}/generate` runs a two-agent pipeline (Analyst + Reporter).
- Analyst currently has code execution enabled.
- Endpoint emits SSE events like `status`, `text`, `code`, `content_item`, `done`.

Implication:
- SQL already has a natural separation between "plan/generate" and "execute".
- Report generation currently couples planning and execution in one request.

---

## Product Semantics

### 1) Ask Mode (`ask`)
Goal:
- Explain data/model/report options.

Rules:
- No side effects.
- No execution.
- No "ready to run" outputs that can bypass review.

Expected outputs:
- Text explanation.
- Optional schema/artifact summaries.

### 2) Plan Mode (`plan`)
Goal:
- Produce an explicit, reviewable action proposal.

Rules:
- No side effects.
- Must return structured plan payload via SSE.
- Plan must be approvable later using a server-issued `plan_id`.

Expected outputs:
- SQL Chat: SQL draft + assumptions + validation checks.
- Report Builder: section plan + chart plan + required artifacts.

### 3) Agent Mode (`agent`)
Goal:
- Perform allowed actions immediately.

Rules:
- Side effects permitted.
- Still enforce guardrails (cost, safety, tenancy).

Note for SQL Chat:
- Keep current two-step execution (`/chat/query` then `/chat/execute`) for MVP safety and cost control.
- `agent` in SQL means "generate executable SQL now," not auto-run by default.
- `/chat/execute` already exists as a backend endpoint and is currently invoked by frontend/UI flows, not by the ADK agent toolchain.

---

## Real-World Architecture Principles

### A) Do not rely on prompt text for safety
Prompt instructions are advisory. Enforce behavior in backend code using capability checks.

### B) Do not mutate global agent config per request
Current code has singleton/module-level agents. Per-request mode changes must not mutate shared instruction/tool state.

### C) Plans require signed server state
Never trust client-resubmitted SQL/plan JSON directly for approval. Approve server-stored plans by `plan_id` bound to project/session/user context.

### D) Keep streaming contracts explicit
Mode-aware UX requires stable event schemas and explicit `type` fields.

---

## Capability Matrix

| Capability | ask | plan | agent |
|---|---|---|---|
| Semantic/schema lookup | yes | yes | yes |
| SQL draft generation | no | yes | yes |
| SQL execution | no | no | yes (via explicit execute path) |
| Report outline generation | no | yes | yes |
| Python chart/code execution | no | no | yes |
| Persist content items | no | no | yes |

Implementation rule:
- Every tool/function with side effects must check allowed capabilities for current mode.

---

## API Contract Changes

### Chat Request
Add `mode` to `ChatRequest`.

```json
{
  "message": "Show monthly revenue by region",
  "mode": "plan",
  "semantic_model": {},
  "session_id": "uuid",
  "history": []
}
```

`mode` enum:
- `ask`
- `plan`
- `agent` (default)

### Report Generate Request
Add `mode` to `GenerateRequest`.

```json
{
  "prompt": "Build an executive sales summary",
  "mode": "plan",
  "artifacts": [],
  "history": []
}
```

### SSE Event Types (Unified)
- `status`: progress text
- `text`: assistant natural language
- `plan`: structured plan payload with `plan_id`
- `sql`: generated SQL (agent mode or plan mode detail)
- `content_item`: saved report item
- `done`: terminal success
- `error`: terminal/non-terminal failure

Example `plan` event payload:

```json
{
  "type": "plan",
  "content": {
    "plan_id": "pln_abc123",
    "kind": "sql_query",
    "summary": "Monthly revenue by region for last 12 months",
    "sql": "SELECT ...",
    "assumptions": ["Revenue uses order_items.sale_price"],
    "checks": ["Confirm date column timezone", "Validate region mapping"]
  }
}
```

---

## Plan Approval Endpoints

Add explicit approval endpoints:

- `POST /api/v1/chat/plans/{plan_id}/approve`
- `POST /api/v1/reports/{report_id}/plans/{plan_id}/approve`

Behavior:
- Load plan from server storage.
- Validate tenant/session ownership.
- Validate plan not expired/revoked.
- Execute exactly stored payload (not client-modified payload).

Optional:
- `POST /api/v1/.../plans/{plan_id}/reject`
- TTL-based cleanup job.

---

## Persistence Model for Plans

Store plans server-side (SQLite for MVP or Supabase table).

Minimum fields:
- `id` (plan_id)
- `kind` (`sql_query` | `report_outline`)
- `mode_created` (`plan`)
- `payload_json`
- `project_id`
- `session_id`
- `created_by`
- `created_at`
- `expires_at`
- `approved_at` (nullable)
- `status` (`pending` | `approved` | `expired` | `rejected`)

---

## Backend Design by Service

### 1) ChatAgentService

#### Required refactor
- Add `mode` arg to `chat(...)`.
- Introduce mode context object:
  - `allow_sql_generation`
  - `allow_execution`
  - `allow_side_effects`
- Add explicit execution path decision:
  - Keep execution external (UI calls `/chat/execute`), or
  - Expose execution as an ADK tool in `agent` mode only.

#### Enforcement
- In `ask`: block `generate_sql` tool output path.
- In `plan`: allow SQL drafting, emit `plan` event and persist plan.
- In `agent`: allow SQL drafting as current behavior.
- Keep `/chat/execute` as the only execution path for now.
- If execution is added as an agent tool later, do not call the HTTP endpoint from inside the agent. Implement a direct service tool method (e.g., `execute_sql_tool`) with strict guardrails.

#### Execution endpoint and tooling note
- Existing endpoint: `POST /api/v1/chat/execute`.
- Current implementation: endpoint exists for explicit user-triggered execution after SQL generation.
- Current ADK tools: exploration + `generate_sql`; no execution tool is registered yet.
- Recommended future shape:
  - `ask`: no execution tool.
  - `plan`: no execution tool.
  - `agent`: execution tool allowed only when policy checks pass.

#### Concurrency/safety
- Avoid mutating shared `self.agent.instruction` dynamically on singleton.
- Prefer one of:
  - Build short-lived agent/runner per request, or
  - Keep shared runner but enforce mode through wrappers and non-mutable instruction template.

### 2) ReportAgentService

#### Required refactor
- Add `mode` arg to `generate_content(...)`.
- Split Analyst behavior:
  - Planner variant (no code executor) for `plan`.
  - Executor variant (with `BuiltInCodeExecutor`) for `agent`.
  - Ask variant for artifact consultation only.

#### Enforcement
- `ask`: no chart/code execution, no content item writes.
- `plan`: emit `plan` event with section/chart plan, persist `plan_id`.
- `agent`: current generation flow allowed.

---

## Frontend Changes

### Shared (chat_agent.html + report_builder.html)
- Add mode segmented control with values: `ask`, `plan`, `agent`.
- Include `mode` in API payload.
- Handle `plan` SSE event:
  - Render plan card.
  - Show `Approve` action.
  - Approval calls new `.../plans/{plan_id}/approve` endpoint.

### SQL Chat UI specifics
- In `ask`: hide/disable SQL editor execute affordances for that turn.
- In `plan`: show SQL draft as review artifact, not auto-populate as executable unless approved.

### Report Builder UI specifics
- In `plan`: render proposed sections/charts preview card.
- On approve: run report generation from server-stored plan.

---

## Guardrails

### SQL safety/cost
- Read-only query validation for generated SQL where applicable.
- Enforce row/time/bytes limits.
- Require explicit execution action.

### Tenant safety
- Every plan and execution request must be scoped to project/org/user/session.

### Output hygiene
- Strip/escape unsafe HTML where needed before rendering.
- Keep strict schema validation for structured outputs.

---

## Rollout Plan

### Phase 1: Contracts + UI wiring
- Add `mode` field to request models.
- Add mode selector UI and pass through.
- Add `plan` SSE event support in frontend.

### Phase 2: Backend capability gating
- Add mode context and hard checks in chat/report services.
- Implement ask/plan behavior without side effects.

### Phase 3: Plan persistence + approval endpoints
- Persist plans with TTL and ownership metadata.
- Add approve/reject endpoints.

### Phase 4: Hardening
- Add automated tests (mode matrix).
- Add observability: mode usage, approvals, execution success/failure.
- Add cleanup for expired plans.

---

## Testing Matrix (Minimum)

### Chat
- `ask`: returns explanation, no SQL output.
- `plan`: returns `plan` event with `plan_id`, no execution.
- `agent`: returns SQL output, execution still separate endpoint.
- approval endpoint executes only stored SQL for matching owner/session.

### Report
- `ask`: artifact consultation only, no `content_item`.
- `plan`: returns section/chart plan with `plan_id`, no code execution.
- `agent`: produces `content_item` + `done`.
- approval endpoint executes stored report plan only.

---

## Acceptance Criteria

- Mode behavior is enforced in backend code, not only via prompts.
- No cross-session leakage from mutable global agent state.
- `plan` flows are reviewable and approvable via server `plan_id`.
- Existing SSE clients remain compatible with explicit event typing.
- SQL execution remains explicit and auditable.

---

## Out of Scope (For This Iteration)

- Full policy engine for fine-grained tool permissions.
- Multi-step plan editing/version diff UI.
- Cross-project reusable plan templates.

---

*Last updated: February 22, 2026*
