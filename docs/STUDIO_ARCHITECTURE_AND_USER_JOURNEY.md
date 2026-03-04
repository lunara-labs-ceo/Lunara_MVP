# Lunara Studio Architecture & User Journey

Date: March 4, 2026
Status: Draft for iteration

---

## 1) Starting Point: Clerk as the Identity & Tenancy Layer

Clerk is not just auth. It is the **single source of truth** for identity, organization membership, and plan entitlements. Every downstream decision in Lunara flows from what Clerk knows about the user and their org.

### What Clerk Owns

| Concern | Where It Lives |
|---|---|
| User identity | Clerk user object (`user_xxx`) |
| Organization | Clerk org object (`org_xxx`) — created during onboarding |
| Org membership + roles | Clerk org memberships (`admin`, `member`, `viewer`) |
| Plan tier | Clerk org `publicMetadata.plan` (synced from Stripe) |
| Feature flags | Clerk org `publicMetadata.features` |
| Seat count | Clerk org member count (enforced on invite) |
| Session token | Clerk JWT — contains `orgId`, `orgRole`, `metadata` claims |

### Why Clerk Org Metadata, Not Supabase

The pricing tier and feature flags live on the Clerk org, not in a Supabase `subscriptions` table, because:

1. **Every API request already carries a Clerk JWT.** The backend can read `org.publicMetadata.plan` from the token claims without a database query.
2. **Stripe webhooks update Clerk directly** via the Clerk Backend API. When a subscription changes, one API call updates the org metadata. No sync lag, no eventual consistency issues.
3. **Frontend can read it instantly** via `useOrganization()` — no extra fetch needed to show plan badges, usage limits, or upgrade CTAs.
4. **Clerk enforces seat limits natively.** You set `max_allowed_memberships` on the org. Clerk blocks invites beyond the limit. Zero custom code.

The Supabase `profiles` and `organizations` tables still exist for relational data (project ownership, RLS scoping), but billing/plan state is authoritative in Clerk.

### Clerk Org Metadata Shape

```json
{
  "publicMetadata": {
    "plan": "growth",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx",
    "features": {
      "max_projects": 5,
      "max_data_sources": 3,
      "ai_credits_monthly": 5000,
      "ai_credits_used": 342,
      "agent_modes": ["ask", "plan", "agent"],
      "report_builder": true,
      "demo_mode": false
    },
    "billing_cycle_start": "2026-03-01T00:00:00Z"
  }
}
```

---

## 2) User Journey: End to End

### Phase 1: Acquisition

```
Landing page (lunaralabs.io)
  ├── "Get Started" → /sign-up → Clerk sign-up flow
  └── "Try Demo"   → localStorage flag → /sign-up → auto-activate demo after org creation
```

Both paths converge at the same sign-up flow. The only difference is what happens after org creation.

### Phase 2: Authentication & Onboarding

```
/sign-up
  → Clerk handles email/password or Google OAuth
  → Clerk creates user (user_xxx)
  → Redirect to /onboarding

/onboarding
  → Custom form: "Create your organization"
  → User enters org name
  → createOrganization() → setActive() → reload
  → Server-side auth() picks up orgId → redirect to /dashboard

  Behind the scenes:
  → Clerk org created with default metadata:
    { plan: "starter", features: { max_projects: 1, ... } }
  → Backend lazy-sync creates Supabase profile + org row on first API call
```

### Phase 3: First Session — Connect or Demo

The dashboard is the home screen. On first visit, the user has zero projects and zero data sources. Two paths forward:

```
/dashboard (empty state)
  ├── "Connect Your Data"  → /connections/new → warehouse selector
  │     ├── BigQuery     → service account upload or OAuth
  │     ├── PostgreSQL   → connection string (Supabase, Neon, etc.)
  │     ├── Snowflake    → account + credentials (planned)
  │     └── Redshift     → endpoint + credentials (planned)
  │
  └── "Try with Demo Data" → POST /api/v1/demo/activate
        → Creates demo project with pre-loaded credentials
        → Redirects to semantic layer setup with demo dataset
```

### Phase 4: Semantic Layer Setup

After connecting a data source (or activating demo), the user lands in the Semantic Studio to generate a semantic model. This is the critical step — without it, the chat agent has no context about what the data means.

```
/studio/semantic?source_id=xxx
  → Select datasets/tables to include
  → "Generate Semantic Model" (AI agent analyzes schema)
  → AI produces: table descriptions, column definitions,
    relationships, dimensions, measures
  → User reviews and saves
  → Model stored in Supabase (semantic_models table)
```

### Phase 5: Work — Chat & Reports

With a semantic model in place, the user can now do actual work:

```
/studio/chat
  → Select a semantic model (from any in the org)
  → Ask questions in natural language
  → Agent generates SQL using semantic context
  → User runs SQL → sees results in table
  → Save interesting queries as artifacts

/studio/reports
  → Select data artifacts or ask from scratch
  → Agent generates narrative report with charts
  → User edits in rich text editor (Quill.js)
  → Export as PDF or share
```

### Phase 6: Organize — Projects (Optional)

Projects are **optional grouping containers**. Power users and teams use them to organize work by use case. Casual users may never create one — they just work in the org-wide studio.

```
/projects
  → Create "Q1 Sales Analysis" project
  → Assign semantic models, chat sessions, reports to the project
  → Team members can filter by project for focused work
  → Projects have their own data source connections (optional)
```

---

## 3) App Navigation Structure

### Top-Level Layout

```
┌──────────────────────────────────────────────────────┐
│  Logo   │ Dashboard │ Studios ▼ │ Projects │  ○ User  │
├──────────────────────────────────────────────────────┤
│                                                      │
│                   Page Content                       │
│                                                      │
└──────────────────────────────────────────────────────┘

Studios dropdown:
  ├── Connections    → /studio/connections
  ├── Semantic       → /studio/semantic
  ├── Chat           → /studio/chat
  └── Reports        → /studio/reports
```

### Route Map

| Route | Page | Description |
|---|---|---|
| `/dashboard` | Dashboard | Home — recent activity, quick actions, usage summary |
| `/studio/connections` | Connections Studio | Manage data source connections (org-wide) |
| `/studio/connections/new` | New Connection | Warehouse-specific setup flow |
| `/studio/semantic` | Semantic Studio | Create/edit semantic models (org-wide) |
| `/studio/chat` | Chat Studio | SQL chat agent (select any semantic model) |
| `/studio/reports` | Report Studio | Report builder (select data, generate, edit) |
| `/projects` | Projects | List/create project containers |
| `/projects/[id]` | Project Detail | Project-scoped view of resources |
| `/settings` | Settings | Org settings, billing, members |
| `/settings/billing` | Billing | Plan, usage, upgrade (links to Stripe portal) |
| `/settings/members` | Members | Invite/manage org members (Clerk-powered) |

### What "Studio" Means

A studio is a **top-level workspace** for a specific activity. Unlike the current architecture where everything is scoped inside a project, studios are **org-scoped by default**. Any resource created in a studio belongs to the org and is accessible from any project (or no project).

This is the key architectural shift from the current `project → resource` model to `org → resource (optionally grouped by project)`.

---

## 4) Resource Scoping Model

### Current (Project-Scoped)

```
organization
  └── projects
       ├── data_sources
       ├── semantic_models
       ├── chat_sessions
       ├── chat_artifacts
       ├── report_sessions
       └── report_items
```

Every resource requires a `project_id`. No project = can't do anything.

### Target (Org-Scoped with Optional Project Grouping)

```
organization
  ├── data_sources        ← org-level, shared across projects
  ├── semantic_models     ← org-level, reusable everywhere
  ├── chat_sessions       ← org-level by default
  ├── chat_artifacts      ← org-level by default
  ├── report_sessions     ← org-level by default
  ├── report_items        ← org-level by default
  │
  └── projects            ← optional containers
       └── (resources can be linked to a project for organization)
```

### Schema Migration (Per Resource Table)

```sql
-- Step 1: Add organization_id directly
ALTER TABLE semantic_models
  ADD COLUMN organization_id TEXT;

-- Step 2: Backfill from project relationship
UPDATE semantic_models sm
SET organization_id = p.organization_id
FROM projects p
WHERE sm.project_id = p.id;

-- Step 3: Make it required
ALTER TABLE semantic_models
  ALTER COLUMN organization_id SET NOT NULL;

-- Step 4: Make project_id optional
ALTER TABLE semantic_models
  ALTER COLUMN project_id DROP NOT NULL;

-- Step 5: Update RLS policy
DROP POLICY "View project semantic_models" ON semantic_models;
CREATE POLICY "View org semantic_models" ON semantic_models
  FOR SELECT USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
```

Same pattern applies to `chat_sessions`, `chat_artifacts`, `report_sessions`, `report_items`, `data_sources`.

### Query Patterns After Migration

```sql
-- Studio view: all semantic models in my org
SELECT * FROM semantic_models
WHERE organization_id = 'org_xxx';

-- Project view: models linked to this project + org-wide models
SELECT * FROM semantic_models
WHERE organization_id = 'org_xxx'
AND (project_id = 'proj_xxx' OR project_id IS NULL);

-- Create in studio (no project)
INSERT INTO semantic_models (organization_id, project_id, ...)
VALUES ('org_xxx', NULL, ...);

-- Create inside a project
INSERT INTO semantic_models (organization_id, project_id, ...)
VALUES ('org_xxx', 'proj_xxx', ...);
```

---

## 5) Clerk Roles and Permissions

### Org-Level Roles (Clerk Native)

| Role | Can Do |
|---|---|
| `admin` | Full access. Manage members, billing, connections, all studios. |
| `member` | Use all studios. Create/edit resources. Cannot manage billing or members. |
| `viewer` | Read-only access to studios and resources. Cannot create or edit. |

### How Roles Map to Features

| Action | admin | member | viewer |
|---|---|---|---|
| View dashboard | yes | yes | yes |
| Use Chat Studio | yes | yes | read-only (view history) |
| Use Report Studio | yes | yes | read-only (view reports) |
| Create/edit semantic models | yes | yes | no |
| Manage data connections | yes | yes | no |
| Create projects | yes | yes | no |
| Invite members | yes | no | no |
| Manage billing/plan | yes | no | no |
| Delete org resources | yes | no | no |

### Enforcement

- **Frontend:** `useOrganization()` → check `membership.role` → hide/disable UI elements.
- **Backend:** Extract `orgRole` from Clerk JWT claims → return `403` for unauthorized actions.

---

## 6) Pricing Tier Enforcement

### The Chain

```
Stripe subscription event (webhook)
  → Stripe webhook handler on backend
    → Clerk Backend API: update org publicMetadata
      → { plan: "growth", features: { max_projects: 5, ... } }
        → Every subsequent request carries updated claims in JWT
          → Backend reads claims, enforces limits
          → Frontend reads claims, shows appropriate UI
```

### Limit Enforcement Points

| Limit | Where Enforced | How |
|---|---|---|
| Max seats | Clerk | `max_allowed_memberships` on org — Clerk blocks invites |
| Max projects | Backend | Check count before `INSERT INTO projects` |
| Max data sources | Backend | Check count before creating connection |
| AI credits | Backend | Decrement counter, return 429 when exhausted |
| Agent modes | Backend | Check `features.agent_modes` before allowing plan/agent mode |
| Report builder | Backend | Check `features.report_builder` before serving report endpoints |

### Credit Consumption (Backend)

```python
async def consume_credits(org_id: str, action: str, amount: int):
    """
    Atomic credit consumption.
    Returns remaining credits or raises 429.
    """
    # Read current from Clerk org metadata
    org = clerk.organizations.get(org_id)
    credits_used = org.public_metadata["features"]["ai_credits_used"]
    credits_limit = org.public_metadata["features"]["ai_credits_monthly"]

    if credits_used + amount > credits_limit:
        raise HTTPException(429, detail={
            "error": "credit_limit_reached",
            "used": credits_used,
            "limit": credits_limit,
            "action": action
        })

    # Update atomically
    clerk.organizations.update(org_id, public_metadata={
        **org.public_metadata,
        "features": {
            **org.public_metadata["features"],
            "ai_credits_used": credits_used + amount
        }
    })

    return credits_limit - (credits_used + amount)
```

### Credit Costs

| Action | Credits |
|---|---|
| SQL Chat turn | 1 |
| Semantic model generation | 40 |
| Relationship detection | 10 |
| Report generation | 30 |

### Monthly Reset

A scheduled job (or Stripe billing cycle webhook) resets `ai_credits_used` to 0 at the start of each billing cycle.

---

## 7) Data Source Connections

### Warehouse-Agnostic Design

Lunara supports multiple data warehouses. The connection UI presents a warehouse selector, and the backend uses a provider pattern to abstract warehouse-specific logic.

```
/studio/connections/new
  ┌─────────────────────────────────────────────┐
  │  Choose your data warehouse                  │
  │                                              │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
  │  │ BigQuery │  │PostgreSQL│  │Snowflake │  │
  │  │    ✅    │  │    ✅    │  │  Coming  │  │
  │  └──────────┘  └──────────┘  └──────────┘  │
  │  ┌──────────┐  ┌──────────┐                │
  │  │ Redshift │  │Databricks│                │
  │  │  Coming  │  │  Coming  │                │
  │  └──────────┘  └──────────┘                │
  └─────────────────────────────────────────────┘
```

### Connection Storage

```sql
-- data_sources table (already exists, needs org_id addition)
data_sources
  id UUID
  organization_id TEXT          -- NEW: direct org scope
  project_id UUID (nullable)    -- optional project grouping
  warehouse_type TEXT           -- 'bigquery' | 'postgresql' | 'snowflake' | ...
  name TEXT                     -- user-friendly label
  config JSONB                  -- warehouse-specific connection config
  credentials_encrypted TEXT    -- encrypted credentials blob
  status TEXT                   -- 'connected' | 'error' | 'pending'
  created_by TEXT
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ
```

### Backend Provider Pattern

```python
# bigquery_provider.py (existing) → becomes one of many
# postgresql_provider.py (new)
# snowflake_provider.py (planned)

class DataWarehouseProvider(Protocol):
    async def connect(self, config: dict, credentials: str) -> bool: ...
    async def list_datasets(self) -> list[Dataset]: ...
    async def list_tables(self, dataset: str) -> list[Table]: ...
    async def execute_query(self, sql: str) -> QueryResult: ...
    async def get_schema(self, table: str) -> TableSchema: ...

def get_provider(warehouse_type: str) -> DataWarehouseProvider:
    providers = {
        "bigquery": BigQueryProvider,
        "postgresql": PostgreSQLProvider,
    }
    return providers[warehouse_type]()
```

### PostgreSQL / Supabase (Next Priority)

This is the next data source to implement after the React migration. Target audience: vibe coders and indie hackers who already have a Supabase database.

Connection config:
```json
{
  "host": "db.xxxxx.supabase.co",
  "port": 5432,
  "database": "postgres",
  "schema": "public"
}
```

---

## 8) Studio Workflows in Detail

### Connections Studio

```
/studio/connections
  → List all org data source connections
  → Status indicators (connected / error / pending)
  → "New Connection" → warehouse selector → setup wizard
  → Edit / test / delete existing connections
  → Each connection shows which semantic models use it
```

### Semantic Studio

```
/studio/semantic
  → List all semantic models in the org
  → Each model shows: name, data source, table count, last updated
  → "New Model" flow:
    1. Select a data source connection
    2. Select datasets/schemas to include
    3. Select tables (or "include all")
    4. Click "Generate" → AI agent analyzes schema
    5. SSE stream: status updates → model sections arrive
    6. Review generated model (table descriptions, columns, relationships)
    7. Edit any section manually
    8. Save → stored in Supabase
  → Edit existing models
  → Relationship detection (separate agent run)
```

### Chat Studio

```
/studio/chat
  → Left sidebar: list of chat sessions (recent first)
  → "New Chat" → select a semantic model → start chatting
  → Main area:
    ├── Chat messages (streaming)
    ├── SQL editor (generated SQL appears here)
    ├── Results table (after execution)
    └── Mode selector: Ask | Plan | Agent
  → Save query as artifact
  → Export results as CSV
```

### Report Studio

```
/studio/reports
  → List of report sessions
  → "New Report" → enter prompt + select data context
  → Report generation (Analyst + Reporter pipeline)
  → Rendered report with charts
  → Editable canvas (Quill.js rich text editor)
  → AI can patch individual sections/charts (with sandbox persistence)
  → Export as PDF
```

---

## 9) How It All Connects

### The Data Flow

```
Data Source Connection
  ↓ provides schema info
Semantic Model
  ↓ provides business context to
Chat Agent                    Report Agent
  ↓ generates                   ↓ generates
SQL Queries                   Charts + Narrative
  ↓ produces                    ↓ produces
Query Results (Artifacts)     Report Documents
  ↓ can feed into               ↓ can be
Report Agent                  Edited + Exported
```

### Cross-Studio References

Because resources are org-scoped, studios can reference each other:

- **Chat Studio** → picks from any semantic model in the org
- **Report Studio** → can use any chat artifact as input data
- **Semantic Studio** → uses any data source connection
- **Projects** → can pull in any combination of resources for focused work

---

## 10) Supabase Schema Evolution Summary

### Tables That Need Migration

| Table | Add `organization_id` | Make `project_id` nullable | New RLS |
|---|---|---|---|
| `data_sources` | yes | yes | org-scoped |
| `semantic_models` | yes | yes | org-scoped |
| `chat_sessions` | yes | yes | org-scoped |
| `chat_artifacts` | yes | yes | org-scoped |
| `report_sessions` | yes | yes | org-scoped |
| `report_items` | yes | yes | org-scoped |
| `projects` | already has it | n/a | unchanged |
| `agents` | no (inherits via project) | no | unchanged |

### New Tables Needed

| Table | Purpose |
|---|---|
| `plans` | Stores agent plan proposals (for plan mode approval flow) |
| `demo_usage` | Tracks demo mode quota consumption |

### Column Type Change (Clerk Migration)

All `UUID` user/org ID columns become `TEXT` to accommodate Clerk's string IDs (`user_xxx`, `org_xxx`). This was handled in migration `007_clerk_migration.sql`.

---

## 11) Implementation Sequence

This is the order we build things, factoring in dependencies:

### Phase 1: React Migration (Current)
Migrate the 7 remaining HTML pages to Next.js + React:
1. Dashboard → `/dashboard`
2. Data Sources + BQ Connection → `/studio/connections` + `/studio/connections/new`
3. Schema Browser → integrated into connection and semantic flows
4. Semantic Layer Setup → `/studio/semantic`
5. Chat Agent → `/studio/chat`
6. Report Builder → `/studio/reports`

Each page migration includes:
- React component architecture
- Clerk auth integration (JWT in API calls)
- Tailwind styling (matching landing page design system)
- shadcn/ui components

### Phase 2: Org-Scoped Resources
- Add `organization_id` to resource tables
- Make `project_id` nullable
- Update RLS policies
- Update backend to read org from Clerk JWT
- Update frontend to work without requiring a project

### Phase 3: Multi-Warehouse Support
- Abstract BigQuery provider behind `DataWarehouseProvider` protocol
- Implement PostgreSQL provider (Supabase/Neon target audience)
- Update connection UI with warehouse selector
- Update semantic agent to handle different SQL dialects

### Phase 4: Stripe Billing
- Create Stripe products/prices (Growth, Scale, add-ons)
- Payment links for self-serve checkout
- Webhook handler → update Clerk org metadata
- Backend enforcement of plan limits
- Billing settings page with usage display

### Phase 5: Agent Modes
- Add mode parameter to chat/report API contracts
- Capability gating in backend services
- Plan persistence and approval endpoints
- Mode selector UI in Chat and Report studios

### Phase 6: Report Builder V2
- Sandbox persistence (ADK sandbox reuse across turns)
- Editable report canvas (Quill.js)
- Selective report editing (patch individual sections/charts)

### Phase 7: Demo Mode
- Demo activation endpoint
- Server-side quota enforcement
- Demo BigQuery credentials isolation
- Landing page "Try Demo" flow
- Demo banner and upgrade CTAs

---

## 12) Open Questions

1. **Project requirement**: Should creating a project be required at all for Starter tier, or can solo users just use studios without ever creating a project?

2. **Semantic model sharing**: When a user creates a semantic model in the studio, should it be automatically available to all org members, or should there be explicit sharing/publishing?

3. **Credit tracking granularity**: Should we track credits at the org level (shared pool) or per-user within an org? Shared pool is simpler but doesn't let admins see who's consuming the most.

4. **Data source credentials**: For org-scoped connections, who can see/edit the credentials? Only the creator + admins, or all members?

5. **Demo → paid conversion**: When a demo user upgrades, should their demo project convert into a real project, or should they start fresh with their own data?

6. **Clerk metadata vs. Supabase for credits**: Clerk org metadata is convenient but has rate limits on updates. High-frequency credit tracking (every chat turn) might need to live in Supabase with periodic sync to Clerk.

---

*Last updated: March 4, 2026*
