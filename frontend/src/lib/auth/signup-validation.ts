export type SignUpInput = {
  username: string;
  email: string;
  password: string;
};

export function parseSignUpInput(body: unknown): SignUpInput | null {
  if (!body || typeof body !== "object") return null;
  const { username, email, password } = body as Record<string, unknown>;
  if (
    typeof username !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return null;
  }
  return {
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password,
  };
}

export function validateSignUpInput(input: SignUpInput): string | null {
  if (input.username.length < 3) {
    return "Username must be at least 3 characters.";
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(input.username)) {
    return "Username may only contain letters, numbers, _, . and -";
  }
  if (input.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return "Enter a valid email address.";
  }
  return null;
}
