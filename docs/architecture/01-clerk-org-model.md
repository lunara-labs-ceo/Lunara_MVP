# 01 — Clerk Org Model & Pricing Tiers

**Scope:** How Clerk organizations map to Lunara tenancy, what metadata lives on the org, role definitions, and pricing tier structures.

**Depends on:** Nothing — this is the foundation.

---

## Current State

### What Exists

- Clerk auth is fully integrated (`frontend/proxy.ts`, `backend/middleware/clerk_auth.py`).
- Users sign up → create org on `/onboarding` → land on `/dashboard`.
- `ClerkUser` model in backend extracts `user_id`, `org_id`, `org_role`, `org_slug` from JWT.
- Lazy sync creates Supabase `profiles` and `organizations` rows on first API call.
- All API endpoints require `Depends(get_current_user)` but **don't use the user object** for scoping.

### What's Missing

- No plan tier metadata on Clerk orgs.
- No feature flags on Clerk orgs.
- No seat limit enforcement.
- Backend reads `org_id` from JWT but doesn't use it to scope queries.
- No connection between Clerk org metadata and what the user is allowed to do.

---

## Problems to Solve

1. **Where does the plan tier live?** We need a single source of truth that the backend can read on every request without a database query.
2. **How do we enforce seat limits?** When an admin invites a member, something needs to block the invite if the org is at capacity.
3. **How do roles map to permissions?** Clerk has built-in roles (`org:admin`, `org:member`) — do we use those or create custom ones?
4. **How does Stripe sync plan changes?** When a subscription upgrades/downgrades, how does the org metadata get updated?

---

## Proposed Design

### Clerk Org `publicMetadata` Shape

Every Clerk org gets this metadata, set during org creation (defaults) and updated by Stripe webhooks:

```json
{
  "plan": "starter",
  "stripe_customer_id": null,
  "stripe_subscription_id": null,
  "limits": {
    "seats": 2,
    "projects": 1,
    "data_sources": 1,
    "ai_credits_monthly": 300
  },
  "billing_cycle_start": null
}
```

**Why `publicMetadata`?**
- Readable from the frontend via `useOrganization()` — no extra API call to show plan badges, usage bars, upgrade CTAs.
- Included in JWT claims — backend reads it on every request without hitting Supabase.
- Writable only via Clerk Backend API (server-side) — frontend cannot tamper with it.

**Why limits on the org, not a separate table?**
- One less database query per request. The JWT already carries this.
- Stripe webhook updates one place (Clerk API), not two (Clerk + Supabase).
- If we need query-level analytics later, we can sync to Supabase periodically.

### Pricing Tiers

| | Starter (Free) | Growth | Scale | Enterprise |
|---|---|---|---|---|
| **Monthly** | $0 | $79 | $249 | Custom |
| **Annual** | $0 | $790 | $2,490 | Contract |
| **Seats** | 2 | 10 | 25 | Custom |
| **Projects** | 1 | 5 | 20 | Custom |
| **Data sources** | 1 | 3 | 10 | Custom |
| **AI credits/mo** | 300 | 5,000 | 20,000 | Custom |
| **Agent modes** | Ask only | Ask + Plan + Agent | Ask + Plan + Agent | All |
| **Report builder** | No | Yes | Yes | Yes |

Supported data sources: BigQuery, Supabase (PostgreSQL), with Snowflake, Redshift, Databricks planned.

### Default Metadata Per Tier

Set by Stripe webhook when subscription changes (or on org creation for Starter):

```python
TIER_DEFAULTS = {
    "starter": {
        "seats": 2,
        "projects": 1,
        "data_sources": 1,
        "ai_credits_monthly": 300,
    },
    "growth": {
        "seats": 10,
        "projects": 5,
        "data_sources": 3,
        "ai_credits_monthly": 5000,
    },
    "scale": {
        "seats": 25,
        "projects": 20,
        "data_sources": 10,
        "ai_credits_monthly": 20000,
    },
}
```

### Credit Costs

| Action | Credits |
|---|---|
| SQL Chat turn (NL → SQL) | 1 |
| Semantic model generation | 40 |
| Relationship detection | 10 |
| Report generation | 30 |

### Overage Add-ons (Growth & Scale Only)

| Add-on | Growth | Scale |
|---|---|---|
| Extra seat/month | $10 | $8 |
| Extra 1,000 AI credits | $20 | $16 |

### Roles

Use Clerk's built-in org roles. No custom roles for MVP.

| Role | Clerk Value | Permissions |
|---|---|---|
| Admin | `org:admin` | Full access. Manage billing, members, connections, all studios. Delete resources. |
| Member | `org:member` | Use all studios. Create/edit resources. Cannot manage billing or members. |

A `viewer` role is not needed for MVP — we can add it later via Clerk custom roles if needed.

### Seat Enforcement

Clerk provides `max_allowed_memberships` on the org object. When set:
- Clerk blocks invite attempts beyond the limit (returns error).
- No custom code needed.

Set via Clerk Backend API when plan changes:

```python
clerk.organizations.update(
    organization_id=org_id,
    max_allowed_memberships=TIER_DEFAULTS[plan]["seats"]
)
```

### Backend Enforcement Pattern

Every protected endpoint already has `user: ClerkUser = Depends(get_current_user)`. The `ClerkUser` will be extended to carry plan metadata from JWT claims:

```python
class ClerkUser(BaseModel):
    user_id: str
    org_id: Optional[str]
    org_role: Optional[str]
    org_slug: Optional[str]
    plan: str = "starter"          # NEW
    limits: dict = {}              # NEW
```

Populated from JWT custom claims (configured in Clerk Dashboard → Sessions → Customize session token):

```json
{
  "org_id": "{{org.id}}",
  "org_role": "{{org.role}}",
  "org_slug": "{{org.slug}}",
  "plan": "{{org.public_metadata.plan}}",
  "limits": "{{org.public_metadata.limits}}"
}
```

Then enforcement is a simple check:

```python
def require_plan(user: ClerkUser, min_plan: str):
    plan_order = {"starter": 0, "growth": 1, "scale": 2, "enterprise": 3}
    if plan_order.get(user.plan, 0) < plan_order[min_plan]:
        raise HTTPException(403, detail=f"Requires {min_plan} plan or higher")
```

### Setting Defaults on Org Creation

When a user creates an org (onboarding), the backend lazy-sync in `clerk_auth.py` should also set default metadata:

```python
# In _sync_user_to_supabase() — after creating org in Supabase
# Also set Clerk org metadata defaults
import httpx

async def _set_org_defaults(org_id: str):
    """Set Starter tier defaults on new org."""
    clerk_api = f"{CLERK_ISSUER_URL}/organizations/{org_id}/metadata"
    await httpx.patch(clerk_api, json={
        "public_metadata": {
            "plan": "starter",
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "limits": TIER_DEFAULTS["starter"],
            "billing_cycle_start": None,
        }
    }, headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"})
```

---

## Schema Changes

No Supabase schema changes needed for this doc. Clerk org metadata is stored in Clerk, not Supabase.

The only backend change is extending `ClerkUser` in `clerk_auth.py` to parse plan/limits from JWT claims.

---

## Open Questions

1. **Starter tier agent modes:** Should Starter users get only `ask` mode, or `ask` + `agent` (the current default behavior)? Restricting to `ask` only would mean they can't generate SQL at all, which hurts activation.

2. **Credit tracking location:** Clerk org metadata is convenient for limits, but `ai_credits_used` (a counter that increments on every chat turn) might hit Clerk API rate limits. Should we track usage in Supabase and sync to Clerk periodically? → Deferred to doc 08 (Billing & Limits).

3. **Enterprise tier:** Do we need to define Enterprise metadata now, or just leave it as "custom" until we have sales conversations?

---

*Last updated: March 4, 2026*
