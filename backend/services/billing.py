"""Credit-based billing service.

Manages credit ledger, deductions, and subscription provisioning.
Credits are tracked in Supabase; Stripe handles payment/subscription lifecycle.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import HTTPException


# Credit costs per action
CREDIT_COSTS = {
    "chat_query": 1,
    "report_generation": 5,
    "semantic_generation": 3,
}

# Plan credit allocations
PLAN_CREDITS = {
    "free": 50,
    "paid": 1000,
}


class CreditService:
    """Manages credit ledger and deductions."""

    def __init__(self, supabase):
        self.supabase = supabase

    # ── Ledger management ─────────────────────────────────────────────────

    def _ensure_profile(self, user_id: str):
        """Ensure a profile row exists for this user (FK requirement)."""
        result = self.supabase.table("profiles") \
            .select("id") \
            .eq("id", user_id) \
            .execute()
        if not result.data:
            self.supabase.table("profiles").upsert({
                "id": user_id,
            }, on_conflict="id").execute()

    async def get_or_create_ledger(self, user_id: str) -> Dict[str, Any]:
        """Get the user's credit ledger, creating a free-tier one if none exists."""
        result = self.supabase.table("credit_ledger") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        if result.data:
            return result.data[0]

        # Ensure profile exists (FK requirement)
        self._ensure_profile(user_id)

        # Auto-create free-tier ledger
        now = datetime.now(timezone.utc)
        ledger = {
            "user_id": user_id,
            "credits_remaining": PLAN_CREDITS["free"],
            "credits_total": PLAN_CREDITS["free"],
            "period_start": now.isoformat(),
            "period_end": (now + timedelta(days=30)).isoformat(),
        }
        insert_result = self.supabase.table("credit_ledger").insert(ledger).execute()
        return insert_result.data[0] if insert_result.data else ledger

    async def get_or_create_subscription(self, user_id: str) -> Dict[str, Any]:
        """Get the user's subscription, creating a free-tier one if none exists."""
        result = self.supabase.table("subscriptions") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        if result.data:
            return result.data[0]

        # Ensure profile exists (FK requirement)
        self._ensure_profile(user_id)

        # Auto-create free-tier subscription
        now = datetime.now(timezone.utc)
        sub = {
            "user_id": user_id,
            "plan": "free",
            "billing_period": "monthly",
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": (now + timedelta(days=30)).isoformat(),
        }
        insert_result = self.supabase.table("subscriptions").insert(sub).execute()
        return insert_result.data[0] if insert_result.data else sub

    # ── Credit operations ─────────────────────────────────────────────────

    async def check_credits(self, user_id: str, cost: int) -> bool:
        """Return True if the user has enough credits."""
        ledger = await self.get_or_create_ledger(user_id)
        return ledger["credits_remaining"] >= cost

    async def deduct_credits(
        self,
        user_id: str,
        cost: int,
        action: str,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Atomically deduct credits. Raises HTTPException(402) if insufficient."""
        # Ensure ledger exists
        await self.get_or_create_ledger(user_id)

        # Atomic deduction via PL/pgSQL function
        rpc_result = self.supabase.rpc(
            "deduct_credits_atomic",
            {"p_user_id": user_id, "p_amount": cost}
        ).execute()

        new_balance = rpc_result.data
        if new_balance is None or new_balance == -1:
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Upgrade to Pro for 1000 credits/month.",
            )

        # Log transaction
        self.supabase.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": -cost,
            "balance_after": new_balance,
            "action": action,
            "reference_id": reference_id,
        }).execute()

        return {"credits_remaining": new_balance, "deducted": cost}

    async def refund_credits(
        self,
        user_id: str,
        cost: int,
        action: str,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Atomically refund credits after a failed agent call."""
        result = self.supabase.table("credit_ledger") \
            .select("credits_remaining") \
            .eq("user_id", user_id) \
            .execute()

        if not result.data:
            return {"credits_remaining": 0, "refunded": cost}

        # Atomic credit addition
        old_balance = result.data[0]["credits_remaining"]
        new_balance = old_balance + cost
        self.supabase.table("credit_ledger") \
            .update({"credits_remaining": new_balance}) \
            .eq("user_id", user_id) \
            .execute()

        # Log refund transaction
        self.supabase.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": cost,
            "balance_after": new_balance,
            "action": "credit_refund",
            "reference_id": reference_id,
        }).execute()

        return {"credits_remaining": new_balance, "refunded": cost}

    # ── Subscription lifecycle ────────────────────────────────────────────

    async def upgrade_to_paid(
        self,
        user_id: str,
        stripe_customer_id: str,
        stripe_subscription_id: str,
        billing_period: str = "monthly",
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ):
        """Upgrade user to paid plan. Called by Stripe webhook."""
        now = datetime.now(timezone.utc)
        start = period_start or now
        end = period_end or (now + timedelta(days=30))

        total_credits = PLAN_CREDITS["paid"]
        if billing_period == "annual":
            total_credits = PLAN_CREDITS["paid"] * 12  # 12000 for annual

        # Upsert subscription
        self.supabase.table("subscriptions").upsert({
            "user_id": user_id,
            "stripe_customer_id": stripe_customer_id,
            "stripe_subscription_id": stripe_subscription_id,
            "plan": "paid",
            "billing_period": billing_period,
            "status": "active",
            "current_period_start": start.isoformat(),
            "current_period_end": end.isoformat(),
        }, on_conflict="user_id").execute()

        # Upgrade credit ledger
        self.supabase.table("credit_ledger").upsert({
            "user_id": user_id,
            "credits_remaining": total_credits,
            "credits_total": total_credits,
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
        }, on_conflict="user_id").execute()

        # Log transaction
        self.supabase.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": total_credits,
            "balance_after": total_credits,
            "action": "plan_upgrade",
        }).execute()

    async def downgrade_to_free(self, user_id: str):
        """Downgrade user to free plan. Called when subscription is cancelled."""
        now = datetime.now(timezone.utc)
        free_credits = PLAN_CREDITS["free"]

        self.supabase.table("subscriptions").upsert({
            "user_id": user_id,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "plan": "free",
            "billing_period": "monthly",
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": (now + timedelta(days=30)).isoformat(),
        }, on_conflict="user_id").execute()

        self.supabase.table("credit_ledger").upsert({
            "user_id": user_id,
            "credits_remaining": free_credits,
            "credits_total": free_credits,
            "period_start": now.isoformat(),
            "period_end": (now + timedelta(days=30)).isoformat(),
        }, on_conflict="user_id").execute()

        self.supabase.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": free_credits,
            "balance_after": free_credits,
            "action": "plan_downgrade",
        }).execute()

    async def reset_credits(self, user_id: str):
        """Reset credits for a new billing period. Called by invoice.paid webhook."""
        sub = await self.get_or_create_subscription(user_id)
        plan = sub.get("plan", "free")
        total = PLAN_CREDITS.get(plan, PLAN_CREDITS["free"])

        now = datetime.now(timezone.utc)
        self.supabase.table("credit_ledger").upsert({
            "user_id": user_id,
            "credits_remaining": total,
            "credits_total": total,
            "period_start": now.isoformat(),
            "period_end": (now + timedelta(days=30)).isoformat(),
        }, on_conflict="user_id").execute()

        self.supabase.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": total,
            "balance_after": total,
            "action": "monthly_reset",
        }).execute()

    async def update_subscription_status(
        self,
        stripe_subscription_id: str,
        status: str,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ):
        """Update subscription status. Called by subscription.updated webhook."""
        update_data: Dict[str, Any] = {"status": status}
        if period_start:
            update_data["current_period_start"] = period_start.isoformat()
        if period_end:
            update_data["current_period_end"] = period_end.isoformat()

        self.supabase.table("subscriptions") \
            .update(update_data) \
            .eq("stripe_subscription_id", stripe_subscription_id) \
            .execute()
