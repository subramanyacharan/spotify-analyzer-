"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resolveLoginEmail } from "@/lib/auth/resolve-email";
import { tryCreateClient } from "@/lib/supabase/client";
import { AuthAlert } from "./AuthAlert";
import { AuthField } from "./AuthField";
import { AuthShell } from "./AuthShell";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/overview";
  const callbackError = searchParams.get("error");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    callbackError === "auth_callback"
      ? "Sign-in link expired or invalid. Try again."
      : callbackError === "missing_config"
        ? "Production deploy is missing Supabase env vars. Set them in Vercel project settings."
        : ""
  );
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const supabase = tryCreateClient();
      if (!supabase) {
        setError(
          "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
        );
        return;
      }
      const email = await resolveLoginEmail(supabase, identifier);

      if (!email) {
        setError("No account found for that username or email.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(
          signInError.message === "Invalid login credentials"
            ? "Incorrect username/email or password."
            : signInError.message
        );
        return;
      }

      setSuccess("Signed in successfully. Redirecting…");
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to sign in. Check your Supabase configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to the AI Analyzer dashboard"
    >
      <AuthAlert type="error" message={error} />
      <AuthAlert type="success" message={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="identifier"
          label="Username or email"
          value={identifier}
          onChange={setIdentifier}
          placeholder="you@company.com or username"
          autoComplete="username"
          disabled={loading}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={loading}
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-[#1db954] hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        No account?{" "}
        <Link href="/signup" className="text-[#1db954] hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
