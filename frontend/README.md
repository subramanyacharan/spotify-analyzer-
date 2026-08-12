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
| `SUPABASE_URL` | `https://xxx.supabase.co` | Server-side data reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **secret** key (`sb_secret_...`) or legacy **service_role** JWT | Bypasses RLS — never use publishable/anon key here |

Copy from `.env.local.example`. **Never** prefix the secret key with `NEXT_PUBLIC_`. Production reads `weekly_insights` from Supabase; local dev falls back to gitignored `frontend/data/outputs/*.json`.

Run in Supabase SQL Editor (once):

- `supabase_schema.sql`
- `supabase/rls_lockdown.sql`

### 4. Verify deployment

After deploy:

```text
GET https://your-app.vercel.app/api/health
→ { "ok": true, "configured": true, "dataReady": true, "totalReviewsAnalyzed": 48730, ... }
```

- `configured: false` — missing or non-elevated Supabase key in Vercel
- `dataReady: false` — check `hint` and `supabase.keyKind` in the health response
- Open `/overview` directly — no login required
- **Export Report** (TopBar) calls `GET /api/export/report` and downloads a nine-section PDF for the 90-day analysis window — see [../DOCS/pdf-report.md](../DOCS/pdf-report.md)
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
| `/insights` | Problem insights (User feedback) |
| `/segments`, `/deep-dive` | Segments & deep-dive |
| `/opportunities`, `/opportunities/actions` | Opportunities & prioritization |

Legacy URLs `/reports`, `/weekly-reports`, `/dashboard`, and old auth routes (`/login`, `/signup`, etc.) redirect to `/overview`.

## Local development

```bash
cd frontend
npm install
cp .env.local.example .env.local   # optional
npm run dev
```

Without Supabase env vars locally, data falls back to `frontend/data/outputs/*.json` and `../data/outputs/*.json` on disk (gitignored — run the pipeline or copy JSON locally). On Vercel, Supabase is the data source.

Check data readiness: `GET /api/health` → `dataReady: true`, `totalReviewsAnalyzed: 48730` (approx).

## Security

- Dashboard is **read-only** — no login, signup, or user writes from the UI
- Service role key stays server-only (`lib/supabase/server.ts`, `server-only` import)
- RLS lockdown blocks direct anon/authenticated reads of pipeline tables
- Security headers in `vercel.json` (X-Frame-Options, nosniff, etc.)

## Stack

Next.js 16 · React 19 · Tailwind 4 · Recharts · `@supabase/ssr`

See [DOCS/implementationPlan.md](../DOCS/implementationPlan.md) §4.10.
