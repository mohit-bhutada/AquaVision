# Deployment

```
Browser ──▶ Vercel (React SPA + /api/send-email mail function)
              │  /api/* is proxied to ──▶ Cloudflare Worker (backend API) ──▶ Supabase (DB, auth, storage)
              │                                   ├──▶ ML service on Render (X-API-Key)
              │                                   └──▶ Vercel /api/send-email  (OTP e-mail, shared secret)
```

## 1. Supabase (`database/`)
1. Apply every file in `database/migrations/` in filename order (SQL editor, or the Supabase CLI pointed at this folder).
2. Auth → URL Configuration: Site URL = your frontend URL; add `https://<frontend-domain>/api/v1/auth/callback` to the redirect URLs; enable the Google provider if used.
3. Storage: the private bucket `Enhanced Files` is created by the backend on first use. Confirm it is **not** public.

## 2. Backend Worker (`backend/wrangler.jsonc`)
Secrets (never put these in `wrangler.jsonc`):
```bash
cd backend
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OTP_PEPPER             # >= 32 random chars (openssl rand -hex 32); the Worker refuses to start without it
npx wrangler secret put AQUAVISION_ML_API_KEY  # same value as AQUAVISION_API_KEY on the ML service
npx wrangler secret put INTERNAL_API_KEY       # >= 32 random chars; MUST equal INTERNAL_API_KEY on Vercel
```
Variables (`vars` in `wrangler.jsonc`): `NODE_ENV=production`, `CORS_ORIGIN` (your frontend URL, https, comma-separated if several),
`SUPABASE_URL`, `AQUAVISION_ML_BASE_URL`, `VERCEL_API_URL` (your final custom-domain URL, **not** the `*.vercel.app` one), OTP tuning.
In production the Worker **refuses to start** without `OTP_PEPPER`, `SUPABASE_*` and `CORS_ORIGIN`.
```bash
npx wrangler deploy
```

## 3. Vercel (project root directory: `frontend`)
Environment variables:
| Name | Value |
|---|---|
| `VITE_API_URL` | `https://<your-domain>/api/v1` (public; baked in at build time; `http://` public hosts are upgraded to https automatically) |
| `EMAIL_USER` | Gmail address that sends OTP mail |
| `EMAIL_APP_PASSWORD` | Gmail **App Password** (16 chars; needs 2-Step Verification) |
| `INTERNAL_API_KEY` | same secret as on the Worker |
| `EMAIL_FROM_NAME` | optional, default `AquaVision` |

`frontend/vercel.json` proxies `/api/*` to the Worker, redirects the `*.vercel.app` host to the custom domain, and sets security + cache headers.
`frontend/api/send-email.js` is the only place Nodemailer runs; it needs the three e-mail variables above.

**Verify the relay after deploying**
```bash
curl -i -X POST https://<your-domain>/api/send-email          # expect 401 JSON + header X-AquaVision-Relay: 1
```
A 404 JSON from the backend (no `X-AquaVision-Relay` header) means `/api/send-email` is being proxied to the Worker instead of served by Vercel.

## 4. ML service (Render)
Set `AQUAVISION_API_KEY` on Render; the Worker sends it as `X-API-Key`. See `docs/ARCHITECTURE.md` for the contract.

## 5. Recommended Cloudflare rules
The in-app rate limiter and login lockout live in memory per Worker instance (best effort). Add Cloudflare Rate Limiting
rules for `/api/v1/auth/*` and `/api/v1/projects/enhance`.
