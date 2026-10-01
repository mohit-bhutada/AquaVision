# AquaVision — frontend

AI-powered underwater image enhancement. React 18 + TypeScript + Vite + Tailwind CSS v4, with GSAP and Lenis for motion.

## Run

```bash
npm install
cp .env.example .env.local                     # sets VITE_API_URL
npm run dev -- --port 5199 --host 127.0.0.1
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the production build |

## Backend

- **Contract:** [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). Every endpoint, body, response, status code and business rule.
- **All HTTP calls** live in `src/lib/api.ts` (`ENDPOINTS` + typed functions).
- **Shared auth, credits and subscription state:** `src/lib/account.tsx`.

## Routes

| Route | Page |
|---|---|
| `/` | Home |
| `/login` `/signup` `/verify-otp` `/forgot-password` `/reset-password` `/auth/callback` | Auth |
| `/workspace` `/history` `/profile` | Signed-in app (History has Projects + Token history tabs) |
| `/subscriptions` | Plans, subscription status, one request per day |
| `/share/:token` | Public shared project |
| `/team` | Team |
| `/aquavisionadminlogin` `/aquavisionadmin` | Admin login and console (role checked by the backend) |
| `*` | Not Found |

## Dev previews

Without `VITE_API_URL`, `npm run dev` runs in preview mode. Pages accept `?state=` to show each UI state,
e.g. `/workspace?state=complete` or `/history?state=list`. This is disabled in production builds.

## Assets

- **Logo:** `public/aquavision.png`
- **Photos:** `public/images/`, public domain (credits in `public/images/CREDITS.md`)
