# Deployment errors (Vercel)

## Original error (Turbopack build)

```
Module not found: Can't resolve '@/lib/env/deployment'
Module not found: Can't resolve '../env/deployment'
```

Affected files: `api/health/route.ts`, `read-local-json.ts`, `weekly-reports.ts`, `supabase/middleware.ts`

## Root cause

1. Root `.gitignore` had `env/` which excluded `frontend/src/lib/env/` from Git — file never reached GitHub.
2. Folder name `lib/env` is fragile (gitignore + bundler path conflicts).

## Fix (applied)

- Moved helpers to `frontend/src/lib/deploy/deployment.ts`
- Updated all imports to `@/lib/deploy/deployment`
- Root `.gitignore` uses `/env/` (repo root only) instead of bare `env/`

After push, redeploy on Vercel and verify:

```text
GET https://your-app.vercel.app/api/health
→ { "ok": true, "configured": true }
```
