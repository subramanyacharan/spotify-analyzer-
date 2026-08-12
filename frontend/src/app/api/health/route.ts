import { NextResponse } from "next/server";
import { isProductionConfigured } from "@/lib/deploy/deployment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { probeSupabaseDataAccess } from "@/lib/supabase/probe";
import { fetchWeeklySnapshotMeta } from "@/lib/data/weekly-insights-merge";

export async function GET() {
  const client = getSupabaseServerClient();

  try {
    const [snapshotMeta, supabaseProbe] = await Promise.all([
      fetchWeeklySnapshotMeta(),
      probeSupabaseDataAccess(),
    ]);

    const dataReady =
      snapshotMeta.hasRequiredKeys && snapshotMeta.corpusReviewCount > 0;

    return NextResponse.json(
      {
        ok: true,
        configured: isProductionConfigured(),
        hasSupabaseClient: Boolean(client),
        supabase: supabaseProbe,
        snapshot: snapshotMeta,
        totalReviewsAnalyzed: snapshotMeta.corpusReviewCount || null,
        dataReady,
        hint:
          !dataReady && snapshotMeta.hasRequiredKeys && snapshotMeta.corpusReviewCount > 0
            ? null
            : !dataReady && supabaseProbe.queryError && snapshotMeta.hasRequiredKeys
              ? "Supabase unreachable — serving bundled snapshot fallback."
              : !dataReady && supabaseProbe.weeklyInsightsRows === 0
                ? "Set SUPABASE_SERVICE_ROLE_KEY to your sb_secret_ or legacy service_role key in Vercel (not the publishable/anon key)."
                : !dataReady && !supabaseProbe.elevatedKey
                  ? "Server key is not elevated — pipeline tables require secret/service_role access."
                  : !dataReady && supabaseProbe.queryError
                    ? "Supabase unreachable — check SUPABASE_URL or restore the Supabase project."
                    : null,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[health] snapshot load failed:", e);
    return NextResponse.json(
      {
        ok: false,
        configured: isProductionConfigured(),
        hasSupabaseClient: Boolean(client),
        dataReady: false,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
