"use client";

import { Zap, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";
import { cn } from "@/lib/utils";

export default function BillingPage() {
  const {
    billing,
    isLoading,
    credits,
    totalCredits,
    plan,
    isPro,
    createCheckout,
    openPortal,
  } = useBilling();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const creditPercent =
    totalCredits > 0 ? Math.round((credits / totalCredits) * 100) : 0;
  const isLow = credits <= 10;
  const periodEnd = billing?.period_end
    ? new Date(billing.period_end).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription and credits
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isPro ? "Pro Plan" : "Free Plan"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isPro
                ? `$${billing?.billing_period === "annual" ? "240/year" : "25/month"}`
                : "No charge"}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              billing?.status === "active"
                ? "bg-green-500/10 text-green-600"
                : billing?.status === "past_due"
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-red-500/10 text-red-600"
            )}
          >
            {billing?.status === "active"
              ? "Active"
              : billing?.status === "past_due"
                ? "Past Due"
                : "Canceled"}
          </span>
        </div>

        {!isPro && (
          <div className="flex gap-3">
            <Button onClick={() => createCheckout("monthly")}>
              Upgrade — $25/month
            </Button>
            <Button variant="outline" onClick={() => createCheckout("annual")}>
              Annual — $240/year
              <span className="ml-1.5 text-xs text-green-600">Save 20%</span>
            </Button>
          </div>
        )}

        {isPro && (
          <Button variant="outline" onClick={openPortal}>
            <CreditCard className="size-4 mr-2" />
            Manage Billing
            <ExternalLink className="size-3 ml-1.5" />
          </Button>
        )}
      </div>

      {/* Credit Usage */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Credits
          </h2>
          <span className="text-sm text-muted-foreground">
            Resets {periodEnd}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-2xl font-bold",
                isLow ? "text-destructive" : "text-foreground"
              )}
            >
              <Zap className="inline size-5 mr-1" />
              {credits}
            </span>
            <span className="text-sm text-muted-foreground">
              of {totalCredits} credits
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isLow ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${creditPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Credit costs
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">1 credit</span>
              <br />
              Luna chat query
            </div>
            <div>
              <span className="font-medium text-foreground">3 credits</span>
              <br />
              Atlas semantic gen
            </div>
            <div>
              <span className="font-medium text-foreground">5 credits</span>
              <br />
              Quill report gen
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
