"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#0d0d0d] p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/login" className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1db954]">
              <BarChart3 className="h-5 w-5 text-black" />
            </div>
          </Link>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-xl">
          {children}
        </div>

        <p className="mt-6 text-center text-[10px] text-zinc-600">
          AI Analyzer · Internal product intelligence
        </p>
      </div>
    </div>
  );
}
