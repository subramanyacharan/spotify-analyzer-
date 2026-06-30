# Growth Intelligence Dashboard (Phase 4)

Next.js dashboard deployed to **Vercel**. Python pipeline (`src/`, `scripts/`) runs separately via GitHub Actions and writes to Supabase.

**Repository:** [github.com/subramanyacharan/spotify-analyzer-](https://github.com/subramanyacharan/spotify-analyzer-)

## Deploy to Vercel

### 1. Push code to GitHub

This repo root should be the project folder (contains `frontend/`, `src/`, `scripts/`, etc.):

```bash
cd "GRAD PROJ"
git init
git remote add origin https://github.com/subramanyacharan/spotify-analyzer-.git
git add .
git commit -m "Initial commit: Spotify review intelligence platform"
git branch -M main
git push -u origin main
```

### 2. Import project on Vercel

1. Open [vercel.com/new](https://vercel.com/new)
2. Import **subramanyacharan/spotify-analyzer-**
3. Set **Root Directory** to `frontend`
4. Framework: **Next.js** (auto-detected from `frontend/vercel.json`)
5. Deploy

### 3. Environment variables

Vercel → Project → **Settings → Environment Variables** (enable for **Production** and **Preview**):

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | Browser-safe (auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** key | Auth only — never for data reads |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` | Public app URL for email confirmation & reset links |
| `SUPABASE_URL` | Same project URL | Server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key | Server data reads only |

Copy from `.env.local.example`. **Never** prefix the service role key with `NEXT_PUBLIC_`.

Run in Supabase SQL Editor (once):

- `supabase_schema.sql`
- `supabase/auth_profiles.sql`
- `supabase/rls_lockdown.sql`

### 4. Supabase auth URLs

Supabase Dashboard → **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| **Site URL** | `https://your-app.vercel.app` |
| **Redirect URLs** | `https://your-app.vercel.app/auth/callback` |

Add preview URLs too if using PR deploys: `https://*.vercel.app/auth/callback`

### 5. Verify deployment

After deploy:

```text
GET https://your-app.vercel.app/api/health
→ { "ok": true, "configured": true, "timestamp": "..." }
```

- `configured: false` — missing env vars in Vercel
- Sign up at `/signup`, then open `/overview`
- **Export Report** (TopBar) calls authenticated `GET /api/export/report` and downloads a nine-section PDF for the 90-day analysis window — see [../DOCS/pdf-report.md](../DOCS/pdf-report.md)
- **Integration API:** `GET /api/export` returns raw Phase 3 JSON (no TopBar button)

### 6. Ongoing deploys

| Trigger | Result |
|---------|--------|
| Push to `main` | Production deploy |
| Pull request | Preview URL |
| Python pipeline (Sunday cron) | Updates Supabase — dashboard refreshes on next load (no redeploy) |

## Routes

| Route | View |
|-------|------|
| `/overview` | Executive overview |
| `/insights`, `/insights/analytics` | Problem insights & analytics |
| `/segments`, `/deep-dive` | Segments & deep-dive |
| `/opportunities`, `/opportunities/actions` | Opportunities & prioritization |
| `/login`, `/signup`, `/forgot-password` | Auth |

Legacy URLs `/reports`, `/weekly-reports`, and `/dashboard` redirect to `/overview`.

## Local development

```bash
cd frontend
npm install
cp .env.local.example .env.local   # optional
npm run dev
```

Without Supabase env vars locally, data falls back to `../data/outputs/*.json`. On Vercel (`VERCEL=1`), Supabase is required — local JSON fallback is disabled.

## Security

- Service role key stays server-only (`lib/supabase/server.ts`, `server-only` import)
- RLS lockdown blocks direct anon/authenticated reads of pipeline tables
- Security headers in `vercel.json` (X-Frame-Options, nosniff, etc.)
- Middleware redirects unauthenticated users on protected routes when auth is configured

## Stack

Next.js 16 · React 19 · Tailwind 4 · Recharts · `@supabase/ssr`

See [DOCS/implementationPlan.md](../DOCS/implementationPlan.md) §4.10.
