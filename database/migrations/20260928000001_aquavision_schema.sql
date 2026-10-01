-- AquaVision Consolidated Database Schema & Security Migration
-- Authoritative migration incorporating all core tables, indices, RPCs, grants, and RLS policies.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_suspended BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 2. PLANS TABLE
-- ============================================================================
CREATE TABLE public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL CHECK (code IN ('FREE', 'PRO', 'PREMIUM')),
    name TEXT NOT NULL,
    daily_base_credits INT NOT NULL DEFAULT 10 CHECK (daily_base_credits >= 0),
    monthly_bonus_credits INT NOT NULL DEFAULT 0 CHECK (monthly_bonus_credits >= 0),
    price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price_inr >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Seed default plan definitions
INSERT INTO public.plans (code, name, daily_base_credits, monthly_bonus_credits, price_inr) VALUES
    ('FREE', 'Free Tier', 10, 0, 0.00),
    ('PRO', 'Pro Plan', 10, 100, 299.00),
    ('PREMIUM', 'Premium Plan', 10, 200, 499.00)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 4. SUBSCRIPTION REQUESTS TABLE (Strict 1 request per user per day constraint)
-- ============================================================================
CREATE TABLE public.subscription_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requested_plan_id UUID NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    requested_date DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id),
    CONSTRAINT unique_user_daily_upgrade_request UNIQUE (user_id, requested_date)
);

-- ============================================================================
-- 5. SUBSCRIPTION GRANTS TABLE
-- ============================================================================
CREATE TABLE public.subscription_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    tokens_granted INT NOT NULL CHECK (tokens_granted >= 0),
    tokens_remaining INT NOT NULL CHECK (tokens_remaining >= 0),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'EXHAUSTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 6. CREDIT BALANCES TABLE
-- ============================================================================
CREATE TABLE public.credit_balances (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    daily_base_balance INT NOT NULL DEFAULT 10 CHECK (daily_base_balance >= 0),
    monthly_bonus_balance INT NOT NULL DEFAULT 0 CHECK (monthly_bonus_balance >= 0),
    last_daily_reset TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 7. CREDIT LEDGER TABLE
-- ============================================================================
CREATE TABLE public.credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    pool_type TEXT NOT NULL CHECK (pool_type IN ('DAILY_BASE', 'MONTHLY_BONUS')),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEDUCTION', 'DAILY_RESET', 'SUBSCRIPTION_GRANT', 'ADMIN_ADJUSTMENT', 'REFUND')),
    grant_id UUID REFERENCES public.subscription_grants(id) ON DELETE SET NULL,
    project_id UUID,
    enhancement_operation_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 8. PROJECTS TABLE
-- ============================================================================
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Project',
    original_file_key TEXT NOT NULL,
    enhanced_file_key TEXT,
    processing_time_ms INT,
    credit_pool_used TEXT CHECK (credit_pool_used IN ('DAILY_BASE', 'MONTHLY_BONUS')),
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 9. ENHANCEMENT OPERATIONS TABLE (Backend Authoritative Idempotency)
-- ============================================================================
CREATE TABLE public.enhancement_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    idempotency_key TEXT UNIQUE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    error_message TEXT,
    sha256_checksum TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- 10. SHARE TOKENS TABLE (Revocable Sharing State)
-- ============================================================================
CREATE TABLE public.share_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- 11. AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE & LOOKUPS
-- ============================================================================
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_projects_created_at ON public.projects(created_at DESC);
CREATE INDEX idx_share_tokens_token ON public.share_tokens(token);
CREATE INDEX idx_credit_ledger_user_id ON public.credit_ledger(user_id);
CREATE INDEX idx_subscription_requests_user_date ON public.subscription_requests(user_id, requested_date);
CREATE INDEX idx_enhancement_ops_idempotency ON public.enhancement_operations(idempotency_key);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_sub_grants_user_status ON public.subscription_grants(user_id, status, expires_at);

-- ============================================================================
-- AUTOMATIC PROFILE & FREE SUBSCRIPTION PROVISIONING TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    -- Get FREE plan ID
    SELECT id INTO free_plan_id FROM public.plans WHERE code = 'FREE' LIMIT 1;

    -- Create profile
    INSERT INTO public.profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'user'
    );

    -- Provision FREE subscription
    IF free_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (user_id, plan_id, status)
        VALUES (NEW.id, free_plan_id, 'ACTIVE');
    END IF;

    -- Provision initial credit balance
    INSERT INTO public.credit_balances (user_id, daily_base_balance, monthly_bonus_balance)
    VALUES (NEW.id, 10, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- HELPER & ATOMIC CREDIT RPC FUNCTIONS
-- ============================================================================

-- Helper: Admin role check
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic: IST Daily Reset and Expire Grants
CREATE OR REPLACE FUNCTION public.check_and_reset_user_credits(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_last_reset TIMESTAMPTZ;
    v_now_ist DATE;
    v_last_ist DATE;
BEGIN
    -- Expire grants that passed expires_at
    UPDATE public.subscription_grants
    SET status = 'EXPIRED', updated_at = timezone('utc', now())
    WHERE user_id = p_user_id
      AND status = 'ACTIVE'
      AND expires_at <= timezone('utc', now());

    -- Recalculate monthly bonus balance based on active non-expired grants
    UPDATE public.credit_balances
    SET monthly_bonus_balance = COALESCE((
        SELECT SUM(tokens_remaining)
        FROM public.subscription_grants
        WHERE user_id = p_user_id
          AND status = 'ACTIVE'
          AND expires_at > timezone('utc', now())
    ), 0),
    updated_at = timezone('utc', now())
    WHERE user_id = p_user_id;

    -- Check daily IST reset (00:00 Asia/Kolkata)
    SELECT last_daily_reset INTO v_last_reset
    FROM public.credit_balances
    WHERE user_id = p_user_id;

    IF v_last_reset IS NOT NULL THEN
        v_now_ist := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
        v_last_ist := (v_last_reset AT TIME ZONE 'Asia/Kolkata')::date;

        IF v_now_ist > v_last_ist THEN
            UPDATE public.credit_balances
            SET daily_base_balance = 10,
                last_daily_reset = timezone('utc', now()),
                updated_at = timezone('utc', now())
            WHERE user_id = p_user_id;

            INSERT INTO public.credit_ledger (
                user_id, amount, pool_type, transaction_type, description
            ) VALUES (
                p_user_id, 10, 'DAILY_BASE', 'DAILY_RESET', 'Daily free credit pool reset (10 credits at 00:00 IST)'
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic: Reserve Credit for Enhancement (Double-Spending Proof)
CREATE OR REPLACE FUNCTION public.reserve_enhancement_credit(p_user_id UUID)
RETURNS TABLE (
    success BOOLEAN,
    pool_used TEXT,
    grant_id UUID,
    daily_balance INT,
    monthly_balance INT,
    error_code TEXT
) AS $$
DECLARE
    v_daily_bal INT;
    v_monthly_bal INT;
    v_grant RECORD;
BEGIN
    -- First perform daily reset & grant expiration
    PERFORM public.check_and_reset_user_credits(p_user_id);

    -- Lock credit balances row for update
    SELECT c.daily_base_balance, c.monthly_bonus_balance
    INTO v_daily_bal, v_monthly_bal
    FROM public.credit_balances c
    WHERE c.user_id = p_user_id
    FOR UPDATE;

    IF v_daily_bal IS NULL THEN
        -- Provision fallback credit balance if missing
        INSERT INTO public.credit_balances (user_id, daily_base_balance, monthly_bonus_balance)
        VALUES (p_user_id, 10, 0)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT c.daily_base_balance, c.monthly_bonus_balance
        INTO v_daily_bal, v_monthly_bal
        FROM public.credit_balances c
        WHERE c.user_id = p_user_id
        FOR UPDATE;
    END IF;

    -- Priority 1: Daily base balance
    IF v_daily_bal > 0 THEN
        UPDATE public.credit_balances
        SET daily_base_balance = daily_base_balance - 1,
            updated_at = timezone('utc', now())
        WHERE user_id = p_user_id;

        INSERT INTO public.credit_ledger (
            user_id, amount, pool_type, transaction_type, description
        ) VALUES (
            p_user_id, -1, 'DAILY_BASE', 'DEDUCTION', 'Reservation for AI underwater image enhancement'
        );

        RETURN QUERY SELECT true, 'DAILY_BASE'::TEXT, NULL::UUID, v_daily_bal - 1, v_monthly_bal, NULL::TEXT;
        RETURN;
    END IF;

    -- Priority 2: Monthly bonus balance from earliest-expiring active grant
    IF v_monthly_bal > 0 THEN
        SELECT g.id, g.tokens_remaining
        INTO v_grant
        FROM public.subscription_grants g
        WHERE g.user_id = p_user_id
          AND g.status = 'ACTIVE'
          AND g.expires_at > timezone('utc', now())
          AND g.tokens_remaining > 0
        ORDER BY g.expires_at ASC
        LIMIT 1
        FOR UPDATE;

        IF v_grant.id IS NOT NULL THEN
            UPDATE public.subscription_grants
            SET tokens_remaining = tokens_remaining - 1,
                status = CASE WHEN tokens_remaining - 1 = 0 THEN 'EXHAUSTED' ELSE 'ACTIVE' END,
                updated_at = timezone('utc', now())
            WHERE id = v_grant.id;

            UPDATE public.credit_balances
            SET monthly_bonus_balance = monthly_bonus_balance - 1,
                updated_at = timezone('utc', now())
            WHERE user_id = p_user_id;

            INSERT INTO public.credit_ledger (
                user_id, amount, pool_type, transaction_type, grant_id, description
            ) VALUES (
                p_user_id, -1, 'MONTHLY_BONUS', 'DEDUCTION', v_grant.id, 'Reservation for AI underwater image enhancement'
            );

            RETURN QUERY SELECT true, 'MONTHLY_BONUS'::TEXT, v_grant.id, v_daily_bal, v_monthly_bal - 1, NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Insufficient credits
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, v_daily_bal, v_monthly_bal, 'INSUFFICIENT_CREDITS'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic: Refund Enhancement Credit
CREATE OR REPLACE FUNCTION public.refund_enhancement_credit(
    p_user_id UUID,
    p_pool_used TEXT,
    p_grant_id UUID,
    p_reason TEXT DEFAULT 'Enhancement or persistence failure refund'
)
RETURNS TABLE (
    success BOOLEAN,
    daily_balance INT,
    monthly_balance INT
) AS $$
DECLARE
    v_daily_bal INT;
    v_monthly_bal INT;
BEGIN
    IF p_pool_used = 'DAILY_BASE' THEN
        UPDATE public.credit_balances
        SET daily_base_balance = LEAST(10, daily_base_balance + 1),
            updated_at = timezone('utc', now())
        WHERE user_id = p_user_id;

        INSERT INTO public.credit_ledger (
            user_id, amount, pool_type, transaction_type, description
        ) VALUES (
            p_user_id, 1, 'DAILY_BASE', 'REFUND', p_reason
        );
    ELSIF p_pool_used = 'MONTHLY_BONUS' AND p_grant_id IS NOT NULL THEN
        UPDATE public.subscription_grants
        SET tokens_remaining = tokens_remaining + 1,
            status = 'ACTIVE',
            updated_at = timezone('utc', now())
        WHERE id = p_grant_id;

        UPDATE public.credit_balances
        SET monthly_bonus_balance = monthly_bonus_balance + 1,
            updated_at = timezone('utc', now())
        WHERE user_id = p_user_id;

        INSERT INTO public.credit_ledger (
            user_id, amount, pool_type, transaction_type, grant_id, description
        ) VALUES (
            p_user_id, 1, 'MONTHLY_BONUS', 'REFUND', p_grant_id, p_reason
        );
    END IF;

    SELECT c.daily_base_balance, c.monthly_bonus_balance
    INTO v_daily_bal, v_monthly_bal
    FROM public.credit_balances c
    WHERE c.user_id = p_user_id;

    RETURN QUERY SELECT true, COALESCE(v_daily_bal, 0), COALESCE(v_monthly_bal, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: Activate Paid Subscription Plan
CREATE OR REPLACE FUNCTION public.activate_user_subscription(
    p_user_id UUID,
    p_plan_code TEXT
)
RETURNS VOID AS $$
DECLARE
    v_plan RECORD;
    v_sub_id UUID;
    v_grant_id UUID;
BEGIN
    SELECT * INTO v_plan FROM public.plans WHERE code = p_plan_code;
    IF v_plan.id IS NULL THEN
        RAISE EXCEPTION 'Plan with code % not found', p_plan_code;
    END IF;

    -- Upsert canonical subscription row
    INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    VALUES (
        p_user_id,
        v_plan.id,
        'ACTIVE',
        timezone('utc', now()),
        timezone('utc', now()) + interval '30 days'
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan_id = v_plan.id,
        status = 'ACTIVE',
        current_period_start = timezone('utc', now()),
        current_period_end = timezone('utc', now()) + interval '30 days',
        updated_at = timezone('utc', now())
    RETURNING id INTO v_sub_id;

    -- Provision paid grant if monthly bonus credits > 0
    IF v_plan.monthly_bonus_credits > 0 THEN
        INSERT INTO public.subscription_grants (
            user_id, subscription_id, plan_id, tokens_granted, tokens_remaining, expires_at, status
        ) VALUES (
            p_user_id,
            v_sub_id,
            v_plan.id,
            v_plan.monthly_bonus_credits,
            v_plan.monthly_bonus_credits,
            timezone('utc', now()) + interval '30 days',
            'ACTIVE'
        )
        RETURNING id INTO v_grant_id;

        -- Recalculate monthly bonus balance
        UPDATE public.credit_balances
        SET monthly_bonus_balance = (
            SELECT COALESCE(SUM(tokens_remaining), 0)
            FROM public.subscription_grants
            WHERE user_id = p_user_id AND status = 'ACTIVE' AND expires_at > timezone('utc', now())
        ),
        updated_at = timezone('utc', now())
        WHERE user_id = p_user_id;

        INSERT INTO public.credit_ledger (
            user_id, amount, pool_type, transaction_type, grant_id, description
        ) VALUES (
            p_user_id, v_plan.monthly_bonus_credits, 'MONTHLY_BONUS', 'SUBSCRIPTION_GRANT', v_grant_id,
            'Grant of ' || v_plan.monthly_bonus_credits || ' monthly credits for ' || v_plan.name
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enhancement_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
CREATE POLICY "Users can view their own profile or admins can view all"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- 2. Plans Policies
CREATE POLICY "Authenticated users can view plans"
    ON public.plans FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage plans"
    ON public.plans FOR ALL
    USING (public.is_admin(auth.uid()));

-- 3. Subscriptions Policies
CREATE POLICY "Users can view their own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage subscriptions"
    ON public.subscriptions FOR ALL
    USING (public.is_admin(auth.uid()));

-- 4. Subscription Requests Policies
CREATE POLICY "Users can view their own subscription requests"
    ON public.subscription_requests FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can submit subscription requests"
    ON public.subscription_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update subscription requests"
    ON public.subscription_requests FOR UPDATE
    USING (public.is_admin(auth.uid()));

-- 5. Subscription Grants Policies
CREATE POLICY "Users can view their own subscription grants"
    ON public.subscription_grants FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 6. Credit Balances Policies
CREATE POLICY "Users can view their own credit balances"
    ON public.credit_balances FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 7. Credit Ledger Policies
CREATE POLICY "Users can view their own credit ledger entries"
    ON public.credit_ledger FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 8. Projects Policies
CREATE POLICY "Users can view their own projects"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create their own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can delete their own projects"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 9. Enhancement Operations Policies
CREATE POLICY "Users can view their own enhancement operations"
    ON public.enhancement_operations FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create enhancement operations"
    ON public.enhancement_operations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 10. Share Tokens Policies
CREATE POLICY "Project owners or active share token viewers can access share tokens"
    ON public.share_tokens FOR SELECT
    USING (
        auth.uid() = created_by 
        OR public.is_admin(auth.uid()) 
        OR (is_revoked = false AND (expires_at IS NULL OR expires_at > timezone('utc', now())))
    );

CREATE POLICY "Users can create share tokens for their own projects"
    ON public.share_tokens FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update (revoke) their own share tokens"
    ON public.share_tokens FOR UPDATE
    USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- 11. Audit Logs Policies
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT
    USING (public.is_admin(auth.uid()));

CREATE POLICY "Users or backend services can insert audit logs"
    ON public.audit_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()) OR auth.uid() IS NULL);

-- =============================================================================
-- 12. UNIFIED OTP VERIFICATIONS TABLE (SIGNUP & PASSWORD_RESET)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.auth_otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('SIGNUP', 'PASSWORD_RESET')),
    verification_token_hash TEXT NOT NULL UNIQUE,
    otp_hash TEXT NOT NULL,
    otp_salt TEXT NOT NULL,
    otp_attempts INT NOT NULL DEFAULT 0,
    max_otp_attempts INT NOT NULL DEFAULT 5,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ,
    requested_ist_date DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'OTP_VERIFIED', 'CONSUMED', 'EXPIRED', 'LOCKED')),
    verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_verifications_token_hash ON public.auth_otp_verifications(verification_token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_otp_verifications_email ON public.auth_otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_auth_otp_verifications_user_id ON public.auth_otp_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_otp_verifications_purpose ON public.auth_otp_verifications(purpose);
CREATE INDEX IF NOT EXISTS idx_auth_otp_verifications_expires_at ON public.auth_otp_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_otp_verifications_status ON public.auth_otp_verifications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_password_reset ON public.auth_otp_verifications (email, requested_ist_date) WHERE (purpose = 'PASSWORD_RESET');

ALTER TABLE public.auth_otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on auth_otp_verifications"
    ON public.auth_otp_verifications FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

