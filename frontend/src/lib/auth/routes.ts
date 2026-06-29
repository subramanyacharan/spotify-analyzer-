/** Routes that require an authenticated Supabase session */
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/overview",
  "/insights",
  "/segments",
  "/deep-dive",
  "/opportunities",
] as const;

/** Auth UI routes (login, signup, password flows) */
export const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

/** Redirect to dashboard when session exists (exclude reset-password — recovery session) */
export const GUEST_ONLY_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/** Unauthenticated API routes (health checks) */
export const PUBLIC_API_ROUTES = ["/api/health"] as const;

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_ROUTES.includes(pathname as (typeof PUBLIC_API_ROUTES)[number]);
}

export function isProtectedApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") && !isPublicApiPath(pathname);
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/") ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    isPublicApiPath(pathname)
  );
}
