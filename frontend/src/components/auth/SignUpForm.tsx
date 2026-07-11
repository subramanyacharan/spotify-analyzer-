"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { mapAuthError, USER_MESSAGES } from "@/lib/auth/user-messages";
import { tryCreateClient } from "@/lib/supabase/client";
import { AuthAlert } from "./AuthAlert";
import { AuthField } from "./AuthField";
import { AuthShell } from "./AuthShell";

export function SignUpForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      setError("Username may only contain letters, numbers, _, . and -");
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
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const supabase = tryCreateClient();
      if (!supabase) {
        setError(USER_MESSAGES.unavailable);
        return;
      }

      const signupResponse = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          password,
        }),
      });

      const signupPayload = (await signupResponse.json()) as {
        error?: string;
        email?: string;
      };

      if (!signupResponse.ok) {
        setError(signupPayload.error ?? USER_MESSAGES.signUpFailed);
        return;
      }

      const signInEmail = signupPayload.email ?? trimmedEmail;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password,
      });

      if (signInError) {
        setError(mapAuthError(signInError.message));
        return;
      }

      setSuccess("Account created. Redirecting to dashboard…");
      router.push("/overview");
      router.refresh();
    } catch {
      setError(USER_MESSAGES.signUpFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create account" subtitle="Register for AI Analyzer access">
      <AuthAlert type="error" message={error} />
      <AuthAlert type="success" message={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="username"
          label="Username"
          value={username}
          onChange={setUsername}
          placeholder="your_username"
          autoComplete="username"
          disabled={loading}
        />
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          disabled={loading}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          disabled={loading}
          showPasswordToggle
        />
        <AuthField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          disabled={loading}
          showPasswordToggle
        />

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="text-[#1db954] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
