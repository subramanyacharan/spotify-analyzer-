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

/** Server-only env required for live Supabase data on Vercel. */
export const VERCEL_REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function getMissingProductionEnv(): string[] {
  const missing: string[] = [];
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
  const hasUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  return hasUrl && hasServiceKey;
}
