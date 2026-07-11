import { NextResponse } from "next/server";
import { mapAuthError, USER_MESSAGES } from "@/lib/auth/user-messages";
import {
  parseSignUpInput,
  validateSignUpInput,
} from "@/lib/auth/signup-validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Create a confirmed account — no email verification step. */
export async function POST(request: Request) {
  const client = getSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      { error: USER_MESSAGES.unavailable },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: USER_MESSAGES.signUpFailed },
      { status: 400 }
    );
  }

  const input = parseSignUpInput(body);
  if (!input) {
    return NextResponse.json(
      { error: USER_MESSAGES.signUpFailed },
      { status: 400 }
    );
  }

  const validationError = validateSignUpInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: available, error: checkError } = await client.rpc(
    "is_username_available",
    { p_username: input.username }
  );

  if (checkError) {
    console.error("[signup] username check failed:", checkError.message);
    return NextResponse.json(
      { error: USER_MESSAGES.signUpFailed },
      { status: 500 }
    );
  }

  if (available === false) {
    return NextResponse.json(
      { error: USER_MESSAGES.usernameTaken },
      { status: 409 }
    );
  }

  const { data, error } = await client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { username: input.username },
  });

  if (error) {
    return NextResponse.json(
      { error: mapAuthError(error.message) },
      { status: 400 }
    );
  }

  if (!data.user) {
    return NextResponse.json(
      { error: USER_MESSAGES.signUpFailed },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email: input.email });
}
