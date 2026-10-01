# Security notes

## Fixed in this audit
| Area | Issue | Fix |
|---|---|---|
| Supabase RLS | `profiles` UPDATE policy had no `WITH CHECK`/column limit: any logged-in user could set `role='admin'` via the public anon key | Policy dropped; user write privileges revoked (migration `20261002000001`) |
| Supabase RPC | `SECURITY DEFINER` functions (`activate_user_subscription`, `reserve/refund_enhancement_credit`, …) were executable by `PUBLIC` through PostgREST | `EXECUTE` revoked from `PUBLIC/anon/authenticated`, granted to `service_role`; `search_path` pinned |
| Supabase RLS | `share_tokens` SELECT policy exposed every active token to any role | Owner/admin only |
| Uploads | MIME/extension trusted from the client; the Worker multipart path skipped multer's limits and filter | Magic-byte validation, size limit, filename sanitizing, applied to both runtimes; pre-buffer body caps in the Worker adapter |
| Credits | JS read-modify-write fallbacks (non-atomic) used when the RPC failed | Removed; reservation fails closed (503) |
| Subscriptions | Concurrent admin approvals could double-grant | Atomic compare-and-set claim on the request before activation; claim released if activation fails |
| Subscriptions | Unused non-atomic `activateUserSubscription` JS fallback | Removed |
| OTP | Hardcoded fallback `OTP_PEPPER` in source | Dev-only fallback; production refuses to start without a ≥32-char secret |
| ML client | No timeout; upstream error text forwarded to clients; response not validated; silent `localhost` default in production | Timeout, content-type/size validation, generic client errors, explicit config check |
| Injection | Admin search interpolated raw input into PostgREST `.or()` filters | Input sanitized/escaped |
| Input validation | Non-UUID ids reached the DB; unbounded bulk-delete; loose credit-adjust body | UUID/share-token param validation, bounds |
| CSRF | `SameSite=None` cookies + CORS "simple" multipart POST | Origin check on state-changing requests |
| Rate limiting | No limit on enhancement | 20 req/min/IP (best effort, per isolate) |

## Rotate / review (cannot be verified from the repository)
- Git history was scanned for JWT-shaped strings, `sb_secret_`, private keys, and common payment/cloud key prefixes: **no matches**, and `.env` was never committed. The uploaded archive did contain a local `.env` with real values; it was **excluded** from the cleaned project. If that archive was shared anywhere, rotate `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS` and `OTP_PEPPER`.
- `backend/wrangler.jsonc` contains the Supabase project URL (not a secret).

## Known gaps / NOT VERIFIED
- The ML service has no authentication in the current contract. Keep it off the public internet.
- Migrations were syntax-checked with the Postgres parser only; they were **not executed** against a database. Test on a staging project first.
- RLS behavior, Storage bucket privacy, signed-URL expiry, and Supabase Auth settings were reviewed from code only; check them in the dashboard.
- Integration scripts (`backend/tests/integration/`) were not run (they use a live Supabase project).
- Frontend: `react-router-dom@6.30.6` has two moderate advisories whose fix is a v7 major upgrade (not applied). The SSR advisory does not apply to this SPA; the open-redirect advisory applies only if user-controlled URLs reach `<Link>/navigate`, which was not found but not exhaustively proven.
- `AdminService.adjustUserCredits` (admin-only) is still a read-modify-write; move it into a SQL function if admins can act concurrently.
- Login lockout and the rate limiter are in-memory per Worker isolate, so they are best-effort. Back them with Cloudflare Rate Limiting rules or a shared store.
- No ESLint config, no frontend tests, no payment provider integration exist in the repository.
