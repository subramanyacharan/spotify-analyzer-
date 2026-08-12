import { NextResponse, type NextRequest } from "next/server";

const LEGACY_OVERVIEW_REDIRECTS = new Set([
  "/",
  "/dashboard",
  "/weekly-reports",
  "/reports",
]);

const AUTH_ROUTE_REDIRECTS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LEGACY_OVERVIEW_REDIRECTS.has(pathname) || AUTH_ROUTE_REDIRECTS.has(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/overview";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request });
}
