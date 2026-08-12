import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifySupabaseKey, isElevatedSupabaseKey } from "./key-kind";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client for pipeline data reads.
 * MUST use secret / service_role key — never publishable or anon keys.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey && serviceKey === anonKey) {
    console.error(
      "[security] SUPABASE_SERVICE_ROLE_KEY must not equal NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
    return null;
  }

  const keyKind = classifySupabaseKey(serviceKey);
  if (!isElevatedSupabaseKey(keyKind)) {
    console.error(
      `[security] Server data reads require sb_secret_ or service_role key (got ${keyKind}). ` +
        "Set SUPABASE_SERVICE_ROLE_KEY in Vercel to your Supabase secret key."
    );
    return null;
  }

  if (!client) {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
