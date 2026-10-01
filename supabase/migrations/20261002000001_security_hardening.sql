-- ============================================================================
-- SECURITY HARDENING (additive; does not modify or drop any data)
--
-- The AquaVision backend is the ONLY client of the database and always uses the
-- service-role key (which bypasses RLS). The frontend never talks to Supabase
-- directly. Therefore end-user roles (anon / authenticated) need, at most,
-- RLS-restricted read access. This migration removes every user-facing write
-- path and every directly-callable privileged function.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Privileged SECURITY DEFINER functions: service_role only
--    (Postgres grants EXECUTE to PUBLIC by default, which PostgREST exposes as
--    /rest/v1/rpc/<fn>. Without this, any user could call
--    activate_user_subscription(<self>, 'PREMIUM') or reserve/refund credits.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_and_reset_user_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_enhancement_credit(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_enhancement_credit(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_user_subscription(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_and_reset_user_credits(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_enhancement_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_enhancement_credit(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_user_subscription(UUID, TEXT) TO service_role;

-- is_admin() is referenced by RLS policies evaluated as the calling role, so
-- 'authenticated' keeps EXECUTE; anonymous callers do not need it.
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Pin search_path on all SECURITY DEFINER functions (prevents search_path hijack)
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_and_reset_user_credits(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_enhancement_credit(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.refund_enhancement_credit(UUID, TEXT, UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.activate_user_subscription(UUID, TEXT) SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 3. Remove user-facing WRITE policies.
--    Critical: "Users can update their own profile" had no WITH CHECK and no column
--    restriction, so any authenticated user could set role='admin' or clear
--    is_suspended on their own row via the public anon key.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can submit subscription requests" ON public.subscription_requests;
DROP POLICY IF EXISTS "Admins can update subscription requests" ON public.subscription_requests;
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create enhancement operations" ON public.enhancement_operations;
DROP POLICY IF EXISTS "Users can create share tokens for their own projects" ON public.share_tokens;
DROP POLICY IF EXISTS "Users can update (revoke) their own share tokens" ON public.share_tokens;
DROP POLICY IF EXISTS "Users or backend services can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;

-- ----------------------------------------------------------------------------
-- 4. share_tokens: the old SELECT policy let ANY role enumerate every active token.
--    Public share links are resolved by the backend (service role) only.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Project owners or active share token viewers can access share tokens" ON public.share_tokens;
CREATE POLICY "Owners and admins can view share tokens"
    ON public.share_tokens FOR SELECT
    TO authenticated
    USING (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. Table privileges: defense in depth on top of RLS.
--    anon gets nothing; authenticated gets no write privileges.
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON public.auth_otp_verifications FROM authenticated;

-- Future tables/functions created by the migration role must not be exposed by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
