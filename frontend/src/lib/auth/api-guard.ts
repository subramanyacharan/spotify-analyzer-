import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

/** Require authenticated session for API routes. */
export async function requireApiUser() {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, response: null };
}
