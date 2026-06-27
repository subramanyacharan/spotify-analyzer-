"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isAuthConfigured } from "@/lib/auth/config";
import type { AuthProfile } from "@/lib/auth/types";
import { tryCreateClient } from "@/lib/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(
  user: User
): Promise<AuthProfile | null> {
  const supabase = tryCreateClient();
  if (!supabase) return null;

  const metaUsername = user.user_metadata?.username as string | undefined;
  if (metaUsername && user.email) {
    return { username: metaUsername, email: user.email };
  }

  const { data } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("id", user.id)
    .maybeSingle();

  if (data) return data;

  if (user.email) {
    return {
      username: user.email.split("@")[0] ?? "User",
      email: user.email,
    };
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isAuthConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(configured);

  const syncUser = useCallback(async (nextUser: User | null) => {
    setUser(nextUser);
    if (!nextUser) {
      setProfile(null);
      return;
    }
    setProfile(await loadProfile(nextUser));
  }, []);

  const refresh = useCallback(async () => {
    const supabase = tryCreateClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const {
      data: { session: nextSession },
    } = await supabase.auth.getSession();

    setSession(nextSession);
    await syncUser(nextSession?.user ?? null);
    setLoading(false);
  }, [syncUser]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = tryCreateClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, nextSession: Session | null) => {
        setSession(nextSession);
        await syncUser(nextSession?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [configured, refresh, syncUser]);

  const signOut = useCallback(async () => {
    const supabase = tryCreateClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      configured,
      signOut,
      refresh,
    }),
    [user, session, profile, loading, configured, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
