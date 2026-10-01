# AquaVision

AI underwater image enhancement SaaS.

```
Browser (React + Vite)  ──HTTPS──▶  Backend API (Express, runs as a Cloudflare Worker)
   Cloudflare static assets              │  auth · authorization · credits · upload validation
                                         ├──▶ Supabase (Postgres + RLS, Auth, private Storage)
                                         └──▶ External ML service  (separate project, backend-only)
```

The **ML service is not part of this repository.** The backend reaches it only through
`ML_SERVICE_URL`; the browser never talks to it and never sees its URL.

## Repository layout

| Path | Purpose |
|---|---|
| `frontend/` | React 18 + Vite SPA, deployed with `frontend/wrangler.jsonc` (static assets) |
| `backend/` | Express API. `src/index.ts` = Node dev server, `src/worker.ts` = Cloudflare Worker adapter (`backend/wrangler.jsonc`) |
| `backend/tests/unit/` | Offline unit tests (`npm test`) |
| `backend/tests/integration/` | Scripts that hit a **real** Supabase project (create/delete test users). Run individually, never against production |
| `supabase/migrations/` | Schema + RLS + credit/subscription functions. Apply in filename order |
| `docs/` | Architecture, deployment and security notes |
| `frontend/docs/API_CONTRACT.md` | HTTP contract the frontend codes against |
| `.gsd/`, `.agents/`, `AGENTS.md` | AI-assistant project notes/rules (not application code) |

## Local development

```bash
# backend  (Node >= 20)
cd backend
cp .env.example .env          # fill in Supabase + SMTP + OTP_PEPPER; ML_SERVICE_URL for a running ML service
npm install
npm run dev                   # http://localhost:4000/api/v1

# frontend
cd frontend
cp .env.example .env.local    # VITE_API_URL=http://localhost:4000/api/v1
npm install
npm run dev                   # http://localhost:5173
```

## Checks

```bash
cd backend  && npm run typecheck && npm test
cd frontend && npm run build          # runs tsc -b then vite build
```

There is no ESLint configuration and no frontend test runner in this repository yet.

## Database

Apply `supabase/migrations/*.sql` in order (Supabase CLI: `supabase db push`, or the SQL editor).
`20261002000001_security_hardening.sql` must be applied: it closes direct-API privilege escalation
paths (see `docs/SECURITY.md`).

## Deployment (Cloudflare)

See `docs/DEPLOYMENT.md`.
