"use client";



import { useState } from "react";

import Link from "next/link";

import { Loader2 } from "lucide-react";

import { resolveLoginEmail } from "@/lib/auth/resolve-email";
import { buildAuthCallbackUrl } from "@/lib/auth/site-url";

import { mapAuthError, USER_MESSAGES } from "@/lib/auth/user-messages";

import { tryCreateClient } from "@/lib/supabase/client";

import { AuthAlert } from "./AuthAlert";

import { AuthField } from "./AuthField";

import { AuthShell } from "./AuthShell";



export function ForgotPasswordForm() {

  const [identifier, setIdentifier] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

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



      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: buildAuthCallbackUrl("/reset-password"),
        }
      );



      if (resetError) {

        setError(mapAuthError(resetError.message));

        return;

      }



      setSuccess(

        "If an account exists, a password reset link has been sent to the registered email."

      );

    } catch {

      setError(USER_MESSAGES.resetEmailFailed);

    } finally {

      setLoading(false);

    }

  };



  return (

    <AuthShell

      title="Reset password"

      subtitle="Enter your username or email to receive a reset link"

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



        <button

          type="submit"

          disabled={loading}

          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1db954] py-2.5 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-60"

        >

          {loading && <Loader2 className="h-4 w-4 animate-spin" />}

          {loading ? "Sending…" : "Send reset link"}

        </button>

      </form>



      <p className="mt-6 text-center text-sm text-zinc-500">

        <Link href="/login" className="text-[#1db954] hover:underline">

          Back to sign in

        </Link>

      </p>

    </AuthShell>

  );

}


