"""Billing API endpoints — credits, checkout, portal, webhook."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.v1.connection import get_supabase
from middleware.clerk_auth import ClerkUser, get_current_user
from services.billing import CreditService

router = APIRouter(prefix="/billing", tags=["billing"])

# Stripe config
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_MONTHLY = os.getenv("STRIPE_PRICE_MONTHLY", "")
STRIPE_PRICE_ANNUAL = os.getenv("STRIPE_PRICE_ANNUAL", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


# ============================================================================
# Request models
# ============================================================================

class CheckoutRequest(BaseModel):
    plan: str = "monthly"  # "monthly" or "annual"


# ============================================================================
# Authenticated endpoints
# ============================================================================

@router.get("/credits")
async def get_credits(
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Get user's current credits and subscription info."""
    billing = CreditService(supabase)
    ledger = await billing.get_or_create_ledger(user.user_id)
    sub = await billing.get_or_create_subscription(user.user_id)

    return {
        "credits_remaining": ledger["credits_remaining"],
        "credits_total": ledger["credits_total"],
        "period_end": ledger["period_end"],
        "plan": sub["plan"],
        "billing_period": sub.get("billing_period", "monthly"),
        "status": sub["status"],
    }


@router.get("/subscription")
async def get_subscription(
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Get subscription details."""
    billing = CreditService(supabase)
    sub = await billing.get_or_create_subscription(user.user_id)
    return sub


@router.post("/checkout")
async def create_checkout(
    request: CheckoutRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Create a Stripe Checkout Session for upgrading to Pro."""
    billing = CreditService(supabase)
    sub = await billing.get_or_create_subscription(user.user_id)

    if sub["plan"] == "paid" and sub["status"] == "active":
        raise HTTPException(status_code=400, detail="Already on Pro plan")

    # Get or create Stripe customer
    customer_id = sub.get("stripe_customer_id")
    if not customer_id:
        # Look up user email from profiles
        profile = supabase.table("profiles") \
            .select("email") \
            .eq("id", user.user_id) \
            .execute()
        email = profile.data[0]["email"] if profile.data else None

        customer = stripe.Customer.create(
            email=email,
            metadata={"user_id": user.user_id},
        )
        customer_id = customer.id

        # Store customer ID
        supabase.table("subscriptions") \
            .update({"stripe_customer_id": customer_id}) \
            .eq("user_id", user.user_id) \
            .execute()

    # Select price
    price_id = STRIPE_PRICE_MONTHLY if request.plan == "monthly" else STRIPE_PRICE_ANNUAL

    # Create checkout session
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{FRONTEND_URL}/dashboard?upgrade=success",
        cancel_url=f"{FRONTEND_URL}/pricing",
        metadata={"user_id": user.user_id},
    )

    return {"url": session.url}


@router.post("/portal")
async def create_portal(
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
):
    """Create a Stripe Customer Portal session for managing billing."""
    billing = CreditService(supabase)
    sub = await billing.get_or_create_subscription(user.user_id)

    customer_id = sub.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="No billing account found. Upgrade to Pro first.",
        )

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{FRONTEND_URL}/dashboard/settings/billing",
    )

    return {"url": session.url}


# ============================================================================
# Stripe Webhook (NO Clerk auth — verified by Stripe signature)
# ============================================================================

@router.post("/webhook")
async def stripe_webhook(request: Request, supabase=Depends(get_supabase)):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    billing = CreditService(supabase)
    event_type = event["type"]
    data = event["data"]["object"]

    print(f"[Stripe Webhook] {event_type}")

    # ── checkout.session.completed ────────────────────────────────────
    if event_type == "checkout.session.completed":
        user_id = data.get("metadata", {}).get("user_id")
        if not user_id:
            print("[Stripe Webhook] No user_id in checkout metadata")
            return {"ok": True}

        subscription_id = data.get("subscription")
        customer_id = data.get("customer")

        # Fetch subscription details for period info
        billing_period = "monthly"
        period_start = None
        period_end = None
        if subscription_id:
            stripe_sub = stripe.Subscription.retrieve(subscription_id)
            # Determine billing period from price interval
            if stripe_sub.items.data:
                interval = stripe_sub.items.data[0].price.recurring.interval
                billing_period = "annual" if interval == "year" else "monthly"
            period_start = datetime.fromtimestamp(
                stripe_sub.current_period_start, tz=timezone.utc
            )
            period_end = datetime.fromtimestamp(
                stripe_sub.current_period_end, tz=timezone.utc
            )

        await billing.upgrade_to_paid(
            user_id=user_id,
            stripe_customer_id=customer_id,
            stripe_subscription_id=subscription_id,
            billing_period=billing_period,
            period_start=period_start,
            period_end=period_end,
        )
        print(f"[Stripe Webhook] User {user_id} upgraded to paid ({billing_period})")

    # ── customer.subscription.updated ─────────────────────────────────
    elif event_type == "customer.subscription.updated":
        sub_id = data.get("id")
        status = data.get("status", "active")

        # Map Stripe status to our status
        status_map = {
            "active": "active",
            "past_due": "past_due",
            "canceled": "canceled",
            "unpaid": "past_due",
            "paused": "canceled",
        }
        mapped_status = status_map.get(status, status)

        period_start = datetime.fromtimestamp(
            data.get("current_period_start", 0), tz=timezone.utc
        ) if data.get("current_period_start") else None
        period_end = datetime.fromtimestamp(
            data.get("current_period_end", 0), tz=timezone.utc
        ) if data.get("current_period_end") else None

        await billing.update_subscription_status(
            stripe_subscription_id=sub_id,
            status=mapped_status,
            period_start=period_start,
            period_end=period_end,
        )
        print(f"[Stripe Webhook] Subscription {sub_id} → {mapped_status}")

    # ── customer.subscription.deleted ─────────────────────────────────
    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        # Find user by stripe_customer_id
        result = supabase.table("subscriptions") \
            .select("user_id") \
            .eq("stripe_customer_id", customer_id) \
            .execute()
        if result.data:
            user_id = result.data[0]["user_id"]
            await billing.downgrade_to_free(user_id)
            print(f"[Stripe Webhook] User {user_id} downgraded to free")

    # ── invoice.paid ──────────────────────────────────────────────────
    elif event_type == "invoice.paid":
        customer_id = data.get("customer")
        # Find user by stripe_customer_id
        result = supabase.table("subscriptions") \
            .select("user_id") \
            .eq("stripe_customer_id", customer_id) \
            .execute()
        if result.data:
            user_id = result.data[0]["user_id"]
            await billing.reset_credits(user_id)
            print(f"[Stripe Webhook] Credits reset for user {user_id}")

    # ── invoice.payment_failed ────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        sub_id = data.get("subscription")
        if sub_id:
            await billing.update_subscription_status(
                stripe_subscription_id=sub_id,
                status="past_due",
            )
            print(f"[Stripe Webhook] Subscription {sub_id} → past_due")

    return {"ok": True}
