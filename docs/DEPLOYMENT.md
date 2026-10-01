# Deployment (Cloudflare + Supabase)

## Supabase
1. Apply all files in `supabase/migrations/` in order.
2. Auth → set Site URL / redirect URLs for the deployed frontend and backend callback; configure Google provider if used.
3. Storage: private bucket `Enhanced Files` (created automatically by the backend on first use as private; verify it is **not** public).

## Backend Worker (`backend/wrangler.jsonc`, name `aquavision-backend-worker`)
Secrets (never in `wrangler.jsonc`):
```bash
cd backend
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OTP_PEPPER          # >= 32 random chars; the Worker refuses to start without it
npx wrangler secret put SMTP_PASS
npx wrangler secret put SMTP_HOST
npx wrangler secret put SMTP_USER
```
Non-secret values (`vars` in `wrangler.jsonc`): `CORS_ORIGIN`, `SUPABASE_URL`, `SMTP_PORT`, `SMTP_FROM_EMAIL`,
`SMTP_FROM_NAME`, OTP tuning, and **`ML_SERVICE_URL`** (currently not set there – enhancement returns 503 until it is).
```bash
npm run worker:deploy
```

## Frontend (`frontend/wrangler.jsonc`, name `aquavision-web`)
```bash
cd frontend
VITE_API_URL=https://<backend-worker-host>/api/v1 npm run build
npx wrangler deploy
```

## Recommended Cloudflare rules
The in-app rate limiter is per Worker isolate and is a best-effort guard only. Add Cloudflare Rate Limiting
rules for `/api/v1/auth/*` and `/api/v1/projects/enhance`.
