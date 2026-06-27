import { NextResponse } from "next/server";
import { isProductionConfigured } from "@/lib/env/deployment";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      configured: isProductionConfigured(),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
