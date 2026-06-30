import { NextResponse } from "next/server";
import { isProductionConfigured } from "@/lib/deploy/deployment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchWeeklySnapshotMeta,
} from "@/lib/data/weekly-insights-merge";

export async function GET() {
  const client = getSupabaseServerClient();

  try {
    const snapshotMeta = await fetchWeeklySnapshotMeta();

    return NextResponse.json(
      {
        ok: true,
        configured: isProductionConfigured(),
        hasSupabaseClient: Boolean(client),
        snapshot: snapshotMeta,
        totalReviewsAnalyzed: snapshotMeta.corpusReviewCount || null,
        dataReady: snapshotMeta.hasRequiredKeys && snapshotMeta.corpusReviewCount > 0,
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
