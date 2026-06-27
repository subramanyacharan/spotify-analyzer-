import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured } from "@/lib/auth/config";
import {
  isGuestOnlyPath,
  isProtectedApiPath,
  isProtectedPath,
  isPublicPath,
} from "@/lib/auth/routes";
import { isVercel } from "@/lib/deploy/deployment";

function redirectMissingConfig(request: NextRequest) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("error", "missing_config");
  return NextResponse.redirect(redirectUrl);
}

function redirectLogin(request: NextRequest, pathname: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(redirectUrl);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const authConfigured = isAuthConfigured();
  const requiresAuth =
    isProtectedPath(pathname) || isProtectedApiPath(pathname);

  if (pathname === "/dashboard") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/overview";
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/weekly-reports") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/reports";
    return NextResponse.redirect(redirectUrl);
  }

  if (isVercel() && !authConfigured && requiresAuth) {
    return redirectMissingConfig(request);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!authConfigured || !url || !key) {
    if (pathname === "/") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/overview";
      return NextResponse.redirect(redirectUrl);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = user ? "/overview" : "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (isPublicPath(pathname)) {
    return supabaseResponse;
  }

  if (requiresAuth && !user) {
    return redirectLogin(request, pathname);
  }

  if (isGuestOnlyPath(pathname) && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/overview";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
