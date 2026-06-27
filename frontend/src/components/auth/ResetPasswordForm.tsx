"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { tryCreateClient } from "@/lib/supabase/client";
import { AuthAlert } from "./AuthAlert";
import { AuthField } from "./AuthField";
import { AuthShell } from "./AuthShell";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const supabase = tryCreateClient();
    if (!supabase) {
      setError(
        "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
      );
      setCheckingSession(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!data.session) {
        setError(
          "Reset link expired or invalid. Request a new password reset link."
        );
      } else {
        setSessionReady(true);
      }
      setCheckingSession(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!sessionReady) {
      setError("Reset link expired or invalid. Request a new password reset link.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = tryCreateClient();
      if (!supabase) {
        setError(
          "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
        );
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess("Password updated. Redirecting to dashboard…");
      setTimeout(() => {
        router.push("/overview");
        router.refresh();
      }, 1200);
    } catch {
      setError("Unable to update password. Try the reset link again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <AuthShell title="Set new password" subtitle="Verifying reset link…">
        <div className="flex items-center justify-center py-8 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set new password" subtitle="Choose a new password for your account">
      <AuthAlert type="error" message={error} />
      <AuthAlert type="success" message={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          disabled={loading || !sessionReady}
        />
        <AuthField
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          disabled={loading || !sessionReady}
        />

        <button
          type="submit"
          disabled={loading || !sessionReady}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href="/login" className="text-[#1db954] hover:underline">
          Back to sign in
        </Link>
        {!sessionReady && (
          <>
            {" · "}
            <Link href="/forgot-password" className="text-[#1db954] hover:underline">
              Request new link
            </Link>
          </>
        )}
      </p>
    </AuthShell>
  );
}
