# AquaVision API contract (v1)

This is the contract between the AquaVision frontend and backend. The frontend is built against it
(`src/lib/api.ts`), and `mock-server/server.mjs` is a runnable reference implementation of every endpoint
and business rule below. When in doubt about a shape, run the mock and look at its responses.

If the real backend must use different paths, only `ENDPOINTS` in `src/lib/api.ts` needs to change.
If it must use different field names, change the types and the matching function in that one file.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `VITE_API_URL`, including the version prefix, e.g. `https://api.aquavision.app/api/v1` |
| Format | JSON (`Content-Type: application/json`), except the enhance upload (`multipart/form-data`) |
| Auth | Session in an **HTTP-only cookie** set by the backend. The frontend never stores tokens. Every request is sent with `credentials: 'include'`. |
| Cookie | `HttpOnly; Path=/; SameSite=Lax` when frontend and API are on the same site. If they are on different sites: `SameSite=None; Secure` (HTTPS required). |
| CORS | `Access-Control-Allow-Origin: <exact frontend origin>` (never `*`), `Access-Control-Allow-Credentials: true`, allow methods `GET, POST, PATCH, DELETE, OPTIONS`, allow header `Content-Type`. |
| Timestamps | ISO-8601 in UTC, e.g. `2026-09-30T18:30:00.000Z`. The frontend formats them in the viewer's local time. |
| IDs | Opaque strings. |
| Enums | Plans `FREE \| PRO \| PREMIUM` · pools `DAILY \| MONTHLY` · roles `USER \| ADMIN` · user status `ACTIVE \| SUSPENDED` |
| Pagination | `?cursor=<opaque>&limit=<n>` → `{ "items": [...], "nextCursor": "<opaque>" \| null }` |
| Empty success | `204 No Content` |

### Error shape (all non-2xx responses)

```json
{ "error": { "code": "SUBSCRIPTION_REQUEST_LIMIT", "message": "You've already used today's subscription request.", "details": { "nextEligibleAt": "2026-09-30T18:30:00.000Z" } } }
```

`message` is shown to the user as-is, so write it for people. `code` is what the frontend branches on.

| Status | When | Codes used by the frontend |
|---|---|---|
| 400 | Bad input that isn't a field validation (bad OTP, bad reset token) | `OTP_INVALID`, `OTP_EXPIRED`, `RESET_TOKEN_INVALID` |
| 401 | No or expired session | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 402 | No tokens left for an enhancement | `INSUFFICIENT_CREDITS` |
| 403 | Signed in but not allowed | `FORBIDDEN` (not admin), `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED` |
| 404 | Missing or not owned by the caller | `NOT_FOUND` |
| 409 | Conflicts with current state | `EMAIL_TAKEN`, `REQUEST_ALREADY_PENDING`, `SUBSCRIPTION_REQUEST_LIMIT`, `REQUEST_ALREADY_DECIDED`, `BALANCE_NEGATIVE`, `CANNOT_CHANGE_SELF` |
| 413 | Upload over 20 MB | `FILE_TOO_LARGE` |
| 415 | Upload not JPEG/PNG | `UNSUPPORTED_FILE_TYPE` |
| 422 | Field validation | `VALIDATION_ERROR` (`details.field`) |
| 429 | Rate limits | `OTP_COOLDOWN` (`details.retryAfterSeconds`), `RATE_LIMITED` |
| 500 | Anything unexpected | `INTERNAL` |

How the frontend reacts: a `401` on a protected page sends the user to `/login?next=<current path>`.
A `403` on `/admin/*` shows "Not authorized". Every other error shows `message` with a retry option.

---

## 2. Business rules (the backend is the only authority)

The frontend only displays these values. It never calculates balances or eligibility itself.

- **Daily tokens:** every user gets **10 per day**, reset at **00:00 IST (UTC+05:30)**. Unused daily tokens do not carry over.
- **Monthly (paid) tokens** by active plan: `FREE` 0, `PRO` 100, `PREMIUM` 200. They are granted when a plan is approved and set to 0 when the plan expires.
- **Spending:** one enhancement costs 1 token. The daily pool is spent first, then the monthly pool. With both at 0, return `402 INSUFFICIENT_CREDITS`.
- **Plans:** approval sets the plan to `ACTIVE` for `durationDays` (30), starting now. After `endsAt` the status becomes `EXPIRED`.
- **Subscription requests:**
  - At most **one request per user per IST calendar day**.
  - At most one `PENDING` request at a time.
  - The next request is allowed from the following **00:00 IST**. Expose this as `nextEligibleAt`.
- **Ledger:** every balance change writes a ledger row: enhancement, daily reset, plan grant, admin adjustment, refund.
- **Audit log:** every admin action and every subscription request writes an audit row.
- **Ownership:** users only see and change their own projects. Share links are public and read-only, and expose no account data.

---

## 3. Types

```ts
User = { id, name: string|null, email, avatarUrl: string|null, role: 'USER'|'ADMIN', status: 'ACTIVE'|'SUSPENDED', emailVerified: boolean, createdAt }

Credits = {
  daily:   { balance: number, limit: number, resetsAt: string },   // resetsAt = next 00:00 IST
  monthly: { balance: number, limit: number },                     // limit = active plan's monthly tokens
  total: number                                                    // daily.balance + monthly.balance
}

Plan = { id: 'FREE'|'PRO'|'PREMIUM', name, priceInr: number, dailyTokens: number, monthlyTokens: number, durationDays: number }

SubscriptionRequest = { id, plan, status: 'PENDING'|'APPROVED'|'REJECTED', createdAt, decidedAt: string|null, reason: string|null }

SubscriptionState = {
  current: { plan, status: 'ACTIVE'|'EXPIRED'|'NONE', startsAt: string|null, endsAt: string|null },
  pendingRequest: SubscriptionRequest|null,
  lastDecision:   SubscriptionRequest|null,   // most recent APPROVED/REJECTED
  requestedToday: boolean,                    // a request was made in the current IST day
  canRequest: boolean,                        // backend's final answer: may the user request now?
  nextEligibleAt: string|null,                // next 00:00 IST when requestedToday
  reason: string|null                         // why canRequest is false, shown to the user
}

Project = { id, name, status: 'PROCESSING'|'COMPLETED'|'FAILED', originalUrl, enhancedUrl: string|null, shareToken: string|null, width?: number|null, height?: number|null, createdAt }

LedgerEntry = { id, createdAt, type: 'ENHANCEMENT'|'DAILY_RESET'|'PLAN_GRANT'|'ADMIN_ADJUSTMENT'|'REFUND', pool: 'DAILY'|'MONTHLY', amount: number /* negative = spent */, reason: string|null, projectId: string|null, balanceAfter: number|null }
```

Image URLs (`originalUrl`, `enhancedUrl`) must be loadable by the browser: public, or signed URLs.
For downloads to work across origins, serve them with `Content-Disposition: attachment` or allow CORS.

---

## 4. Endpoints

`🔒` = requires a session · `👑` = requires `role = ADMIN` (checked by the backend on every call)

### Auth

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `POST /auth/signup` | `{ name?, email, password }` | `201 { ok: true, verificationToken }` | Sends a 6-digit OTP by email. Creates a verification session identified by `verificationToken`. Password: ≥ 8 characters with a letter and a number. `409 EMAIL_TAKEN` if email is already registered. |
| `GET /auth/verify-token/:token` | – | `200 { valid: boolean, purpose?, status?, email? }` | Validates session token validity and returns purpose (`SIGNUP` or `PASSWORD_RESET`). |
| `POST /auth/verify-otp` | `{ verificationToken, otp }` | `200 { status: 'ok', purpose, verificationStatus?, user? }` | Verifies 6-digit OTP code against `verificationToken`. For `SIGNUP`, confirms email and completes registration. For `PASSWORD_RESET`, advances state to `OTP_VERIFIED` on same URL. |
| `POST /auth/resend-otp` | `{ verificationToken }` | `200 { ok: true, expiresAt }` | `429 RATE_LIMITED` if within 60s cooldown. Generates new OTP for same `verificationToken`. |
| `POST /auth/login` | `{ email, password }` | `200 User` + **sets session cookie** | `401 INVALID_CREDENTIALS`, `423 ACCOUNT_LOCKED` (after 5 failed attempts), `403 ACCOUNT_SUSPENDED`. |
| `POST /auth/logout` | – | `204` + clears cookie | Clears session cookie. |
| `GET /auth/me` 🔒 | – | `200 User` | `401` when signed out. |
| `POST /auth/forgot-password` | `{ email }` | `200 { ok: true, message, verificationToken }` | Initiates password recovery. Dispatches OTP email and returns `verificationToken` for redirection to `/verify-otp/:verificationToken`. |
| `POST /auth/reset-password` | `{ verificationToken, password }` | `200 { ok: true, message }` | Resets password after OTP verification on `/verify-otp/:verificationToken`. Consumes the `verificationToken`. |
| `GET /auth/google?next=/path` | – | `302` to Google | After the Google callback: set the cookie, then `302` to `<FRONTEND>/auth/callback?next=/path`. On failure: `<FRONTEND>/auth/callback?error=1`. Only accept a `next` that starts with `/` (not `//`). |

### Account

| Method & path | Success |
|---|---|
| `GET /me/profile` 🔒 | `200 { user: User, credits: Credits, subscription: SubscriptionState }`. The frontend loads this once per session and on tab focus. |
| `GET /credits` 🔒 | `200 Credits` |
| `GET /credits/ledger?cursor&limit` 🔒 | `200 { items: LedgerEntry[], nextCursor }`, newest first |

### Projects

| Method & path | Body | Success |
|---|---|---|
| `POST /projects/enhance` 🔒 | multipart, field **`image`** (JPEG/PNG, ≤ 20 MB) | `201 { project: Project, credits: Credits }`. `credits` is the balance **after** this enhancement. Errors: `402 INSUFFICIENT_CREDITS`, `413`, `415`. |
| `GET /projects` 🔒 | – | `200 Project[]`, newest first |
| `GET /projects/:id` 🔒 | – | `200 Project` |
| `DELETE /projects/:id` 🔒 | – | `204` |
| `POST /projects/:id/share` 🔒 | – | `200 { shareToken }` (reuse the existing token if already shared) |
| `DELETE /projects/:id/share` 🔒 | – | `204` (the old link stops working) |
| `GET /share/:token` (public) | – | `200 { name, createdAt, originalUrl, enhancedUrl }`, or `404`. No owner data. |

The frontend builds the public link as `<FRONTEND>/share/<shareToken>`.

If enhancement is slow, the backend may return `201` with `project.status = 'PROCESSING'` and `enhancedUrl: null`.
Tell the frontend developer, because Workspace would then need to poll `GET /projects/:id`.
Today it expects `COMPLETED` in the response.

### Plans & subscriptions

| Method & path | Body | Success |
|---|---|---|
| `GET /plans` (public) | – | `200 Plan[]`. Prices and token limits come **only** from here. |
| `GET /subscriptions/me` 🔒 | – | `200 SubscriptionState` |
| `POST /subscriptions/requests` 🔒 | `{ plan: 'PRO' \| 'PREMIUM' }` | `201 SubscriptionRequest`. `409 REQUEST_ALREADY_PENDING`, `409 SUBSCRIPTION_REQUEST_LIMIT` (`details.nextEligibleAt`) |

### Admin 👑 (a non-admin gets `403 FORBIDDEN`; signed out gets `401`)

| Method & path | Body | Success |
|---|---|---|
| `GET /admin/me` | – | `200 User`. The frontend's **only** admin check. |
| `GET /admin/overview` | – | `200 { [metric]: number }`, e.g. `totalUsers, activeUsers, suspendedUsers, activeSubscriptions, pendingRequests, totalProjects, enhancementsToday`. The frontend shows whatever keys are returned. |
| `GET /admin/users?q&status&cursor` | – | `200 { items: (User & { plan })[], nextCursor }` |
| `GET /admin/users/:id` | – | `200 { user, credits, subscription, projectsCount }` |
| `PATCH /admin/users/:id/status` | `{ status: 'ACTIVE' \| 'SUSPENDED' }` | `200 User`. Suspending ends that user's sessions. `409 CANNOT_CHANGE_SELF` |
| `PATCH /admin/users/:id/role` | `{ role: 'USER' \| 'ADMIN' }` | `200 User`. `409 CANNOT_CHANGE_SELF` |
| `GET /admin/subscription-requests?status` | – | `200 (SubscriptionRequest & { user: { id, email, name } })[]` |
| `POST /admin/subscription-requests/:id/approve` | – | `200` the updated request. Activates the plan and grants monthly tokens. `409 REQUEST_ALREADY_DECIDED` |
| `POST /admin/subscription-requests/:id/reject` | `{ reason? }` | `200` the updated request. `reason` is shown to the user. |
| `POST /admin/credits/adjust` | `{ userId, pool: 'DAILY' \| 'MONTHLY', amount: int ≠ 0, reason }` | `200 { credits: Credits }`. `409 BALANCE_NEGATIVE`. Writes ledger + audit. |
| `GET /admin/projects?cursor` | – | `200 { items: (Project & { owner: { id, email } })[], nextCursor }` |
| `GET /admin/audit-logs?cursor` | – | `200 { items: { id, createdAt, actor: { id, email } \| null, action, target, metadata }[], nextCursor }` |
| `GET /admin/health` | – | `200 { status: 'ok' \| 'degraded' \| 'down', ...anything }`. Rendered as-is. |

### Health

`GET /health` (public) → `200 { status: 'ok' }`

---

## 5. Frontend behaviour the backend should know about

- **Session check:** on load, the frontend calls `GET /me/profile`. It calls it again whenever the tab becomes visible, which is how an approval made by an admin shows up. A `401` means "signed out"; the browser logs it in the console, which is expected.
- **After an enhancement,** the frontend uses the `credits` object from the enhance response to update every balance on screen.
- **After a subscription request,** or a `409` from one, it re-fetches `GET /subscriptions/me` and `GET /credits`.
- **Buttons are disabled while their request is in flight.** The backend must still be idempotent and enforce every limit itself.
- **The admin console is at `/aquavisionadmin`,** with its own login page at `/aquavisionadminlogin`.
