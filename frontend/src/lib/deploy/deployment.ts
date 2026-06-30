/**
 * Deployment environment helpers.
 * Vercel sets VERCEL=1; local JSON fallback is disabled on Vercel.
 */

export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Bundled Phase 3 JSON under frontend/data/outputs — used on Vercel when needed. */
export function allowLocalDataFallback(): boolean {
  return true;
}

export function isProductionDeploy(): boolean {
  return isVercel() || process.env.NODE_ENV === "production";
}

/** Public (browser-safe) — auth only */
export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** Server-only — service role for data reads; NEVER prefix with NEXT_PUBLIC_ */
export const SERVER_DATA_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Required in Vercel for auth + server data */
export const VERCEL_REQUIRED_ENV = [
  ...PUBLIC_ENV_KEYS,
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function getMissingProductionEnv(): string[] {
  const missing: string[] = [];
  for (const key of PUBLIC_ENV_KEYS) {
    if (!process.env[key]) missing.push(key);
  }
  if (!(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    missing.push("SUPABASE_URL");
  }
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY)) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}

export function isProductionConfigured(): boolean {
  const hasServiceKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY
  );
  const hasPublic = PUBLIC_ENV_KEYS.every((key) => process.env[key]);
  const hasUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  return hasPublic && hasUrl && hasServiceKey;
}
