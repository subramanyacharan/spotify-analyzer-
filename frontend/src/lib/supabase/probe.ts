import "server-only";

import { getSupabaseServerClient } from "./server";
import { classifySupabaseKey, isElevatedSupabaseKey } from "./key-kind";

export type SupabaseDataProbe = {
  keyKind: ReturnType<typeof classifySupabaseKey>;
  elevatedKey: boolean;
  weeklyInsightsRows: number | null;
  queryError: string | null;
};

/** Lightweight read probe for /api/health — no table writes. */
export async function probeSupabaseDataAccess(): Promise<SupabaseDataProbe> {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  const keyKind = classifySupabaseKey(serviceKey);
  const elevatedKey = isElevatedSupabaseKey(keyKind);

  const client = getSupabaseServerClient();
  if (!client) {
    return {
      keyKind,
      elevatedKey,
      weeklyInsightsRows: null,
      queryError: "Supabase server client not configured",
    };
  }

  try {
    const { count, error } = await client
      .from("weekly_insights")
      .select("id", { count: "exact", head: true });

    if (error) {
      return {
        keyKind,
        elevatedKey,
        weeklyInsightsRows: null,
        queryError: error.message,
      };
    }

    return {
      keyKind,
      elevatedKey,
      weeklyInsightsRows: count ?? 0,
      queryError: null,
    };
  } catch (e) {
    return {
      keyKind,
      elevatedKey,
      weeklyInsightsRows: null,
      queryError: e instanceof Error ? e.message : "Unknown probe error",
    };
  }
}
