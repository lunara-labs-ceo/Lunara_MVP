# 08 — Billing & Limits: Stripe, Credit Tracking & Enforcement

**Scope:** Stripe catalog design, webhook → Clerk sync, credit tracking (where and how), enforcement middleware, usage display, and the billing settings page.

**Depends on:** 01 (tier definitions + Clerk metadata shape), 02 (what resources to count)

---

## Current State

### What Exists

- **Pricing plan doc** (`docs/PRICING_PLAN_AND_STRIPE_MCP_IMPLEMENTATION.md`) with tier definitions and Stripe catalog design.
- **No Stripe integration.** No products, prices, subscriptions, or webhooks.
- **No limit enforcement.** All API endpoints are unlimited for any authenticated user.
- **No usage tracking.** No counters for AI credits, projects, data sources, or seats.
- **Clerk org metadata** is empty (no `plan` or `limits` fields set).

### What's Defined in Doc 01

- Tier limits: seats, projects, data sources, AI credits per month.
- Clerk org `publicMetadata.limits` shape.
- `ClerkUser` model extended with `plan` and `limits` from JWT claims.

---

## Problems to Solve

1. **Where to track AI credit usage?** Every chat turn costs 1 credit. Updating Clerk org metadata on every chat turn would hit Clerk API rate limits. Need a fast, local counter.

2. **How to sync Stripe → Clerk?** When a subscription changes, how does the plan tier propagate to Clerk org metadata and then to every subsequent JWT?

3. **How to enforce limits without adding latency?** Checking "has this org exceeded its project limit" shouldn't require a database round-trip on every request.

4. **Monthly credit reset.** Credits reset on billing cycle start. Who triggers this and where?

---

## Proposed Design

### 1. Credit Tracking: Supabase, Not Clerk

Clerk org metadata is great for **slow-changing limits** (plan tier, seat cap, project cap). But AI credits change on every chat turn — too frequent for Clerk API calls.

**Solution:** Track `ai_credits_used` in a Supabase table. Sync to Clerk periodically (or on billing page load).

```sql
-- New table: org_usage (one row per org per billing cycle)
CREATE TABLE IF NOT EXISTS org_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id TEXT NOT NULL,
    billing_cycle_start TIMESTAMPTZ NOT NULL,
    ai_credits_used INTEGER NOT NULL DEFAULT 0,
    chat_turns INTEGER NOT NULL DEFAULT 0,
    semantic_runs INTEGER NOT NULL DEFAULT 0,
    relationship_runs INTEGER NOT NULL DEFAULT 0,
    report_runs INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, billing_cycle_start)
);

ALTER TABLE org_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON org_usage
    FOR ALL USING (true) WITH CHECK (true);
```

### 2. Credit Consumption Flow

```python
# backend/services/billing.py

async def consume_credits(org_id: str, action: str, amount: int) -> int:
    """
    Atomically consume credits. Returns remaining credits.
    Raises HTTPException(429) if limit exceeded.
    """
    # Get org limits from Clerk (cached in ClerkUser from JWT)
    # This is passed in from the endpoint, not fetched here

    # Atomic increment in Supabase
    result = supabase.rpc("consume_ai_credits", {
        "p_org_id": org_id,
        "p_amount": amount,
        "p_limit": credit_limit,
    }).execute()

    if result.data["exceeded"]:
        raise HTTPException(429, detail={
            "error": "credit_limit_reached",
            "action": action,
            "used": result.data["new_total"],
            "limit": credit_limit,
        })

    return credit_limit - result.data["new_total"]
```

Supabase RPC for atomic consumption:

```sql
CREATE OR REPLACE FUNCTION consume_ai_credits(
    p_org_id TEXT,
    p_amount INTEGER,
    p_limit INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_cycle_start TIMESTAMPTZ;
    v_current_used INTEGER;
    v_new_total INTEGER;
BEGIN
    -- Current billing cycle (first of the month, or from Clerk metadata)
    v_cycle_start := date_trunc('month', NOW());

    -- Upsert usage row for this cycle
    INSERT INTO org_usage (organization_id, billing_cycle_start, ai_credits_used)
    VALUES (p_org_id, v_cycle_start, p_amount)
    ON CONFLICT (organization_id, billing_cycle_start)
    DO UPDATE SET
        ai_credits_used = org_usage.ai_credits_used + p_amount,
        updated_at = NOW()
    RETURNING ai_credits_used INTO v_new_total;

    -- Check limit
    IF v_new_total > p_limit THEN
        -- Rollback the increment
        UPDATE org_usage
        SET ai_credits_used = ai_credits_used - p_amount,
            updated_at = NOW()
        WHERE organization_id = p_org_id
        AND billing_cycle_start = v_cycle_start;

        RETURN jsonb_build_object('exceeded', true, 'new_total', v_new_total - p_amount);
    END IF;

    RETURN jsonb_build_object('exceeded', false, 'new_total', v_new_total);
END;
$$ LANGUAGE plpgsql;
```

### 3. Limit Enforcement Middleware

A reusable dependency that checks limits before allowing an action:

```python
# backend/middleware/limits.py

from enum import Enum

class LimitAction(str, Enum):
    CHAT_TURN = "chat_turn"           # 1 credit
    SEMANTIC_RUN = "semantic_run"     # 40 credits
    RELATIONSHIP_RUN = "relationship_run"  # 10 credits
    REPORT_RUN = "report_run"         # 30 credits

CREDIT_COSTS = {
    LimitAction.CHAT_TURN: 1,
    LimitAction.SEMANTIC_RUN: 40,
    LimitAction.RELATIONSHIP_RUN: 10,
    LimitAction.REPORT_RUN: 30,
}

async def enforce_credits(user: ClerkUser, action: LimitAction):
    """Check and consume AI credits. Raises 429 if exceeded."""
    cost = CREDIT_COSTS[action]
    credit_limit = user.limits.get("ai_credits_monthly", 0)
    await consume_credits(user.org_id, action.value, cost, credit_limit)

async def enforce_resource_limit(user: ClerkUser, resource: str):
    """Check resource count limits (projects, data sources). Raises 403 if at limit."""
    limits = {
        "projects": user.limits.get("projects", 1),
        "data_sources": user.limits.get("data_sources", 1),
    }
    max_count = limits.get(resource, 0)

    current_count = supabase.table(resource) \
        .select("id", count="exact") \
        .eq("organization_id", user.org_id) \
        .execute()

    if current_count.count >= max_count:
        raise HTTPException(403, detail={
            "error": "resource_limit_reached",
            "resource": resource,
            "current": current_count.count,
            "limit": max_count,
        })
```

### 4. Where Limits Are Enforced (By Endpoint)

| Endpoint | Limit Check |
|---|---|
| `POST /chat/query` | `enforce_credits(user, CHAT_TURN)` |
| `POST /chat/execute` | None (execution is free — credits are for AI generation) |
| `POST /semantic/generate` | `enforce_credits(user, SEMANTIC_RUN)` |
| `POST /semantic/detect-relationships` | `enforce_credits(user, RELATIONSHIP_RUN)` |
| `POST /reports/{id}/generate` | `enforce_credits(user, REPORT_RUN)` |
| `POST /connections` | `enforce_resource_limit(user, "data_sources")` |
| `POST /projects` | `enforce_resource_limit(user, "projects")` |
| Member invite | Clerk handles via `max_allowed_memberships` |

### 5. Stripe Catalog

Products and prices to create in Stripe:

```
Products:
  lunara_growth          → Growth plan
  lunara_scale           → Scale plan
  lunara_seat_addon      → Extra seat add-on
  lunara_credits_1000    → Extra 1,000 AI credits

Prices:
  growth_monthly         → $79/month recurring
  growth_annual          → $790/year recurring
  scale_monthly          → $249/month recurring
  scale_annual           → $2,490/year recurring
  seat_addon_growth      → $10/month recurring (metered)
  seat_addon_scale       → $8/month recurring (metered)
  credits_growth         → $20 one-time
  credits_scale          → $16 one-time

Coupon:
  lunara_launch_20       → 20% off for 3 months
```

### 6. Stripe → Clerk Sync (Webhook Handler)

```python
# backend/api/v1/webhooks.py

@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)

    if event["type"] == "customer.subscription.created":
        await handle_subscription_change(event["data"]["object"])
    elif event["type"] == "customer.subscription.updated":
        await handle_subscription_change(event["data"]["object"])
    elif event["type"] == "customer.subscription.deleted":
        await handle_subscription_cancel(event["data"]["object"])
    elif event["type"] == "invoice.paid":
        await handle_invoice_paid(event["data"]["object"])

    return {"received": True}

async def handle_subscription_change(subscription):
    """Sync subscription plan to Clerk org metadata."""
    customer_id = subscription["customer"]
    plan_price_id = subscription["items"]["data"][0]["price"]["id"]

    # Map Stripe price ID to Lunara plan tier
    plan = PRICE_TO_PLAN.get(plan_price_id, "starter")
    limits = TIER_DEFAULTS[plan]

    # Find org by Stripe customer ID (stored in Clerk metadata)
    # This requires a lookup — either via Clerk search or a mapping table
    org_id = await find_org_by_stripe_customer(customer_id)

    # Update Clerk org metadata
    await clerk_api.organizations.update(org_id, {
        "public_metadata": {
            "plan": plan,
            "stripe_customer_id": customer_id,
            "stripe_subscription_id": subscription["id"],
            "limits": limits,
            "billing_cycle_start": subscription["current_period_start"],
        }
    })

    # Update Clerk seat limit
    await clerk_api.organizations.update(org_id, {
        "max_allowed_memberships": limits["seats"],
    })
```

### 7. Monthly Credit Reset

Credits reset automatically because `org_usage` is keyed by `(organization_id, billing_cycle_start)`. Each new month creates a fresh row with `ai_credits_used = 0`.

No cron job needed. The `consume_ai_credits` RPC handles it via `date_trunc('month', NOW())`.

For Stripe-aligned billing cycles (not calendar month), use the `billing_cycle_start` from the subscription webhook instead.

### 8. Billing Settings Page

```
/settings/billing
  ┌───────────────────────────────────────────────────────────┐
  │ Plan & Billing                                            │
  │                                                           │
  │  Current Plan: Growth ($79/month)                         │
  │  Billing period: Mar 1 - Mar 31, 2026                     │
  │  [Manage Subscription] ← opens Stripe Customer Portal     │
  │                                                           │
  │  Usage This Period                                        │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │ AI Credits   ██████████░░░░░░░░░  2,340 / 5,000   │  │
  │  │ Projects     ███░░░░░░░░░░░░░░░░  3 / 5           │  │
  │  │ Data Sources ██░░░░░░░░░░░░░░░░░  2 / 3           │  │
  │  │ Seats        ████░░░░░░░░░░░░░░░  4 / 10          │  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                           │
  │  Credit Breakdown                                         │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │ Chat turns (1 credit each)    │     1,842          │  │
  │  │ Semantic generations (40 ea)  │       120 (3 runs) │  │
  │  │ Relationship detection (10)   │        30 (3 runs) │  │
  │  │ Report generations (30 ea)    │       348 (11 runs)│  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                           │
  │  Need more?                                               │
  │  [Buy 1,000 Credits — $20]  [Upgrade to Scale →]         │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
```

### Data Sources for This Page

- **Plan info:** `useOrganization()` → `org.publicMetadata.plan`, `org.publicMetadata.limits`
- **Credit usage:** `GET /api/v1/billing/usage` → reads from `org_usage` table
- **Resource counts:** `GET /api/v1/billing/usage` → counts from Supabase tables
- **Manage subscription:** Stripe Customer Portal link (created via Stripe API)
- **Buy credits:** Stripe Payment Link for credit pack

### 9. Stripe Customer Portal

For self-serve plan management (upgrade, downgrade, cancel, payment method):

```python
# POST /api/v1/billing/portal
async def create_portal_session(user: ClerkUser = Depends(get_current_user)):
    customer_id = user.limits.get("stripe_customer_id")  # from Clerk metadata
    if not customer_id:
        raise HTTPException(400, "No billing account")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{FRONTEND_URL}/settings/billing",
    )
    return {"url": session.url}
```

### 10. Upgrade Flow (Self-Serve)

```
User on Starter clicks "Upgrade to Growth"
  → Frontend creates Stripe Checkout Session
    (or uses Payment Link with prefilled customer)
  → User completes payment on Stripe
  → Stripe fires `customer.subscription.created` webhook
  → Webhook handler updates Clerk org metadata:
    plan: "growth", limits: { seats: 10, projects: 5, ... }
  → Next API request carries updated JWT claims
  → User has Growth access immediately
```

---

## Schema Changes

### In Migration 008 (Combined)

```sql
-- New table: org_usage
CREATE TABLE IF NOT EXISTS org_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id TEXT NOT NULL,
    billing_cycle_start TIMESTAMPTZ NOT NULL,
    ai_credits_used INTEGER NOT NULL DEFAULT 0,
    chat_turns INTEGER NOT NULL DEFAULT 0,
    semantic_runs INTEGER NOT NULL DEFAULT 0,
    relationship_runs INTEGER NOT NULL DEFAULT 0,
    report_runs INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, billing_cycle_start)
);

ALTER TABLE org_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON org_usage
    FOR ALL USING (true) WITH CHECK (true);

-- RPC for atomic credit consumption
CREATE OR REPLACE FUNCTION consume_ai_credits(
    p_org_id TEXT,
    p_amount INTEGER,
    p_limit INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_cycle_start TIMESTAMPTZ;
    v_new_total INTEGER;
BEGIN
    v_cycle_start := date_trunc('month', NOW());

    INSERT INTO org_usage (organization_id, billing_cycle_start, ai_credits_used)
    VALUES (p_org_id, v_cycle_start, p_amount)
    ON CONFLICT (organization_id, billing_cycle_start)
    DO UPDATE SET
        ai_credits_used = org_usage.ai_credits_used + p_amount,
        updated_at = NOW()
    RETURNING ai_credits_used INTO v_new_total;

    IF v_new_total > p_limit THEN
        UPDATE org_usage
        SET ai_credits_used = ai_credits_used - p_amount,
            updated_at = NOW()
        WHERE organization_id = p_org_id
        AND billing_cycle_start = v_cycle_start;

        RETURN jsonb_build_object('exceeded', true, 'new_total', v_new_total - p_amount);
    END IF;

    RETURN jsonb_build_object('exceeded', false, 'new_total', v_new_total);
END;
$$ LANGUAGE plpgsql;
```

---

## Open Questions

1. **Stripe customer creation timing:** When does the Stripe customer get created? On sign-up (every user gets a Stripe customer), or only when they first attempt to upgrade?
   - **Recommendation:** Create Stripe customer on first upgrade attempt. Starter users don't need one. Avoids polluting Stripe with users who never pay.

2. **Billing cycle alignment:** The `date_trunc('month', NOW())` approach uses calendar months. Stripe subscriptions can start any day. Should we align credit resets with Stripe billing cycles?
   - **Recommendation:** Use calendar months for MVP simplicity. Align with Stripe billing cycle later (read `current_period_start` from webhook).

3. **Grace period on limit hit:** When credits run out mid-chat, should the current request complete (graceful) or fail immediately?
   - **Recommendation:** Fail before starting the AI call. Check credits before calling the LLM, not after. The user sees "credits exhausted" instead of a partial response.

4. **Overage invoicing:** The pricing doc mentions auto-invoiced overages. Should Growth/Scale users be able to exceed their credit limit and get billed for overages, or hard-stop?
   - **Recommendation:** Hard-stop for MVP. Users can buy credit packs. Auto-invoiced overages add complexity (metered billing, invoice items) — defer to later.

---

*Last updated: March 4, 2026*
