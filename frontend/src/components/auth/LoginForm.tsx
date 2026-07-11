"use client";

import { useState } from "react";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";

import { Loader2 } from "lucide-react";

import { resolveLoginEmail } from "@/lib/auth/resolve-email";

import {

  mapAuthCallbackError,

  mapAuthError,

  USER_MESSAGES,

} from "@/lib/auth/user-messages";

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
  const [error, setError] = useState(mapAuthCallbackError(callbackError));
  const [success, setSuccess] = useState("");



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    setError("");

    setSuccess("");

    setLoading(true);



    try {

      const supabase = tryCreateClient();

      if (!supabase) {

        setError(USER_MESSAGES.unavailable);

        return;

      }

      const email = await resolveLoginEmail(supabase, identifier);



      if (!email) {

        setError(USER_MESSAGES.noAccount);

        return;

      }



      const { error: signInError } = await supabase.auth.signInWithPassword({

        email,

        password,

      });



      if (signInError) {

        setError(mapAuthError(signInError.message));

        return;

      }



      setSuccess("Signed in successfully. Redirecting…");

      router.push(redirectTo);

      router.refresh();

    } catch {

      setError(USER_MESSAGES.signInFailed);

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

          showPasswordToggle

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


