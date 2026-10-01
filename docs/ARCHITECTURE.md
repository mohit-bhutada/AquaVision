# Architecture

## Request flow: image enhancement (`POST /api/v1/projects/enhance`)

1. `requireAuth` – validates the HttpOnly session cookie (or Bearer token) with Supabase Auth and loads role/suspension from `profiles`.
2. Rate limit (per IP, in-memory per Worker isolate).
3. Multipart parsing (multer on Node; the Worker adapter in `src/worker.ts` on Cloudflare, with pre-buffer size caps).
4. `validateImageUpload` – real file signature (JPEG/PNG/WebP), size ≤ 20 MB, sanitized filename. Client MIME/extension are never trusted.
5. `reserve_enhancement_credit` (Postgres, row-locked): daily pool first, then earliest-expiring paid grant.
6. Backend → `ML_SERVICE_URL` (`POST /enhance`, multipart field `file`, timeout, response type/size validated).
7. On ML or persistence failure the credit is refunded through `refund_enhancement_credit`.
8. Original + enhanced images stored in the private Supabase bucket `Enhanced Files` under `<userId>/<projectId>/…`; the API serves them through ownership-checked routes.

## Credits & subscriptions

- 10 daily tokens per user, reset at 00:00 IST (`check_and_reset_user_credits`).
- Paid plans (PRO/PREMIUM) create one `subscription_grants` row per approval (own expiry and balance).
- There is **no payment-provider integration**. Upgrades are requested by the user (1/day) and approved by an admin; `activate_user_subscription` runs only after an atomic compare-and-set claim on the request.

## External ML service contract (as the current code uses it)

| Call | Detail |
|---|---|
| `GET {ML_SERVICE_URL}/health` | JSON `{status, service, model_loaded, …}` |
| `POST {ML_SERVICE_URL}/enhance` | multipart `file`; header `X-Model-Input-SHA256`; returns image bytes (jpeg/png/webp) |

The current contract has **no authentication**. The ML endpoint must therefore not be publicly reachable
(private network or an access-control layer in front of it). No `ML_SERVICE_API_KEY` is implemented because
the ML service's auth scheme is not defined in this repository.
