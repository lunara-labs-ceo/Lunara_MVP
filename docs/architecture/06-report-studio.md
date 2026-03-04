# 06 — Report Studio: Data Selection, Report Canvas & Organization

**Scope:** How users enter the report builder, how reports bind to data context, the report list/workspace screen, the report canvas, and how reports reference chat artifacts and semantic models.

**Depends on:** 05 (Chat studio — artifacts must be organized before reports can consume them)

---

## Current State

### Report Agent (`report_agent.py`)

- Two-agent pipeline: **Analyst** (code execution, chart generation) → **Reporter** (structured HTML output).
- Analyst uses `AgentEngineSandboxCodeExecutor` for Python code (matplotlib, pandas).
- Reporter outputs `DynamicReport` Pydantic model (title, sections, charts, captions).
- Artifacts (query results) passed in the request body as JSON.
- **No data source binding.** Reports don't know which warehouse the data came from.

### Report API (`api/v1/reports.py`)

- `POST /reports/{report_id}/generate` — streams SSE events.
- Request: `{ prompt, artifacts: [{title, sql, data}], history }`.
- `report_id` is a path param but only used as an identifier — no ownership validation.
- **No session management.** Each generation is independent.
- ReportAgentService is created fresh per request (not a singleton).

### `report_sessions` Table (Migration 005/006)

```
report_sessions
  id UUID PK
  project_id UUID NOT NULL          ← becomes nullable (doc 02)
  name TEXT ('New Chat')
  messages JSONB                     ← added in 006
  created_by TEXT
  created_at, updated_at
```

### `report_items` Table (Migration 005/006)

```
report_items
  id UUID PK
  report_id UUID → report_sessions(id) CASCADE
  type TEXT ('html')
  title TEXT
  content TEXT
  position INTEGER
  created_at
```

**Missing:**
- `organization_id TEXT` — added in doc 02
- `semantic_model_id` — no link to which model's data was used
- `data_source_id` — no link to which warehouse
- No artifact references — reports don't formally link to the chat artifacts they consumed

### Problems

1. **No report workspace.** The current UX goes straight into generation. There's no list of reports, no way to browse or manage existing reports.
2. **No data context selection.** The user pastes/selects artifacts manually. There's no structured way to pick which data feeds the report.
3. **No data lineage.** A report doesn't record which semantic model or data source it used. Can't refresh or trace back.
4. **Reports are one-shot.** Generate, render, done. No edit → regenerate cycle (addressed in Report Builder V2 roadmap, but the schema needs to support it).
5. **`report_items` is per-section.** The `DynamicReport` output has sections + charts, but they're stored as flat HTML chunks. Chart images are base64 in the HTML. No structured chart storage.

---

## Proposed Design

### 1. Report Studio Entry: The Workspace Screen

Before jumping into report generation, users land on a workspace that shows their reports:

```
/studio/reports
  ┌───────────────────────────────────────────────────────────┐
  │ Reports                                    [+ New Report] │
  ├───────────────────────────────────────────────────────────┤
  │                                                           │
  │  ┌─────────────────────────────────────────────────────┐ │
  │  │ 📄 Q1 Revenue Analysis                              │ │
  │  │ Sales Analytics model · 3 charts · Mar 4, 2026      │ │
  │  │ [Open]  [Duplicate]  [Delete]                       │ │
  │  └─────────────────────────────────────────────────────┘ │
  │                                                           │
  │  ┌─────────────────────────────────────────────────────┐ │
  │  │ 📄 User Engagement Weekly                           │ │
  │  │ User Events model · 5 charts · Mar 3, 2026         │ │
  │  │ [Open]  [Duplicate]  [Delete]                       │ │
  │  └─────────────────────────────────────────────────────┘ │
  │                                                           │
  │  Empty state: "Create your first report with AI"         │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
```

### 2. New Report Flow: Data Context Selection

```
User clicks "+ New Report"
  → Step 1: Choose data context
    ┌──────────────────────────────────────────────────────┐
    │ How do you want to provide data?                     │
    │                                                      │
    │  ○ From Chat Artifacts                               │
    │    Select saved query results from your chats        │
    │                                                      │
    │  ○ From Scratch (describe what you want)             │
    │    Tell the AI what to analyze — it will query       │
    │    your data source directly                         │
    │                                                      │
    └──────────────────────────────────────────────────────┘

  If "From Chat Artifacts":
    → Step 2: Select artifacts
      ┌──────────────────────────────────────────────────┐
      │ Select data for your report                      │
      │                                                  │
      │ Filter: [All Models ▼]  [All Sessions ▼]        │
      │                                                  │
      │ ☑ Monthly Revenue 2026 (8 rows)                 │
      │   Session: Revenue Analysis · Sales Analytics    │
      │                                                  │
      │ ☑ Top 10 Customers (10 rows)                    │
      │   Session: Revenue Analysis · Sales Analytics    │
      │                                                  │
      │ ☐ Daily Active Users (30 rows)                  │
      │   Session: User Retention · User Events          │
      │                                                  │
      │ Selected: 2 artifacts                   [Next →] │
      └──────────────────────────────────────────────────┘

    → Step 3: Describe what you want
      ┌──────────────────────────────────────────────────┐
      │ What should this report cover?                   │
      │                                                  │
      │ ┌──────────────────────────────────────────────┐│
      │ │ Build an executive summary of Q1 revenue     ││
      │ │ trends with customer segmentation analysis   ││
      │ └──────────────────────────────────────────────┘│
      │                                                  │
      │ Report name: Q1 Revenue Analysis                 │
      │                                        [Create →]│
      └──────────────────────────────────────────────────┘

  If "From Scratch":
    → Step 2: Select semantic model + data source
      (same selector as Chat Studio's "New Chat")
    → Step 3: Describe what you want
      (same prompt box — agent will query data directly)
    → Creates report with semantic_model_id + data_source_id
```

### 3. Report Data Binding

A report session records its full data context:

```python
supabase.table("report_sessions").insert({
    "organization_id": user.org_id,
    "project_id": project_id,              # nullable
    "name": "Q1 Revenue Analysis",
    "semantic_model_id": model_id,          # nullable (if from artifacts only)
    "data_source_id": data_source_id,       # nullable (if from artifacts only)
    "input_artifact_ids": [art1_id, art2_id],  # which artifacts were selected
    "messages": [],
    "created_by": user.user_id,
}).execute()
```

### 4. The Report Canvas

After creation, the user lands in the report view — a split-pane with chat on the left and the rendered report on the right:

```
┌────────────────────────┬───────────────────────────────────────┐
│   REPORT CHAT          │   REPORT CANVAS                       │
│                        │                                       │
│  System: Report        │   Q1 Revenue Analysis                 │
│  generated with 3      │   ═══════════════════                 │
│  charts.               │                                       │
│                        │   Executive Summary                   │
│  User: Make the        │   Revenue grew 18% quarter-over-      │
│  revenue chart         │   quarter, driven by enterprise...    │
│  use darker colors     │                                       │
│                        │   ┌─────────────────────────────┐    │
│  Agent: Updated the    │   │  📊 Monthly Revenue Chart    │    │
│  revenue chart with    │   │  [chart image]               │    │
│  a darker palette.     │   └─────────────────────────────┘    │
│                        │                                       │
│                        │   Customer Segmentation               │
│                        │   The top 10 customers account for... │
│                        │                                       │
│  ┌──────────────────┐  │   ┌─────────────────────────────┐    │
│  │ Type here...  [→]│  │   │  📊 Customer Breakdown       │    │
│  └──────────────────┘  │   │  [chart image]               │    │
│                        │   └─────────────────────────────┘    │
│  Mode: [Ask][Plan][Ag] │                                       │
│                        │   [Export PDF]  [Edit in Canvas]      │
└────────────────────────┴───────────────────────────────────────┘
```

### Chat Panel (Left)

- Shows the report generation conversation (messages JSONB).
- User can ask follow-up questions ("add a trend line", "change the title").
- With sandbox persistence (V2), follow-ups patch the report instead of regenerating.
- Without persistence (MVP), follow-ups regenerate the full report.

### Canvas Panel (Right)

- Rendered HTML output from the Reporter agent.
- In MVP: read-only rendered HTML.
- In V2: Quill.js editable canvas (from report_builder_v2_roadmap.md).
- Charts are `<img>` tags with base64 data URIs.
- Export as PDF via `html2pdf.js`.

### 5. Report Items: Structured Storage

Instead of storing the entire report as a single HTML blob, break it into typed items:

```sql
-- report_items (already exists, keep the schema)
report_items
  id UUID PK
  report_id UUID → report_sessions(id) CASCADE
  type TEXT           -- 'html' | 'chart' | 'title' | 'summary'
  title TEXT
  content TEXT        -- HTML for text sections, base64 for charts
  position INTEGER    -- ordering
  created_at
```

The `type` field lets us:
- Render charts and text sections differently.
- Patch individual items (V2 selective editing).
- Count charts for the report list ("3 charts").

### 6. Updated API Endpoints

```
POST /api/v1/reports
  Body: { name, semantic_model_id?, data_source_id?, input_artifact_ids?, project_id? }
  Auth: Clerk JWT
  → Creates report session
  → Returns report_id

GET /api/v1/reports
  Query: ?project_id=xxx (optional)
  Auth: Clerk JWT, filter by org_id
  → Returns report list with names, dates, chart counts

GET /api/v1/reports/{id}
  Auth: Clerk JWT, verify org ownership
  → Returns report session + items

DELETE /api/v1/reports/{id}
  Auth: Clerk JWT
  → Deletes report + items (CASCADE)

PUT /api/v1/reports/{id}
  Body: { name }
  Auth: Clerk JWT
  → Rename report

POST /api/v1/reports/{id}/generate     ← existing, updated
  Body: { prompt, artifacts?, history? }
  Auth: Clerk JWT, verify org ownership
  → If report has data_source_id: analyst can query data directly
  → If report has input_artifact_ids: analyst uses those
  → Streams SSE events
  → Saves report_items on completion

POST /api/v1/reports/{id}/items
  Body: { type, title, content, position }
  Auth: Clerk JWT
  → Manually add/edit a report item (for user edits in V2 canvas)

POST /api/v1/reports/{id}/export
  Auth: Clerk JWT
  → Generates PDF from report HTML
  → Returns download URL
```

---

## Schema Changes

### In Migration 008 (Combined)

```sql
-- Add data context columns to report_sessions
ALTER TABLE report_sessions ADD COLUMN IF NOT EXISTS
    semantic_model_id UUID REFERENCES semantic_models(id) ON DELETE SET NULL;

ALTER TABLE report_sessions ADD COLUMN IF NOT EXISTS
    data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;

ALTER TABLE report_sessions ADD COLUMN IF NOT EXISTS
    input_artifact_ids UUID[] DEFAULT '{}';

-- organization_id and nullable project_id already handled in 02-resource-scoping
```

### Updated Column List (Post-Migration)

```
report_sessions
  id UUID PK
  organization_id TEXT NOT NULL          ← NEW (doc 02)
  project_id UUID NULLABLE               ← CHANGED (doc 02)
  semantic_model_id UUID → semantic_models  ← NEW (this doc)
  data_source_id UUID → data_sources     ← NEW (this doc)
  input_artifact_ids UUID[]              ← NEW (this doc)
  name TEXT
  messages JSONB
  created_by TEXT
  created_at, updated_at

report_items (unchanged except RLS)
  id UUID PK
  report_id UUID → report_sessions(id) CASCADE
  type TEXT
  title TEXT
  content TEXT
  position INTEGER
  created_at
```

---

## How Reports Connect to Everything

### Data Lineage Chain

```
data_source (BigQuery/PostgreSQL/...)
  → semantic_model (generated from data source)
    → chat_session (bound to semantic model)
      → chat_artifact (saved query result)
        → report_session (consumes artifacts)
          → report_items (sections + charts)
```

### Two Paths to Report Data

**Path 1: From Chat Artifacts**
- User explored data in Chat Studio, saved interesting results.
- Creates report → selects artifacts → AI generates narrative + charts.
- `input_artifact_ids` populated, `semantic_model_id` derived from artifacts.

**Path 2: From Scratch**
- User wants a report without chatting first.
- Selects a semantic model → describes what they want.
- AI analyst queries the data source directly, generates charts.
- `semantic_model_id` + `data_source_id` populated, `input_artifact_ids` empty.

Both paths produce the same output: a `DynamicReport` with sections and charts.

---

## Report Builder V2 Features (Future, from existing roadmap)

These build on top of this foundation:

1. **Sandbox persistence** (doc: `report_builder_v2_roadmap.md`)
   - Reuse the same Python sandbox across turns.
   - Follow-up messages modify charts in place instead of regenerating.

2. **Editable canvas** (Quill.js)
   - Report HTML loaded into Quill rich text editor.
   - Users can type, reformat, resize chart images.
   - Manual edits + AI edits on the same document.

3. **Selective editing** (patch system)
   - AI updates individual sections/charts without touching the rest.
   - SSE events: `chart_update`, `section_update`.

All three features work with the schema proposed here. `report_items` with `type` and `position` fields enable patch-level updates.

---

## Open Questions

1. **Artifact data freshness:** When a report uses chat artifacts, should it use a snapshot of the data (frozen at artifact save time) or re-run the SQL for fresh data?
   - **Recommendation:** Use the snapshot. Artifacts are a record of a point-in-time result. If the user wants fresh data, they re-run the SQL in Chat Studio and save a new artifact.

2. **"From Scratch" report generation latency:** Without pre-existing artifacts, the analyst must run SQL queries, wait for results, then generate charts. This could be significantly slower.
   - **Recommendation:** Show clear progress indicators. The analyst agent is already designed to handle this (it runs SQL as part of code execution). Accept the latency for MVP.

3. **Max artifacts per report:** Should we limit how many artifacts can feed into a single report? Very large inputs could hit context window limits.
   - **Recommendation:** Soft limit of 10 artifacts. Warn the user if they select more than 5. The analyst agent can handle chunking if needed.

---

*Last updated: March 4, 2026*
