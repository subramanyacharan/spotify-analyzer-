import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Resolve username or email to the email Supabase Auth expects */
export async function resolveLoginEmail(
  supabase: SupabaseClient,
  usernameOrEmail: string
): Promise<string | null> {
  const trimmed = usernameOrEmail.trim();
  if (!trimmed) return null;

  if (looksLikeEmail(trimmed)) {
    return trimmed.toLowerCase();
  }

  const { data, error } = await supabase.rpc("resolve_login_email", {
    identifier: trimmed,
  });

  if (error) {
    console.error("resolve_login_email:", error.message);
    return null;
  }

  return typeof data === "string" ? data : null;
}
