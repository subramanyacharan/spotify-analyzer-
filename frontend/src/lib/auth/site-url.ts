/** Force HTTPS on Vercel so auth redirects never downgrade to an insecure origin. */
export function normalizePublicSiteUrl(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  if (process.env.VERCEL === "1" && trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }
  return trimmed;
}

/**
 * Public site URL for auth email links. Always prefer NEXT_PUBLIC_SITE_URL in
 * production so confirmation emails never point at localhost.
 */
export function getSiteUrl(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return normalizePublicSiteUrl(configured);

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const vercelHost = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercelHost) {
    const origin = vercelHost.startsWith("http") ? vercelHost : `https://${vercelHost}`;
    return normalizePublicSiteUrl(origin);
  }

  return fallbackOrigin ?? "http://localhost:3000";
}

/** Build Supabase redirect URL for /auth/callback on the public site. */
export function buildAuthCallbackUrl(
  nextPath: string,
  extraParams?: Record<string, string>
): string {
  const base = getSiteUrl();
  const url = new URL("/auth/callback", base);
  url.searchParams.set("next", nextPath);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
