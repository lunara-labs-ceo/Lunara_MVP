"use client";

import { useState, useEffect, useCallback } from "react";
import { useApiClient } from "@/lib/api";

interface BillingData {
  credits_remaining: number;
  credits_total: number;
  period_end: string;
  plan: "free" | "paid";
  billing_period: "monthly" | "annual";
  status: "active" | "canceled" | "past_due";
}

// Global event to trigger billing refresh from anywhere
const BILLING_REFRESH_EVENT = "lunara:billing:refresh";

/** Call this after any credit-consuming action to refresh the sidebar. */
export function triggerBillingRefresh() {
  window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
}

export function useBilling() {
  const { fetchApi } = useApiClient();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchApi<BillingData>("/api/v1/billing/credits");
      setBilling(data);
    } catch (err) {
      console.error("Failed to fetch billing:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchApi]);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for refresh events from other components
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(BILLING_REFRESH_EVENT, handler);
    return () => window.removeEventListener(BILLING_REFRESH_EVENT, handler);
  }, [refresh]);

  const createCheckout = useCallback(
    async (plan: "monthly" | "annual" = "monthly") => {
      const data = await fetchApi<{ url: string }>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      if (data.url) {
        window.location.href = data.url;
      }
    },
    [fetchApi]
  );

  const openPortal = useCallback(async () => {
    const data = await fetchApi<{ url: string }>("/api/v1/billing/portal", {
      method: "POST",
    });
    if (data.url) {
      window.location.href = data.url;
    }
  }, [fetchApi]);

  return {
    billing,
    isLoading,
    refresh,
    createCheckout,
    openPortal,
    credits: billing?.credits_remaining ?? 0,
    totalCredits: billing?.credits_total ?? 0,
    plan: billing?.plan ?? "free",
    isPro: billing?.plan === "paid",
  };
}
