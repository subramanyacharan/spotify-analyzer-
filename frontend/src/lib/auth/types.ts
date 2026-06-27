import type { Session, User } from "@supabase/supabase-js";

export interface AuthProfile {
  username: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  configured: boolean;
}
