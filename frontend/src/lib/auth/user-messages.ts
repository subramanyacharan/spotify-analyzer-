/** User-safe messages — never expose Supabase, SQL, or stack details in the UI. */

export const USER_MESSAGES = {
  unavailable:
    "This feature is temporarily unavailable. Please try again in a few minutes.",
  authUnavailable:
    "We couldn't complete your request. Please try again later.",
  signInFailed:
    "We couldn't sign you in. Check your username or email and password, then try again.",
  signUpFailed:
    "We couldn't create your account. Please check your details and try again.",
  usernameTaken: "That username is already taken. Please choose another.",
  accountExists: "An account with this email already exists. Try signing in instead.",
  emailConfirmRequired:
    "Please confirm your email address before signing in.",
  emailConfirmed:
    "Your email is confirmed. Sign in with your username or email and password.",
  resetEmailFailed:
    "We couldn't send a reset link. Please try again later.",
  resetLinkInvalid:
    "This reset link has expired or is invalid. Request a new one.",
  passwordUpdateFailed:
    "We couldn't update your password. Please try again.",
  exportFailed: "Export failed. Please try again later.",
  noAccount: "No account found for that username or email.",
} as const;

const AUTH_ERROR_MAP: Record<string, string> = {
  "Invalid login credentials": USER_MESSAGES.signInFailed,
  "Email not confirmed": USER_MESSAGES.emailConfirmRequired,
  "User already registered": USER_MESSAGES.accountExists,
  "Signup requires a valid password": USER_MESSAGES.signUpFailed,
  "Password should be at least 6 characters": "Password must be at least 8 characters.",
};

/** Map Supabase Auth API errors to safe user-facing text. */
export function mapAuthError(message: string | undefined | null): string {
  if (!message?.trim()) return USER_MESSAGES.authUnavailable;
  const exact = AUTH_ERROR_MAP[message.trim()];
  if (exact) return exact;

  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return USER_MESSAGES.signInFailed;
  }
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return USER_MESSAGES.accountExists;
  }
  if (lower.includes("email not confirmed")) {
    return USER_MESSAGES.emailConfirmRequired;
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return USER_MESSAGES.authUnavailable;
}

/** Map URL callback error codes to safe messages. */
export function mapAuthCallbackError(code: string | null): string {
  switch (code) {
    case "auth_callback":
      return USER_MESSAGES.resetLinkInvalid;
    case "missing_config":
      return USER_MESSAGES.unavailable;
    default:
      return "";
  }
}

/** Never surface API / server error bodies to the user. */
export function genericExportError(): string {
  return USER_MESSAGES.exportFailed;
}
