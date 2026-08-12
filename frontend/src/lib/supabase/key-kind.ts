export type SupabaseKeyKind =
  | "secret"
  | "publishable"
  | "service_role"
  | "anon"
  | "unknown";

/** Classify a Supabase API key without logging the secret. */
export function classifySupabaseKey(key: string | undefined): SupabaseKeyKind {
  if (!key) return "unknown";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";

  const parts = key.split(".");
  if (parts.length < 2) return "unknown";

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { role?: string };
    if (payload.role === "service_role") return "service_role";
    if (payload.role === "anon") return "anon";
  } catch {
    /* not a JWT */
  }

  return "unknown";
}

/** Server-side pipeline reads require elevated keys (bypass RLS). */
export function isElevatedSupabaseKey(kind: SupabaseKeyKind): boolean {
  return kind === "secret" || kind === "service_role";
}
