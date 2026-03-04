# 04 — Semantic Studio: Warehouse-Agnostic Model Generation

**Scope:** Making the semantic agent work with any data warehouse, linking semantic models to their data source, model management UX, and how the semantic layer feeds into chat and reports.

**Depends on:** 03 (Data connections — provider protocol must exist before the semantic agent can use it)

---

## Current State

### Semantic Agent (`semantic_agent.py`)

- `SemanticAgentService` — uses Google ADK + Gemini to analyze table schemas and classify columns.
- **Hardcoded BigQuery:** calls `bigquery_service.client.get_table(table_id)` directly to fetch schema.
- LLM classifies columns as `dimension`, `measure`, or `time` and suggests aggregations.
- Output stored as JSONB in `semantic_models.model`.

### `semantic_models` Table (Migration 003)

```
semantic_models
  id UUID PK
  project_id UUID NOT NULL        ← becomes nullable (doc 02)
  name TEXT
  description TEXT
  model JSONB                      ← the actual semantic layer data
  source_type TEXT CHECK (bigquery|postgres|redshift|snowflake)
  table_count INTEGER
  created_by TEXT
  created_at, updated_at
```

**Missing columns:**
- `organization_id TEXT` — added in doc 02
- `data_source_id UUID → data_sources(id)` — added in doc 03

### Semantic API (`api/v1/semantic.py`)

- `POST /semantic/generate` — Takes `tables` (list of table IDs), streams SSE events.
- `POST /semantic/detect-relationships` — Takes table schemas, detects FK relationships.
- `GET/POST/DELETE /semantic/models/*` — **Stubs, not implemented.**
- **No project_id or data_source_id** passed in the request.

### Problems

1. **BigQuery-only schema fetching.** `get_table(table_id)` uses BigQuery client directly.
2. **No data source linking.** A semantic model doesn't record which connection generated it. Can't refresh the model later without manual re-selection.
3. **No CRUD for models.** The list/get/delete endpoints are stubs. Models are saved from the frontend via direct Supabase calls.
4. **`source_type` is redundant** with `data_sources.type` — if we link to `data_source_id`, we can derive it.
5. **No model versioning.** Re-generating overwrites the model. No way to compare before/after.

---

## Proposed Design

### 1. Semantic Agent Uses Provider Protocol

Replace `bigquery_service.client.get_table()` with the warehouse-agnostic provider:

```python
# Before (hardcoded BigQuery)
def get_table_schema(self, table_id: str) -> dict:
    table = self.bigquery_service.client.get_table(table_id)
    columns = [{"name": f.name, "type": f.field_type, ...} for f in table.schema]
    return {"table_id": table_id, "columns": columns}

# After (warehouse-agnostic)
async def get_table_schema(self, table_id: str) -> dict:
    schema = await self.provider.get_table_schema(table_id)
    return {"table_id": table_id, "columns": schema["columns"]}
```

The `SemanticAgentService` receives a `WarehouseProvider` instance instead of a `BigQueryService`:

```python
class SemanticAgentService:
    def __init__(self, provider: WarehouseProvider):
        self.provider = provider
        self.sql_dialect = provider.get_sql_dialect()
```

### 2. SQL Dialect Awareness in Agent Prompt

The semantic agent's system prompt needs to know the SQL dialect so it can generate appropriate column classifications:

```python
SEMANTIC_AGENT_INSTRUCTION = f"""
You are analyzing a {self.sql_dialect} database schema.

SQL dialect: {self.sql_dialect}
- Table references use: {"backtick notation (`project.dataset.table`)" if self.sql_dialect == "bigquery" else "schema.table notation"}
- String casting: {"CAST(col AS STRING)" if self.sql_dialect == "bigquery" else "col::TEXT"}
...
"""
```

### 3. Semantic Agent Is No Longer a Singleton

Currently, `SemanticAgentService` is created once in `main.py`. With per-connection providers, it must be created per-request:

```python
# api/v1/semantic.py
@router.post("/semantic/generate")
async def generate_semantic_layer(
    request: GenerateRequest,
    user: ClerkUser = Depends(get_current_user),
    conn_manager: ConnectionManager = Depends(get_connection_manager),
):
    provider = await conn_manager.get_provider(request.data_source_id)
    agent = SemanticAgentService(provider)
    # ... stream response
```

### 4. Model ↔ Data Source Linking

When a semantic model is generated, the `data_source_id` is saved:

```python
# After generation completes
supabase.table("semantic_models").insert({
    "organization_id": user.org_id,
    "data_source_id": request.data_source_id,
    "project_id": request.project_id,  # nullable
    "name": model_name,
    "model": model_json,
    "source_type": provider.get_sql_dialect(),
    "table_count": len(tables),
    "created_by": user.user_id,
}).execute()
```

This enables:
- **Refresh:** Re-run generation against the same data source.
- **Lineage:** Know which warehouse a model came from.
- **Validation:** When a chat session picks a semantic model, the system knows which provider to use for query execution.

### 5. Semantic Studio UX Flow

```
/studio/semantic
  ┌─────────────────────────────────────────────────────────┐
  │ Semantic Models                          [+ New Model]  │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  ┌─────────────────────────────────────────────────┐   │
  │  │ 📊 Sales Analytics Model                        │   │
  │  │ BigQuery · my-project · 12 tables · Mar 2, 2026 │   │
  │  │ [View]  [Refresh]  [Edit]                       │   │
  │  └─────────────────────────────────────────────────┘   │
  │                                                         │
  │  ┌─────────────────────────────────────────────────┐   │
  │  │ 📊 User Events Model                            │   │
  │  │ PostgreSQL · Supabase · 5 tables · Mar 3, 2026  │   │
  │  │ [View]  [Refresh]  [Edit]                       │   │
  │  └─────────────────────────────────────────────────┘   │
  │                                                         │
  │  Empty state: "Connect a data source to get started"   │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
```

### "New Model" Flow

```
Step 1: Select Data Source
  → Dropdown of connected data sources in the org
  → Shows warehouse type icon + name + status

Step 2: Select Tables
  → Lists schemas/datasets from the selected data source
  → User expands schemas → checks tables to include
  → "Select All" option per schema

Step 3: Generate
  → Click "Generate Semantic Model"
  → SSE stream: status updates → column classifications arrive
  → Progress indicator per table

Step 4: Review & Save
  → Review generated model:
    - Table descriptions (editable)
    - Column classifications: dimension / measure / time (editable)
    - Suggested aggregations (editable)
    - Detected relationships (if relationship agent ran)
  → Name the model
  → Save → stored in Supabase

Step 5: Use
  → "Open in Chat" button → navigates to /studio/chat?model_id=xxx
  → Model appears in Chat Studio's model selector
```

### 6. Model CRUD Endpoints (Replace Stubs)

```
POST /api/v1/semantic/generate
  Body: { data_source_id, tables: [...], name, project_id? }
  Auth: Clerk JWT, verify data_source_id belongs to org
  → Stream SSE → save model → return model_id

GET /api/v1/semantic/models
  Query: ?project_id=xxx (optional filter)
  Auth: Clerk JWT, filter by org_id
  → Returns list of models for the org

GET /api/v1/semantic/models/{model_id}
  Auth: Clerk JWT, verify model belongs to org
  → Returns full model with columns and relationships

PUT /api/v1/semantic/models/{model_id}
  Body: { name?, model? (edited JSONB), project_id? }
  Auth: Clerk JWT, verify ownership
  → Updates model

DELETE /api/v1/semantic/models/{model_id}
  Auth: Clerk JWT, verify ownership
  → Deletes model (cascades: chat_sessions.semantic_model_id → SET NULL)

POST /api/v1/semantic/models/{model_id}/refresh
  Auth: Clerk JWT, verify ownership
  → Re-generates from the linked data_source_id with same tables
  → Preserves user edits to descriptions where table/column names match

POST /api/v1/semantic/detect-relationships
  Body: { model_id }
  Auth: Clerk JWT
  → Runs relationship detection agent on the model's table data
  → Updates model JSONB with relationships
```

---

## Schema Changes

### In Migration 008 (Combined)

```sql
-- Add data_source_id to semantic_models
ALTER TABLE semantic_models ADD COLUMN IF NOT EXISTS
    data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;

-- Make source_type check more flexible
ALTER TABLE semantic_models DROP CONSTRAINT IF EXISTS semantic_models_source_type_check;
ALTER TABLE semantic_models ADD CONSTRAINT semantic_models_source_type_check
    CHECK (source_type IN ('bigquery', 'postgresql', 'snowflake', 'redshift', 'mysql', 'databricks'));

-- organization_id and nullable project_id already handled in 02-resource-scoping
```

### Updated Column List (Post-Migration)

```
semantic_models
  id UUID PK
  organization_id TEXT NOT NULL       ← NEW (doc 02)
  project_id UUID NULLABLE            ← CHANGED (doc 02)
  data_source_id UUID → data_sources  ← NEW (this doc)
  name TEXT
  description TEXT
  model JSONB
  source_type TEXT                     ← kept for quick filtering (denormalized)
  table_count INTEGER
  created_by TEXT
  created_at, updated_at
```

---

## How This Feeds Into Chat & Reports

### The Handoff to Chat Studio (Doc 05)

When a user opens a semantic model in chat:

1. Chat session is created with `semantic_model_id` = the selected model.
2. Chat session also gets `data_source_id` = the model's `data_source_id`.
3. The chat agent loads the semantic model JSON for context.
4. The chat agent uses `get_provider(data_source_id)` for all tool calls (schema lookups, query execution).
5. The agent's system prompt includes the SQL dialect from the provider.

This means the chat agent automatically speaks the right SQL dialect based on which semantic model the user selected.

### The Handoff to Report Studio (Doc 06)

Reports don't directly use the semantic model, but they consume chat artifacts (saved query results). The data lineage is:

```
semantic_model (data_source_id=X)
  → chat_session (semantic_model_id=M, data_source_id=X)
    → chat_artifact (session_id=S, sql=..., data=...)
      → report_session (uses artifact data for analysis)
```

---

## Open Questions

1. **Model refresh behavior:** When refreshing a model, should we preserve user edits to column descriptions/classifications? Or regenerate everything from scratch?
   - **Recommendation:** Preserve edits where table/column names match. Flag new tables/columns as "new" and removed ones as "removed" for user review.

2. **Multiple models per data source:** A user might want different semantic models for different subsets of tables from the same data source (e.g., "Sales Model" with order tables, "Marketing Model" with campaign tables).
   - **Recommendation:** Allow it. Each model selects its own tables. The `data_source_id` FK is not unique.

3. **Relationship detection timing:** Should relationships be detected automatically during model generation, or as a separate step?
   - **Current:** Separate button/endpoint.
   - **Recommendation:** Keep it separate for now. Relationship detection is slower and might not be needed for simple schemas. Add a "Detect Relationships" button in the model view.

---

*Last updated: March 4, 2026*
