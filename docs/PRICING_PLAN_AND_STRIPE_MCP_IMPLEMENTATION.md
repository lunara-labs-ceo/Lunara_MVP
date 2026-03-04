# Lunara Pricing Plan + Stripe MCP Implementation Plan (Draft)

Date: February 22, 2026  
Status: Draft for approval (no code implementation yet)  
Currency: USD

## 1) Packaging and pricing strategy

Lunara is an AI-first BI product with bring-your-own-warehouse (BigQuery).  
The biggest Lunara-side cost drivers are AI inference and platform operations, not warehouse compute.

Recommended launch pricing:

| Plan | Monthly price | Annual price | Included seats | Projects | BigQuery data sources | AI credits / month | Best for |
|---|---:|---:|---:|---:|---:|---:|---|
| Starter (Free) | $0 | $0 | 2 | 1 | 1 | 300 | Solo builders evaluating product fit |
| Growth | $79 | $790 | 10 | 5 | 3 | 5,000 | Small teams running regular analysis |
| Scale | $249 | $2,490 | 25 | 20 | 10 | 20,000 | Multi-team ops and decision workflows |
| Enterprise | Custom (start around $1,500/mo) | Annual contract | Custom | Custom | Custom | Custom | Security/compliance-heavy organizations |

Annual discount embedded in pricing: ~17% (roughly 2 months free).

## 2) Usage meter and overage model

Use a single credit system to keep billing explainable:

| Action | Credit cost |
|---|---:|
| SQL Chat turn (NL -> SQL response) | 1 |
| Semantic model generation run | 40 |
| Relationship detection run | 10 |
| AI report generation run | 30 |

Overages and add-ons:

| Add-on | Growth | Scale | Enterprise |
|---|---:|---:|---|
| Extra seat (monthly) | $10 | $8 | Contract |
| Extra 1,000 AI credits | $20 | $16 | Contract |
| Launch coupon (optional) | 20% off for first 3 months | 20% off for first 3 months | Sales-approved |

## 3) Why these price points are reasonable

Benchmark signal from current BI market pricing (official pages):

- Metabase cloud starts around $100/month plus per-user charges.  
- Hex paid plans span individual to team pricing with team around $75/editor/month.  
- Tableau creator is around $75/user/month (annual billing structure).  
- Power BI Pro is around $14/user/month.  
- Lightdash Cloud Pro is positioned at high ACV with flat annualized pricing.

Positioning implication for Lunara:

- `Starter` stays generous enough for activation and semantic setup testing.
- `Growth` is below most heavy BI team entry points but high enough to avoid hobby abuse.
- `Scale` gives clear value for cross-functional adoption without immediate enterprise friction.
- `Enterprise` keeps room for SSO/compliance/service commitments once packaged.

## 4) Stripe catalog design (what we should create)

Stripe products:

1. `lunara_growth`
2. `lunara_scale`
3. `lunara_seat_addon`
4. `lunara_ai_credits_1000`
5. `lunara_launch_coupon` (coupon object)

Stripe prices:

1. Growth monthly recurring: `$79/month`
2. Growth annual recurring: `$790/year`
3. Scale monthly recurring: `$249/month`
4. Scale annual recurring: `$2,490/year`
5. Seat add-on monthly recurring (Growth): `$10/month`
6. Seat add-on monthly recurring (Scale): `$8/month`
7. AI credit pack one-time (Growth): `$20`
8. AI credit pack one-time (Scale): `$16`

Note: Free tier is enforced in Lunara app logic; no Stripe subscription required.

## 5) How we can use available Stripe MCP tools to implement this

### A) Catalog setup

| Task | MCP tools |
|---|---|
| Verify correct Stripe account/workspace | `mcp__stripe__get_stripe_account_info` |
| Create plan products | `mcp__stripe__create_product` |
| Create monthly/annual and add-on prices | `mcp__stripe__create_price` |
| Create launch discount | `mcp__stripe__create_coupon` |
| Validate created objects | `mcp__stripe__list_products`, `mcp__stripe__list_prices`, `mcp__stripe__list_coupons` |

### B) Self-serve purchase flow

| Task | MCP tools |
|---|---|
| Generate hosted purchase links for Growth/Scale | `mcp__stripe__create_payment_link` |
| Create/attach customers during signup or upgrade | `mcp__stripe__create_customer`, `mcp__stripe__list_customers` |
| Inspect initial payment behavior | `mcp__stripe__list_payment_intents`, `mcp__stripe__list_invoices` |

### C) Subscription lifecycle

| Task | MCP tools |
|---|---|
| Read active subscriptions | `mcp__stripe__list_subscriptions` |
| Upgrade/downgrade plan or seat quantity | `mcp__stripe__update_subscription` |
| Cancel at period end or immediately | `mcp__stripe__cancel_subscription` |

### D) Overage invoicing (credits and seats)

| Task | MCP tools |
|---|---|
| Add overage line items | `mcp__stripe__create_invoice_item` |
| Create invoice draft | `mcp__stripe__create_invoice` |
| Finalize and send invoice | `mcp__stripe__finalize_invoice` |
| Reconcile collections | `mcp__stripe__list_invoices`, `mcp__stripe__retrieve_balance` |

### E) Support and finance operations

| Task | MCP tools |
|---|---|
| Issue refunds | `mcp__stripe__create_refund`, `mcp__stripe__list_refunds` |
| Monitor/handle disputes | `mcp__stripe__list_disputes`, `mcp__stripe__update_dispute` |

### F) Design/QA guardrails before coding

| Task | MCP tools |
|---|---|
| Confirm Stripe integration best practices | `mcp__stripe__stripe_integration_recommender` |
| Look up exact API/docs edge cases | `mcp__stripe__search_stripe_documentation` |
| Find specific Stripe objects quickly | `mcp__stripe__search_stripe_resources`, `mcp__stripe__fetch_stripe_resources` |

## 6) Implementation sequence (after your approval)

1. Finalize pricing numbers and names in this doc.
2. Use MCP to create Stripe catalog objects and payment links.
3. Add Lunara billing tables/fields (customer ID, subscription ID, plan, credit balance).
4. Implement backend billing APIs and webhook handlers for subscription + invoice events.
5. Add dashboard billing UI (upgrade/manage/cancel + usage display).
6. Add monthly overage job for credit and seat true-up invoicing.
7. Add support ops screens for refunds/disputes and billing audit logs.

## 7) Important constraints and decisions

1. Payment Links are suitable for MVP self-serve checkout with current toolset.
2. Accurate entitlement enforcement still requires app-side checks (plan, seat, credits).
3. Webhooks remain mandatory for reliable state sync (subscription, invoice paid/failed, refunds).
4. Tax/VAT and jurisdiction-specific compliance should be confirmed before GA launch.

## 8) Decisions I need from you before implementation

1. Approve plan names and price points as-is, or provide edits.
2. Confirm whether annual plans should be public self-serve or sales-assisted only.
3. Confirm if Starter requires card-on-file for trial abuse prevention (recommended: no card required for now).
4. Confirm if AI credit overages should be auto-invoiced monthly or pre-purchased only.

## 9) Pricing sources used for calibration

- Metabase pricing: https://www.metabase.com/pricing  
- Hex pricing: https://hex.tech/pricing/  
- Tableau pricing: https://www.tableau.com/pricing  
- Microsoft Power BI pricing: https://www.microsoft.com/en/power-platform/products/power-bi  
- Lightdash pricing: https://www.lightdash.com/pricing
