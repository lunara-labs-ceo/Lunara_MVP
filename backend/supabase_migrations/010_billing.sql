-- Migration 010: Billing tables for credit-based subscription system
-- Free tier: 50 credits/month, Paid tier: 1000 credits/month

-- ============================================================================
-- Subscriptions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',          -- 'free' or 'paid'
    billing_period TEXT DEFAULT 'monthly',       -- 'monthly' or 'annual'
    status TEXT NOT NULL DEFAULT 'active',       -- 'active', 'canceled', 'past_due'
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id),
    CONSTRAINT subscriptions_stripe_customer_unique UNIQUE (stripe_customer_id)
);

-- ============================================================================
-- Credit ledger (one active row per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    credits_remaining INTEGER NOT NULL DEFAULT 50,
    credits_total INTEGER NOT NULL DEFAULT 50,
    period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT credit_ledger_user_id_unique UNIQUE (user_id)
);

-- ============================================================================
-- Credit transactions (append-only audit log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,                     -- negative = deduction, positive = grant
    balance_after INTEGER NOT NULL,
    action TEXT NOT NULL,                         -- 'chat_query', 'report_generation', 'semantic_generation', 'monthly_reset', 'plan_upgrade'
    reference_id TEXT,                            -- session/report ID for traceability
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- ============================================================================
-- Atomic credit deduction function (prevents race conditions)
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_credits_atomic(
    p_user_id TEXT,
    p_amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_remaining INTEGER;
BEGIN
    UPDATE credit_ledger
    SET credits_remaining = credits_remaining - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND credits_remaining >= p_amount
    RETURNING credits_remaining INTO v_remaining;

    IF NOT FOUND THEN
        RETURN -1;  -- insufficient credits
    END IF;
    RETURN v_remaining;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Updated_at triggers
-- ============================================================================
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_ledger_updated_at
    BEFORE UPDATE ON credit_ledger
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS policies (service role full access, same as other tables)
-- ============================================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on subscriptions"
    ON subscriptions FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on credit_ledger"
    ON credit_ledger FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on credit_transactions"
    ON credit_transactions FOR ALL
    USING (true)
    WITH CHECK (true);
