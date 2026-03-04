# 02 — Resource Scoping: Org-Level with Optional Projects

**Scope:** Moving all resource tables from `project_id NOT NULL` to `organization_id` + nullable `project_id`. RLS policy rewrite. How projects become optional grouping containers.

**Depends on:** 01 (Clerk org model — defines `org_id` format and tenancy model)

---

## Current State

### Every Resource Requires a Project

Today, the table hierarchy is:

```
organizations (TEXT PK — Clerk org ID)
  └── projects (UUID PK, organization_id TEXT NOT NULL)
       ├── data_sources       (project_id UUID NOT NULL)
       ├── semantic_models    (project_id UUID NOT NULL)
       ├── chat_sessions      (project_id UUID NOT NULL)
       ├── chat_artifacts     (project_id UUID NOT NULL)
       ├── report_sessions    (project_id UUID NOT NULL)
       └── report_items       (report_id → report_sessions)
```

Every resource inherits org access through a two-hop join: `resource.project_id → projects.organization_id → profiles.organization_id`.

### RLS Pattern (Same on All Tables)

```sql
-- Example from chat_sessions (004)
CREATE POLICY "View project chat sessions" ON chat_sessions
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects
            WHERE organization_id = (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );
```

This pattern is repeated for SELECT, INSERT, UPDATE, DELETE on every resource table.

### What the Clerk Migration (007) Changed

- `profiles.id` → TEXT (Clerk user ID)
- `organizations.id` → TEXT (Clerk org ID)
- `projects.organization_id` → TEXT
- `created_by` columns → TEXT on all tables
- RLS policies using `auth.uid()` left in place as "safety net"
- **Backend uses service role key** (bypasses RLS) — auth enforced in code via Clerk JWT

### Implication

RLS policies referencing `auth.uid()` are effectively dead code. The backend bypasses them with the service role key. Auth is enforced by the Clerk middleware in Python, not by Postgres RLS.

This means the RLS rewrite for org-scoping is a **safety net update**, not a functional change. The real enforcement happens in backend code.

---

## Problems to Solve

1. **You can't use a studio without a project.** Creating a semantic model, starting a chat, or generating a report all require `project_id NOT NULL`. This blocks the studio-first workflow where a user connects data and starts exploring without creating a project.

2. **Resources can't be shared across projects.** A semantic model in Project A can't be used by a chat session in Project B. Users who organize by project can't reuse work across them.

3. **No direct org scoping.** To check "does this user have access to this chat session?", the backend must join through `projects`. With `organization_id` directly on the resource, it's a single column check.

4. **`created_by` is set but never checked.** All tables have `created_by TEXT` but no endpoint validates ownership at the user level. Everything is org-scoped.

---

## Proposed Design

### Target Hierarchy

```
organizations (TEXT PK — Clerk org ID)
  ├── data_sources       (organization_id TEXT NOT NULL, project_id UUID NULLABLE)
  ├── semantic_models    (organization_id TEXT NOT NULL, project_id UUID NULLABLE)
  ├── chat_sessions      (organization_id TEXT NOT NULL, project_id UUID NULLABLE)
  ├── chat_artifacts     (organization_id TEXT NOT NULL, project_id UUID NULLABLE)
  ├── report_sessions    (organization_id TEXT NOT NULL, project_id UUID NULLABLE)
  ├── report_items       (report_id → report_sessions, inherits scoping)
  │
  └── projects           (organization_id TEXT NOT NULL) ← still exists, now optional
       └── agents        (project_id UUID NOT NULL) ← agents still require projects
```

### Rules

- **`organization_id` is always required.** Every resource belongs to an org.
- **`project_id` is nullable.** `NULL` means "org-wide resource, not grouped into any project."
- **Projects still exist** as optional containers. Users who want to organize work by use case can assign resources to projects.
- **Agents still require projects.** An agent is a saved chat configuration inside a project — it doesn't make sense org-wide.

### Query Patterns

```sql
-- Studio view: all semantic models in my org
SELECT * FROM semantic_models
WHERE organization_id = 'org_xxx';

-- Project view: models in this project + org-wide models
SELECT * FROM semantic_models
WHERE organization_id = 'org_xxx'
AND (project_id = 'proj-uuid' OR project_id IS NULL);

-- Create in studio (no project)
INSERT INTO semantic_models (organization_id, project_id, ...)
VALUES ('org_xxx', NULL, ...);

-- Create inside a project
INSERT INTO semantic_models (organization_id, project_id, ...)
VALUES ('org_xxx', 'proj-uuid', ...);

-- Move a resource into a project (or out)
UPDATE semantic_models
SET project_id = 'proj-uuid'  -- or SET project_id = NULL
WHERE id = 'model-uuid' AND organization_id = 'org_xxx';
```

### Backend Enforcement

Since RLS is bypassed (service role key), the backend enforces scoping in code:

```python
# Every endpoint that reads/writes resources:
async def get_semantic_models(user: ClerkUser = Depends(get_current_user)):
    if not user.org_id:
        raise HTTPException(403, "Organization required")

    result = supabase.table("semantic_models") \
        .select("*") \
        .eq("organization_id", user.org_id) \
        .execute()

    return result.data
```

For project-filtered views:

```python
async def get_project_resources(project_id: str, user: ClerkUser = Depends(get_current_user)):
    # Verify project belongs to user's org
    project = supabase.table("projects") \
        .select("id") \
        .eq("id", project_id) \
        .eq("organization_id", user.org_id) \
        .single() \
        .execute()

    if not project.data:
        raise HTTPException(404, "Project not found")

    # Get resources in this project + org-wide
    result = supabase.table("semantic_models") \
        .select("*") \
        .eq("organization_id", user.org_id) \
        .or_(f"project_id.eq.{project_id},project_id.is.null") \
        .execute()

    return result.data
```

---

## Schema Changes

### Migration: `008_org_scoping.sql`

```sql
-- ============================================
-- Migration: 008_org_scoping.sql
-- Add organization_id to all resource tables
-- Make project_id nullable
-- ============================================

-- ----------------------------------------
-- 1. data_sources
-- ----------------------------------------
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS organization_id TEXT;

-- Backfill from projects
UPDATE data_sources ds
SET organization_id = p.organization_id
FROM projects p
WHERE ds.project_id = p.id
AND ds.organization_id IS NULL;

ALTER TABLE data_sources ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE data_sources ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_sources_org_id ON data_sources(organization_id);

-- ----------------------------------------
-- 2. semantic_models
-- ----------------------------------------
ALTER TABLE semantic_models ADD COLUMN IF NOT EXISTS organization_id TEXT;

UPDATE semantic_models sm
SET organization_id = p.organization_id
FROM projects p
WHERE sm.project_id = p.id
AND sm.organization_id IS NULL;

ALTER TABLE semantic_models ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE semantic_models ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semantic_models_org_id ON semantic_models(organization_id);

-- ----------------------------------------
-- 3. chat_sessions
-- ----------------------------------------
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS organization_id TEXT;

UPDATE chat_sessions cs
SET organization_id = p.organization_id
FROM projects p
WHERE cs.project_id = p.id
AND cs.organization_id IS NULL;

ALTER TABLE chat_sessions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE chat_sessions ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_org_id ON chat_sessions(organization_id);

-- ----------------------------------------
-- 4. chat_artifacts
-- ----------------------------------------
ALTER TABLE chat_artifacts ADD COLUMN IF NOT EXISTS organization_id TEXT;

UPDATE chat_artifacts ca
SET organization_id = p.organization_id
FROM projects p
WHERE ca.project_id = p.id
AND ca.organization_id IS NULL;

ALTER TABLE chat_artifacts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE chat_artifacts ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_artifacts_org_id ON chat_artifacts(organization_id);

-- ----------------------------------------
-- 5. report_sessions
-- ----------------------------------------
ALTER TABLE report_sessions ADD COLUMN IF NOT EXISTS organization_id TEXT;

UPDATE report_sessions rs
SET organization_id = p.organization_id
FROM projects p
WHERE rs.project_id = p.id
AND rs.organization_id IS NULL;

ALTER TABLE report_sessions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE report_sessions ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_sessions_org_id ON report_sessions(organization_id);

-- ----------------------------------------
-- 6. Update RLS policies (safety net — backend bypasses with service role)
-- ----------------------------------------

-- data_sources
DROP POLICY IF EXISTS "View project data sources" ON data_sources;
DROP POLICY IF EXISTS "Create project data sources" ON data_sources;
DROP POLICY IF EXISTS "Update project data sources" ON data_sources;
DROP POLICY IF EXISTS "Delete project data sources" ON data_sources;

CREATE POLICY "Org access data_sources" ON data_sources
    FOR ALL USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- semantic_models
DROP POLICY IF EXISTS "View project semantic models" ON semantic_models;
DROP POLICY IF EXISTS "Create project semantic models" ON semantic_models;
DROP POLICY IF EXISTS "Update project semantic models" ON semantic_models;
DROP POLICY IF EXISTS "Delete project semantic models" ON semantic_models;

CREATE POLICY "Org access semantic_models" ON semantic_models
    FOR ALL USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- chat_sessions
DROP POLICY IF EXISTS "View project chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Create project chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Update project chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Delete project chat sessions" ON chat_sessions;

CREATE POLICY "Org access chat_sessions" ON chat_sessions
    FOR ALL USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- chat_artifacts
DROP POLICY IF EXISTS "View project chat artifacts" ON chat_artifacts;
DROP POLICY IF EXISTS "Create project chat artifacts" ON chat_artifacts;
DROP POLICY IF EXISTS "Update project chat artifacts" ON chat_artifacts;
DROP POLICY IF EXISTS "Delete project chat artifacts" ON chat_artifacts;

CREATE POLICY "Org access chat_artifacts" ON chat_artifacts
    FOR ALL USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- report_sessions
DROP POLICY IF EXISTS "View project report sessions" ON report_sessions;
DROP POLICY IF EXISTS "Create project report sessions" ON report_sessions;
DROP POLICY IF EXISTS "Update project report sessions" ON report_sessions;
DROP POLICY IF EXISTS "Delete project report sessions" ON report_sessions;

CREATE POLICY "Org access report_sessions" ON report_sessions
    FOR ALL USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- report_items (still inherit via report_sessions join, but simplified)
DROP POLICY IF EXISTS "View report items" ON report_items;
DROP POLICY IF EXISTS "Create report items" ON report_items;
DROP POLICY IF EXISTS "Update report items" ON report_items;
DROP POLICY IF EXISTS "Delete report items" ON report_items;

CREATE POLICY "Org access report_items" ON report_items
    FOR ALL USING (
        report_id IN (
            SELECT id FROM report_sessions
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    )
    WITH CHECK (
        report_id IN (
            SELECT id FROM report_sessions
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );
```

---

## What This Enables

After this migration:

- **Studios can work without projects.** A user can connect data, generate a semantic model, start chatting, and build reports — all with `project_id = NULL`.
- **Projects become organizational.** Users who want to group related work can create projects and assign resources. But it's optional.
- **Cross-project reuse.** A semantic model with `project_id = NULL` is visible from any project in the org.
- **Simpler backend queries.** Filter by `organization_id` directly instead of joining through `projects`.

---

## Open Questions

1. **Should we backfill existing resources to `project_id = NULL`?** Existing resources have `project_id` set. After migration, they'll still be project-scoped. Should we leave them as-is (user sees them in their original project), or detach them to org-level?
   - **Recommendation:** Leave as-is. Existing resources keep their project association. New studio-created resources get `project_id = NULL`.

2. **Can a resource be moved between projects?** If yes, it's just `UPDATE ... SET project_id = 'new-proj'`. If we allow detaching (`SET project_id = NULL`), users can "free" resources from projects.
   - **Recommendation:** Allow both for MVP. It's just an UPDATE.

3. **What about `agents`?** Agents are project-specific by design (saved chat configurations inside a project context). They should stay `project_id NOT NULL`.
   - **Recommendation:** Leave agents unchanged.

---

*Last updated: March 4, 2026*
