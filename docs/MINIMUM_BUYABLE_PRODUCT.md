# Minimum Buyable Product (MBP)

Date: March 4, 2026
Status: Active — this is what we're building NOW

---

## Philosophy

The architecture docs (`docs/architecture/01-08`) define the full product. This doc defines what we ship first. Every decision here optimizes for one thing: **get the product in front of vibe coders as fast as possible.**

Vibe coders don't use BigQuery. They use Supabase, Neon, PlanetScale — PostgreSQL databases they already have. The MBP connects to their existing Supabase database, lets them explore their data with AI, and generates reports. That's it.

---

## What's In

### 1. React Migration
Port all existing pages from vanilla HTML to Next.js + React + Tailwind + shadcn/ui. Same functionality, modern stack, Clerk auth baked in.

Pages to migrate:
- Dashboard (project CRUD, recent activity)
- Data source connection (PostgreSQL/Supabase only)
- Schema browser (browse tables/columns from connected DB)
- Semantic layer setup (AI generates semantic model)
- Chat agent (text-to-SQL, run queries, see results)
- Report builder (AI-generated reports with charts)

### 2. PostgreSQL/Supabase as the Only Data Source
Strip out the entire BigQuery integration. Replace with a PostgreSQL connection using `asyncpg`.

**Connection flow for the user:**
1. Go to Supabase Dashboard → Settings → Database → Connection string
2. Paste it into Lunara
3. Connected

That's the entire onboarding for data. No service account JSON, no GCP project ID, no encrypted file on disk.

### 3. Provider Abstraction (Interface Only)
Build the `WarehouseProvider` protocol from doc 03, but only implement `PostgreSQLProvider`. This means:
- The semantic agent calls `provider.get_table_schema()`, not `bigquery_service.client.get_table()`
- The chat agent calls `provider.execute_query()`, not `bigquery_service.execute_query()`
- Adding BigQuery (or Snowflake, etc.) later = write a new class, no refactoring

### 4. Project-Scoped (Current Architecture)
Keep `project_id NOT NULL` on all resource tables. No org-scoping migration. Users create a project, connect data inside it, and work inside that project.

The org-scoping migration (doc 02) happens later when we need studios and cross-project reuse.

### 5. Two Plans: Free & Pro ($25/month)
No feature gating — every feature is available on both plans. The only difference is usage limits. This protects our GCP credits while letting free users fully experience the product.

| | Free | Pro ($25/month) |
|---|---|---|
| **All features** | Yes | Yes |
| **Projects** | 1 | 10 |
| **Data sources** | 1 | 5 |
| **AI credits/month** | 100 | 3,000 |
| **Seats** | 1 | 5 |

**Credit costs:**

| Action | Credits |
|---|---|
| Chat turn (NL → SQL) | 1 |
| Semantic model generation | 20 |
| Relationship detection | 5 |
| Report generation | 15 |

Free users get roughly: 100 chat turns, or 5 semantic model generations, or 6 reports per month — enough to experience the product, not enough to run a business on it.

Pro users get roughly: 3,000 chat turns, or 150 model generations, or 200 reports — plenty for a real workflow.

**Enforcement:** Tracked in Supabase (`org_usage` table), checked before every AI call. When credits run out, the user sees a clear "upgrade to Pro" prompt. No partial responses — fail before calling the LLM, not after.

**Stripe integration:** Minimal. One product, one price ($25/month), a Stripe Checkout link for upgrade, a webhook to update Clerk org metadata. No customer portal, no annual pricing, no add-ons. Keep it dead simple.

**Clerk org metadata on sign-up:**
```json
{
  "plan": "free",
  "limits": {
    "projects": 1,
    "data_sources": 1,
    "ai_credits_monthly": 100,
    "seats": 1
  }
}
```

**After Stripe upgrade:**
```json
{
  "plan": "pro",
  "stripe_customer_id": "cus_xxx",
  "stripe_subscription_id": "sub_xxx",
  "limits": {
    "projects": 10,
    "data_sources": 5,
    "ai_credits_monthly": 3000,
    "seats": 5
  }
}
```

### 6. Clerk Auth (Already Done)
Sign up → create org → land on dashboard. Already working with custom onboarding flow.

---

## What's Out (For Now)

| Feature | Why It's Parked | Where It Lives |
|---|---|---|
| BigQuery integration | Not our target user | Can add back via provider abstraction |
| Multi-warehouse support | Only need PostgreSQL now | `docs/architecture/03-data-connections.md` |
| Org-scoped studios | Project scope is fine for solo/small teams | `docs/architecture/02-resource-scoping.md` |
| Advanced billing (annual, add-ons, portal) | Free + $25 Pro is enough | `docs/architecture/08-billing-and-limits.md` |
| Agent modes (ask/plan/agent) | Current default behavior works | `docs/architecture/10-agent-modes.md` |
| Demo mode | Users have their own Supabase DB | `docs/DEMO_MODE_DESIGN.md` |
| Report builder V2 | Current report builder works | `docs/report_builder_v2_roadmap.md` |
| Teams / viewer roles | Solo users first, Pro gets 5 seats | `docs/architecture/01-clerk-org-model.md` |

---

## Technical Plan

### Backend Changes

#### Remove
- `backend/services/bigquery.py` — the entire file
- `backend/api/v1/connection.py` — BigQuery credential upload endpoints
- `backend/api/v1/datasets.py` — BigQuery dataset browsing endpoints
- `backend/data/credentials.enc` — global encrypted credentials file
- `google-cloud-bigquery` from `requirements.txt`
- `google-oauth2` service account dependencies
- All BigQuery client references in `main.py` startup

#### Add
- `backend/services/warehouse_provider.py` — `WarehouseProvider` protocol definition
- `backend/services/providers/postgresql_provider.py` — PostgreSQL implementation using `asyncpg`
- `backend/services/connection_manager.py` — caches provider instances per data source
- `asyncpg` to `requirements.txt`

#### Modify
- `backend/services/semantic_agent.py`
  - Replace `bigquery_service.client.get_table()` with `provider.get_table_schema()`
  - Schema inspection via `information_schema.columns` query
  - No longer a singleton — instantiated per request with a provider

- `backend/services/chat_agent.py`
  - Replace `bigquery_service.execute_query()` with `provider.execute_query()`
  - Tool methods: drop backtick quoting, use standard PostgreSQL double-quote quoting
  - System prompt: tell the LLM it's writing PostgreSQL, not BigQuery
  - No longer references global `BigQueryService`

- `backend/services/report_agent.py`
  - The analyst agent receives data as JSON artifacts — no direct warehouse access
  - Minimal changes needed (may need to update code execution context to use pandas with PostgreSQL result formats)

- `backend/api/v1/connection.py` (rewrite)
  - `POST /connections` — accept connection string or host/port/db/user/password
  - `GET /connections` — list connections for user's project
  - `GET /connections/{id}/status` — test connection
  - `DELETE /connections/{id}` — remove connection

- `backend/api/v1/datasets.py` (rewrite as `schemas.py`)
  - `GET /connections/{id}/schemas` — list PostgreSQL schemas
  - `GET /connections/{id}/schemas/{schema}/tables` — list tables
  - `GET /connections/{id}/tables/{table}/columns` — list columns

- `backend/main.py`
  - Remove `BigQueryService` singleton creation
  - Remove GCP credential setup (if no other Google dependency needs it — check if ADK/Gemini needs `GOOGLE_APPLICATION_CREDENTIALS`)
  - Add `ConnectionManager` as a dependency

#### Keep (Still Needed)
- `google.adk` / Gemini dependencies — the AI agents still use Google ADK
- `GOOGLE_APPLICATION_CREDENTIALS` — still needed for Vertex AI / Gemini API
- Fernet encryption — still used for encrypting PostgreSQL credentials in `data_sources` table
- Supabase client — still used for persistence

### Frontend Changes

#### New React Pages (Migrated from HTML)
Each page becomes a Next.js route under `app/(app)/`:

| HTML Page | React Route | Key Components |
|---|---|---|
| `dashboard.html` | `/dashboard` | Project list, create project dialog, recent activity |
| `data_sources.html` + `bq_connection.html` | `/projects/[id]/connect` | PostgreSQL connection form (connection string input) |
| `schema_browser.html` | `/projects/[id]/schema` | Schema/table/column tree browser |
| `semantic_layer_setup.html` | `/projects/[id]/semantic` | Table selector → generate → review/edit model |
| `chat_agent.html` | `/projects/[id]/chat` | Chat messages + SQL editor + results table |
| `report_builder.html` | `/projects/[id]/reports` | Report generation chat + rendered report |

All pages:
- Use Clerk auth (`useAuth()` → `getToken()` → pass JWT to backend)
- Use the `useApiClient()` hook from `frontend/lib/api.ts`
- Use Tailwind + shadcn/ui components
- Match the landing page design system (IBM Plex Sans, Tailark silver/white)

#### Connection Page UX

```
/projects/[id]/connect

  ┌─────────────────────────────────────────────────────┐
  │ Connect Your Database                                │
  │                                                      │
  │ Paste your Supabase connection string:               │
  │ ┌──────────────────────────────────────────────────┐│
  │ │ postgresql://postgres:****@db.xxx.supabase.co... ││
  │ └──────────────────────────────────────────────────┘│
  │                                                      │
  │ Or enter details manually:                           │
  │ Host:     [db.xxxx.supabase.co              ]       │
  │ Port:     [5432                              ]       │
  │ Database: [postgres                          ]       │
  │ Username: [postgres                          ]       │
  │ Password: [••••••••                          ]       │
  │ Schema:   [public                            ]       │
  │                                                      │
  │ [Test Connection]  [Save & Continue →]               │
  │                                                      │
  │ ℹ️ Find this in Supabase Dashboard →                 │
  │   Settings → Database → Connection string            │
  └─────────────────────────────────────────────────────┘
```

### Credential Storage

PostgreSQL credentials are encrypted and stored in the `data_sources` table (not a file on disk):

```sql
-- data_sources table already exists (migration 002)
-- Just need to add credentials_encrypted column

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT;
```

Encryption uses the existing Fernet key (`ENCRYPTION_KEY` env var). The encrypted blob contains the connection string or individual credential fields as JSON.

```python
# Encrypt on save
credentials = {"connection_string": "postgresql://..."}
encrypted = fernet.encrypt(json.dumps(credentials).encode()).decode()

# Decrypt on connect
decrypted = json.loads(fernet.decrypt(encrypted.encode()).decode())
```

### Schema Inspection (Replacing BigQuery Client)

The semantic agent currently uses `bigquery_service.client.get_table()`. With PostgreSQL, schema inspection uses `information_schema`:

```sql
-- List schemas
SELECT schema_name FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast');

-- List tables in a schema
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public';

-- Get columns for a table
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- Get row count estimate (fast, no full table scan)
SELECT reltuples::BIGINT AS estimate
FROM pg_class
WHERE relname = 'orders';
```

### Chat Agent SQL Changes

All 6 data-exploration tools need PostgreSQL syntax:

| Tool | BigQuery (current) | PostgreSQL (new) |
|---|---|---|
| `lookup_column_values` | `` SELECT DISTINCT `col` FROM `table` `` | `SELECT DISTINCT "col" FROM "schema"."table"` |
| `get_date_range` | `` CAST(MIN(`col`) AS STRING) `` | `MIN("col")::TEXT` |
| `get_column_stats` | `` CAST(AVG(`col`) AS FLOAT64) `` | `AVG("col")::FLOAT` |
| `preview_table` | `` SELECT * FROM `table` LIMIT 5 `` | `SELECT * FROM "schema"."table" LIMIT 5` |
| `search_value` | `` CAST(`col` AS STRING) LIKE `` | `"col"::TEXT ILIKE` |
| `generate_sql` | BigQuery SQL | PostgreSQL SQL |

The LLM's system prompt changes from "You are writing BigQuery SQL" to "You are writing PostgreSQL SQL". Gemini already writes excellent PostgreSQL.

---

## Data Source Migration (Existing Table)

The `data_sources` table (migration 002) already has the right shape. We just need:

1. Add `credentials_encrypted TEXT` column.
2. Relax the `type` CHECK constraint (or just use 'postgres' which is already allowed).
3. The `config` JSONB stores non-sensitive connection metadata (host, port, database, schema).

```sql
-- Migration: add credentials column
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT;
```

No other schema changes needed for MBP. We're keeping project-scoped architecture as-is.

---

## What the Provider Abstraction Looks Like

```python
# backend/services/warehouse_provider.py
from typing import Protocol

class WarehouseProvider(Protocol):
    async def test_connection(self) -> tuple[bool, str]: ...
    async def list_schemas(self) -> list[dict]: ...
    async def list_tables(self, schema: str) -> list[dict]: ...
    async def get_table_schema(self, schema: str, table: str) -> dict: ...
    async def execute_query(self, sql: str) -> list[dict]: ...
    def get_sql_dialect(self) -> str: ...
```

```python
# backend/services/providers/postgresql_provider.py
import asyncpg

class PostgreSQLProvider:
    def __init__(self, connection_string: str):
        self.dsn = connection_string
        self._pool = None

    async def _get_pool(self):
        if not self._pool:
            self._pool = await asyncpg.create_pool(self.dsn, min_size=1, max_size=5)
        return self._pool

    async def test_connection(self) -> tuple[bool, str]:
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
            return True, "Connected"
        except Exception as e:
            return False, str(e)

    async def execute_query(self, sql: str) -> list[dict]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql)
            return [dict(row) for row in rows]

    def get_sql_dialect(self) -> str:
        return "postgresql"

    # ... list_schemas, list_tables, get_table_schema
    # all use information_schema queries
```

```python
# backend/services/warehouse_provider.py
def create_provider(warehouse_type: str, credentials: dict, config: dict) -> WarehouseProvider:
    if warehouse_type == "postgres":
        from .providers.postgresql_provider import PostgreSQLProvider
        return PostgreSQLProvider(credentials["connection_string"])
    else:
        raise ValueError(f"Unsupported warehouse: {warehouse_type}")
```

When we add BigQuery later, it's just a new file + one `elif` in the factory.

---

## Implementation Order

### Phase 1: Backend — Swap BigQuery for PostgreSQL
1. Create `WarehouseProvider` protocol
2. Create `PostgreSQLProvider` implementation
3. Create `ConnectionManager` (caches providers per data source)
4. Modify `semantic_agent.py` to use provider instead of BigQuery client
5. Modify `chat_agent.py` to use provider, fix SQL syntax in all tools
6. Rewrite connection API endpoints for PostgreSQL
7. Rewrite dataset/schema browsing endpoints
8. Add `credentials_encrypted` column to `data_sources`
9. Remove `bigquery.py`, old connection endpoints, GCP credential handling
10. Test end-to-end: connect → generate semantic model → chat → run query → save artifact → generate report

### Phase 2: Frontend — React Migration
1. App shell (top nav, layout, route structure)
2. Dashboard page (project list, create project)
3. Connection page (PostgreSQL connection form)
4. Schema browser page (tree view of schemas/tables/columns)
5. Semantic setup page (table selector → generate → review)
6. Chat agent page (messages + SQL editor + results — the complex one)
7. Report builder page (chat + rendered report)

### Phase 3: Billing (Free + Pro)
1. Create `org_usage` table + `consume_ai_credits` RPC in Supabase
2. Add credit enforcement middleware (check before every AI call)
3. Add resource limit checks (project count, data source count)
4. Set default Clerk org metadata on org creation (free tier limits)
5. Create one Stripe product + price ($25/month Pro)
6. Stripe Checkout link on upgrade button
7. Stripe webhook → update Clerk org metadata to Pro limits
8. Billing page: usage bars + upgrade CTA (or "You're on Pro")

### Phase 4: Polish & Deploy
1. Error handling and edge cases
2. Loading states and empty states
3. Mobile responsiveness
4. E2E tests for critical flows
5. Deploy frontend + backend to Render

---

## Success Criteria

A vibe coder with a Supabase database can:
1. Sign up and create an org (already works)
2. Create a project
3. Paste their Supabase connection string and connect
4. Generate a semantic model from their tables
5. Chat with their data in natural language
6. Get SQL generated, run it, see results
7. Save interesting queries as artifacts
8. Generate a report with charts from their data

If all 8 steps work, we ship.

---

*Last updated: March 4, 2026*
