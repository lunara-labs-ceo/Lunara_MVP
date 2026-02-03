# Lunara Supabase Schema Reference

This document explains the database schema design for Lunara and the reasoning behind each decision.

---

## App Overview

**Lunara = AI-Powered Business Intelligence Platform**

**Core idea:** Connect your data warehouse → Let AI understand your data → Chat with your data / Build reports and dashboards

### User Flow

```
1. DASHBOARD
   └── Projects (workspaces for different use cases)
   └── Agents (saved chat configurations)
          ↓
2. CREATE/SELECT PROJECT (e.g., "Reporting", "Data Science")
          ↓
3. DATA SOURCE CONNECTION
   └── BigQuery, Postgres, AWS, etc.
          ↓
4. SEMANTIC LAYER SETUP
   └── AI generates business-friendly definitions of your tables/columns
   └── (dimensions, measures, relationships)
          ↓
5. SQL CHAT PAGE
   └── Ask questions in natural language
   └── AI writes SQL, queries your data, returns results
   └── "Save as Agent" option to reuse configurations
          ↓
6. BUILD (output artifacts)
   └── Slides (Nano Banana Pro integration)
   └── Dashboards (Streamlit)
   └── Reports
   └── All saved back to the project
```

---

## Current Supabase Schema (Already Exists)

Based on what exists in the codebase:

```
┌─────────────────┐         ┌─────────────────┐
│   auth.users    │         │  organizations  │
│─────────────────│         │─────────────────│
│ id (UUID)       │         │ id (UUID)       │
│ email           │         │ name            │
│ ...             │         │ created_at      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ 1:1                       │ 1:N
         ▼                           │
┌─────────────────┐                  │
│    profiles     │◄─────────────────┘
│─────────────────│
│ id (UUID) = user.id
│ organization_id │ ─► References organizations
│ ...             │
└─────────────────┘
```

**Why this exists:** Authentication is user-scoped via Supabase Auth, and each user belongs to an organization (multi-tenancy).

---

## New Schema: Projects & Agents

```sql
┌─────────────────┐
│    projects     │
│─────────────────│
│ id (UUID)       │  ◄── Primary key
│ name            │  ◄── "Reporting", "Data Engineering"
│ description     │  ◄── Optional project description
│ organization_id │  ─► References organizations (for RLS)
│ created_by      │  ─► References auth.users (who created it)
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N (one project has many agents)
         ▼
┌─────────────────┐
│     agents      │
│─────────────────│
│ id (UUID)       │  ◄── Primary key
│ name            │  ◄── "Sales Chat Agent"
│ description     │  ◄── What the agent does
│ project_id      │  ─► References projects (CASCADE delete)
│ instructions    │  ◄── System prompt/instructions for the agent
│ config (JSONB)  │  ◄── Flexible config (model settings, etc.)
│ created_at      │
│ updated_at      │
└─────────────────┘
```

---

## Why This Schema Works

### 1. User Scoping via Organization

```sql
-- Projects belong to organizations, not directly to users
organization_id UUID REFERENCES organizations(id)
```

**Why:** The app is multi-tenant. Multiple users in the same organization should see the same projects. If User A creates "Sales Analytics" project, User B in the same org should also see it.

### 2. Row Level Security (RLS)

```sql
-- Users can only see projects in their organization
CREATE POLICY "View org projects" ON projects
    FOR SELECT USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );
```

**Why:** RLS is enforced at the database level. Even if someone tries to bypass the frontend, they can't access other organizations' data. The `auth.uid()` function returns the current authenticated user's ID from their JWT token.

### 3. Agents Inherit Project Access

```sql
-- Agents visible if user has access to the parent project
CREATE POLICY "View project agents" ON agents
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );
```

**Why:** Agents live inside projects. Rather than duplicating `organization_id` on agents, we check access transitively: "Can this user see the project? If yes, they can see its agents."

### 4. Cascade Deletes

```sql
project_id UUID REFERENCES projects(id) ON DELETE CASCADE
```

**Why:** If a project is deleted, all its agents are automatically deleted. No orphaned data.

### 5. Flexible Config with JSONB

```sql
config JSONB DEFAULT '{}'
```

**Why:** Agent configuration will evolve. Instead of adding columns for every setting (model, temperature, max_tokens, etc.), JSONB lets you store flexible data:

```json
{
  "model": "gemini-1.5-pro",
  "temperature": 0.7,
  "semantic_model_id": "abc-123"
}
```

### 6. Updated Timestamps via Trigger

```sql
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Why:** Automatically tracks when records change. Useful for "last modified" displays and cache invalidation.

---

## How It Supports the User Flow

| User Action | Database Operation |
|-------------|-------------------|
| Dashboard loads | `SELECT * FROM projects` → RLS filters to user's org |
| Create "Reporting" project | `INSERT INTO projects` → organization_id set from user's profile |
| Enter project → Create agent | `INSERT INTO agents` with `project_id` |
| Different user logs in | Same queries, but RLS returns different org's data |

---

## Future Schema: Artifacts (Reports, Slides, Dashboards)

The current schema only covers Projects and Agents. When we build the artifact creation features, we'll need:

```
┌─────────────────┐
│    projects     │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────┐
│                        artifacts                             │
│─────────────────────────────────────────────────────────────│
│ id (UUID)                                                   │
│ project_id        ─► References projects                    │
│ type              ◄── 'report' | 'slide' | 'dashboard'      │
│ name              ◄── "Q4 Sales Report"                     │
│ description       ◄── Optional                              │
│ content (JSONB)   ◄── The actual artifact data              │
│ status            ◄── 'draft' | 'published'                 │
│ created_by        ─► References auth.users                  │
│ created_at        │                                         │
│ updated_at        │                                         │
└─────────────────────────────────────────────────────────────┘
```

### Why One Table vs Three Separate Tables?

**Option A: Single `artifacts` table with `type` column** ✅ Recommended

```sql
type TEXT CHECK (type IN ('report', 'slide', 'dashboard'))
```

**Pros:**
- Simpler querying ("show me all artifacts in this project")
- Fewer tables to maintain
- Easy to add new types later (just add to the check constraint)

**Cons:**
- `content` JSONB structure varies by type

---

**Option B: Separate `reports`, `slides`, `dashboards` tables**

**Pros:**
- Strongly typed columns per artifact type
- Cleaner if each type has very different fields

**Cons:**
- More tables, more RLS policies to maintain
- Harder to query "all artifacts" across types

---

### What Goes in `content` (JSONB)?

| Type | Example Content |
|------|-----------------|
| **Report** | `{ "blocks": [...], "title": "...", "theme": "dark" }` |
| **Slide** | `{ "slides": [...], "template": "nano-banana-pro" }` |
| **Dashboard** | `{ "widgets": [...], "layout": "grid", "refresh_interval": 300 }` |

The JSONB column gives flexibility - each artifact type can have its own structure without schema changes.

---

## Other Future Tables

| Table | Purpose |
|-------|---------|
| `data_sources` | Store BQ/Postgres/AWS connections per project |
| `semantic_models` | Store semantic layer definitions per project |
| `agent_sessions` | Store chat history per agent |
| `artifact_versions` | Track version history of reports/slides (optional) |

---

## Implementation Approach

Add tables **incrementally**:

1. **Now:** Just `projects` and `agents` (foundation)
2. **When migrating Reports:** Add `artifacts` table
3. **When migrating Data Sources:** Add `data_sources` table
4. **etc.**

This keeps each change small and testable.

---

## Complete Schema Diagram (Future State)

```
                    ┌─────────────────┐
                    │  organizations  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  profiles   │  │  projects   │  │    ...      │
     └─────────────┘  └──────┬──────┘  └─────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   agents    │     │  artifacts  │     │data_sources │
  └─────────────┘     └─────────────┘     └─────────────┘
         │
         ▼
  ┌─────────────┐
  │agent_sessions│
  └─────────────┘
```

---

*Last updated: February 2, 2026*
