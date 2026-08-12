import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const dataClient = getSupabaseServerClient();
  if (!dataClient) {
    return NextResponse.json(
      {
        error:
          "Server data source not configured. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY as service role) — never use the anon key.",
      },
      { status: 503 }
    );
  }

  const { data: weeklyRows, error: weeklyError } = await dataClient
    .from("weekly_insights")
    .select("id, week_start, week_end, top_themes, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (weeklyError) {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    weeklyInsight: weeklyRows?.[0] ?? null,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="growth-intelligence-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
