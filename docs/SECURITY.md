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

## Second audit (full-stack review)

### Fixed
| Area | Issue | Fix |
|---|---|---|
| OTP | Failed attempts were counted with read-then-write, so parallel guesses all saw "0 attempts" and the 5-attempt limit never tripped (6-digit code could be brute-forced) | Each guess must first win an attempt slot with a compare-and-swap; at most `OTP_MAX_ATTEMPTS` guesses are ever evaluated per code (`otpService.ts`, test `otpRace.test.ts`) |
| Rate limiting | `trust proxy: true` believed any `X-Forwarded-For`, so every limit could be bypassed with a fake header | Client IP resolved explicitly (`lib/clientIp.ts`); second limit on Cloudflare's own address; bounded memory; errors use the standard JSON envelope |
| Signup e-mail | Unlimited codes could be triggered for any address (mail bombing, Gmail quota burn) | Per-address cooldown + 10/day cap |
| Password reset | New password was not checked against any policy | Same policy as signup, plus a 72-character maximum |
| Login | A Supabase outage / bad key was reported as "wrong password" and consumed lockout attempts | Only genuine credential errors count; outages return 503 `AUTH_UNAVAILABLE` |
| `/auth/session` | Wrote any string into the login cookies | Accepts only a token Supabase confirms |
| Input | Non-string JSON fields crashed handlers (500) | Central validators (`lib/validators.ts`) |
| Google sign-in | Callback URL built from a client-supplied header; PKCE cookie not cleared with matching attributes; no timeout | Host must be one of our own origins; matching cookie attributes; 15 s timeout |
| Headers/CORS | API responses cacheable; single CORS origin; no preflight cache | `Cache-Control: no-store`, strict CSP, multi-origin CORS, 10-minute preflight cache |
| Config | Env re-validated on every property access; garbage numbers became `NaN`; production could start without `CORS_ORIGIN` | Cached validation, bounded integers, production requires https `CORS_ORIGIN` |
| E-mail | Nodemailer cannot run in a Worker | OTP mail goes through `frontend/api/send-email.js` (Vercel) with a timing-safe shared secret, strict input validation and no error leakage |

### Residual risks (not fixable in code alone)
- Per-IP limits and the login lockout are in memory per Worker instance (best effort). The Worker is reachable directly at its `workers.dev` address, where Vercel's client-IP headers can be forged. Add Cloudflare Rate Limiting rules.
- A 6-digit OTP guarded by 5 attempts, a lockout and a daily cap is standard, but not unguessable; keep the lockout settings.
- An attacker can register an unverified account with someone else's address (they cannot log in until the code is verified). Do not enable automatic account linking between e-mail/password and Google in Supabase unless you accept that.
- Resetting a password does not revoke the user's existing sessions (Supabase offers no admin call for that without a valid session token).
