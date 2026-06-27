import type { NextConfig } from "next";

if (process.env.VERCEL === "1") {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_URL",
  ].filter((key) => !process.env[key]);

  const hasServiceKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY
  );

  if (missing.length > 0 || !hasServiceKey) {
    console.warn(
      "[security] Vercel deploy missing env vars. Required: NEXT_PUBLIC_SUPABASE_* (anon key only), " +
        "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role — never NEXT_PUBLIC_)."
    );
  }

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serverKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (anon && serverKey && anon === serverKey) {
    console.error(
      "[security] SUPABASE_SERVICE_ROLE_KEY must not equal NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
