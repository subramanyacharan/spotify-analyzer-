import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/auth/config";
import { isProtectedPath } from "@/lib/auth/routes";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export async function getServerSession() {
  if (!isAuthConfigured()) {
    return { user: null, configured: false as const };
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, configured: true as const };
}

export async function getServerProfile(userId: string) {
  if (!isAuthConfigured()) return null;

  const supabase = await createAuthServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("id", userId)
    .maybeSingle();

  return data;
}

/** Server-side guard for dashboard pages (middleware backup). */
export async function requireAuth(pathname: string) {
  if (!isProtectedPath(pathname) || !isAuthConfigured()) return;

  const { user } = await getServerSession();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }
}
