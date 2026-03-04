# Lunara Architecture — Overview & Index

Date: March 4, 2026
Status: Active planning

---

## What This Folder Is

Each numbered doc is a focused design decision. Read them in order for the full picture, or jump to whichever one we're actively working on. Every doc follows the same format:

- **What this covers** — scope boundaries
- **Current state** — what exists today (code + schema)
- **Problems to solve** — the specific things that need fixing
- **Proposed design** — decisions and implementation
- **Schema changes** — exact migration SQL needed (cross-referenced with existing migrations)
- **Open questions** — things to resolve before building
- **Depends on** — which other docs need to be settled first

---

## Document Index

| # | Doc | Scope | Status |
|---|-----|-------|--------|
| 01 | [Clerk Org Model & Pricing](./01-clerk-org-model.md) | Clerk orgs, roles, metadata shape, pricing tiers, JWT claims | TODO |
| 02 | [Resource Scoping](./02-resource-scoping.md) | Org-scoped vs project-scoped, nullable `project_id`, RLS rewrite | TODO |
| 03 | [Data Connections](./03-data-connections.md) | Warehouse-agnostic provider pattern, credential storage, connection UI | TODO |
| 04 | [Semantic Studio](./04-semantic-studio.md) | Making the semantic agent warehouse-agnostic, model ↔ data source linking, model management | TODO |
| 05 | [Chat Studio](./05-chat-studio.md) | Session ↔ semantic model binding, context windows, artifact organization, session management | TODO |
| 06 | [Report Studio](./06-report-studio.md) | Report sessions, data input selection, canvas UX, report ↔ chat artifact linking | TODO |
| 07 | [Navigation & Layout](./07-navigation-and-layout.md) | App shell, routes, studio switching, sidebar, project filtering | TODO |
| 08 | [Billing & Limits](./08-billing-and-limits.md) | Stripe catalog, webhooks → Clerk sync, credit tracking, enforcement, overage invoicing | TODO |
| 09 | [Demo Mode](./09-demo-mode.md) | Demo activation, quota enforcement, cleanup — *see also `docs/DEMO_MODE_DESIGN.md`* | EXISTS |
| 10 | [Agent Modes](./10-agent-modes.md) | Ask/Plan/Agent capability gating — *see also `docs/agent_modes_design.md`* | EXISTS |

---

## Current Supabase Schema Snapshot

This is the ground truth. Every architecture doc references this when proposing schema changes.

### Existing Migrations (in order)

| # | File | Tables Created/Modified |
|---|------|------------------------|
| 001 | `projects_agents.sql` | `projects`, `agents` |
| 002 | `data_sources.sql` | `data_sources` |
| 003 | `semantic_models.sql` | `semantic_models` |
| 004 | `chat_sessions_artifacts.sql` | `chat_sessions`, `chat_artifacts` |
| 005 | `report_sessions_items.sql` | `report_sessions`, `report_items` |
| 006 | `report_sessions_add_messages.sql` | `report_sessions` (adds `messages JSONB`), `report_items` (re-created) |
| 007 | `clerk_migration.sql` | `profiles` → TEXT PK, `organizations` → TEXT PK, all `created_by` → TEXT, `projects.organization_id` → TEXT |

### Current Table Columns (Post-007)

```
organizations
  id TEXT PK                     ← Clerk org ID (org_xxx)
  name TEXT
  created_at, updated_at

profiles
  id TEXT PK                     ← Clerk user ID (user_xxx)
  email TEXT
  organization_id TEXT → organizations(id)
  created_at, updated_at

projects
  id UUID PK
  name TEXT
  description TEXT
  organization_id TEXT           ← direct org scope
  created_by TEXT                ← Clerk user ID
  created_at, updated_at

agents
  id UUID PK
  name TEXT
  description TEXT
  project_id UUID → projects(id) CASCADE    ← NOT NULL
  instructions TEXT
  config JSONB
  created_at, updated_at

data_sources
  id UUID PK
  project_id UUID → projects(id) CASCADE    ← NOT NULL
  type TEXT CHECK (bigquery|postgres|redshift|snowflake)
  name TEXT
  config JSONB
  status TEXT CHECK (pending|connected|error)
  created_at, updated_at

semantic_models
  id UUID PK
  project_id UUID → projects(id) CASCADE    ← NOT NULL
  name TEXT
  description TEXT
  model JSONB                    ← the semantic layer data
  source_type TEXT CHECK (bigquery|postgres|redshift|snowflake)
  table_count INTEGER
  created_by TEXT                ← Clerk user ID (was UUID)
  created_at, updated_at

chat_sessions
  id UUID PK
  project_id UUID → projects(id) CASCADE    ← NOT NULL
  name TEXT
  messages JSONB
  semantic_model_id UUID → semantic_models(id) SET NULL    ← EXISTING FK!
  created_by TEXT                ← Clerk user ID (was UUID)
  created_at, updated_at

chat_artifacts
  id UUID PK
  project_id UUID → projects(id) CASCADE    ← NOT NULL
  session_id UUID → chat_sessions(id) SET NULL
  title TEXT
  sql TEXT
  data JSONB
  created_by TEXT                ← Clerk user ID (was UUID)
  created_at TIMESTAMPTZ

report_sessions
  id UUID PK
  project_id UUID → projects(id) CASCADE    ← NOT NULL
  name TEXT
  messages JSONB                 ← added in 006
  created_by TEXT                ← Clerk user ID (was UUID)
  created_at, updated_at

report_items
  id UUID PK
  report_id UUID → report_sessions(id) CASCADE
  type TEXT (default 'html')
  title TEXT
  content TEXT
  position INTEGER
  created_at TIMESTAMPTZ
```

### Key Schema Issues to Address

These are the problems that the architecture docs need to solve:

| Issue | Affected Tables | Which Doc |
|-------|----------------|-----------|
| `project_id` is NOT NULL everywhere — blocks org-scoped studios | All resource tables | 02 |
| No `organization_id` on resource tables — org scoping requires project join | All except `projects` | 02 |
| No `data_source_id` on `semantic_models` — can't track which connection generated a model | `semantic_models` | 04 |
| `type` CHECK constraint is hardcoded to 4 warehouses | `data_sources` | 03 |
| `source_type` CHECK constraint same issue | `semantic_models` | 04 |
| RLS policies use `auth.uid()` but backend bypasses with service role | All tables | 02 |
| `chat_sessions.semantic_model_id` exists but no enforcement of which data source it connects to | `chat_sessions` | 05 |
| `chat_artifacts` has no `semantic_model_id` — can't trace artifact back to context | `chat_artifacts` | 05 |
| `report_sessions` has no `semantic_model_id` or `data_source_id` — no data lineage | `report_sessions` | 06 |
| No `data_source_id` on `chat_sessions` — agent doesn't know which warehouse to query | `chat_sessions` | 05 |
| Credentials stored in encrypted file on server, not per-connection in DB | Backend code | 03 |

---

## Dependency Graph

```
01-clerk-org-model
  └── defines org metadata shape that 08-billing writes to

02-resource-scoping
  └── unblocks everything else (03-06 all need org-scoped tables)

03-data-connections
  └── must be settled before 04 (semantic needs to know connection shape)

04-semantic-studio
  └── must be settled before 05 (chat binds to semantic models)

05-chat-studio
  └── must be settled before 06 (reports can consume chat artifacts)

06-report-studio
  └── can reference 05 for artifact input

07-navigation-and-layout
  └── can be designed in parallel (UI-only, no schema deps)

08-billing-and-limits
  └── depends on 01 (tier definitions) + 02 (what to count)

09-demo-mode (existing doc)
  └── depends on 03 (demo credentials) + 08 (limit enforcement)

10-agent-modes (existing doc)
  └── depends on 05 + 06 (mode selector lives in chat/report studios)
```

---

## Related Existing Docs

These docs were written before this architecture breakdown. Content from them will be absorbed into the numbered docs where relevant:

| Doc | Absorbs Into |
|-----|-------------|
| `docs/STUDIO_ARCHITECTURE_AND_USER_JOURNEY.md` | Split across all docs (the monolithic first draft) |
| `docs/Modulars.md` | 02 (resource scoping rationale) |
| `docs/PRICING_PLAN_AND_STRIPE_MCP_IMPLEMENTATION.md` | 01 (tier definitions) + 08 (Stripe implementation) |
| `docs/DEMO_MODE_DESIGN.md` | 09 (linked, not duplicated) |
| `docs/agent_modes_design.md` | 10 (linked, not duplicated) |
| `docs/report_builder_v2_roadmap.md` | 06 (report studio features) |
| `docs/SUPABASE_SCHEMA_REFERENCE.md` | 00 (this file replaces it as schema reference) |

---

## Working Agreement

1. We work through docs **in order** (01 → 02 → 03 → ...), except 07 which can happen in parallel.
2. Each doc gets discussed, iterated, and signed off before we move to the next.
3. Schema changes accumulate — we write one combined migration at the end (008_studio_architecture.sql), not one per doc.
4. No code gets written until the relevant doc is approved.

---

*Last updated: March 4, 2026*
