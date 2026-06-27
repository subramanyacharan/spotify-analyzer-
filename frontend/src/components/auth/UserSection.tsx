"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "./AuthProvider";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function UserSection() {
  const router = useRouter();
  const { profile, loading, configured, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  if (!configured) {
    return (
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-white">
            LD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">Local dev</p>
            <p className="truncate text-xs text-zinc-500">Auth not configured</p>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.username ?? "…";
  const displayEmail = profile?.email ?? "";

  return (
    <div className="border-t border-zinc-800 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-white">
          {loading ? "…" : initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {loading ? "Loading…" : displayName}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {loading ? "" : displayEmail}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut || loading}
          title="Sign out"
          className="shrink-0 rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
