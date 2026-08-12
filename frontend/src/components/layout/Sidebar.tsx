"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Target,
  Users,
} from "lucide-react";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/segments", label: "Segments", icon: Users },
  { href: "/deep-dive", label: "Deep Dive", icon: Layers },
  { href: "/opportunities", label: "Opportunities", icon: Target },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-[#0a0a0a]">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1db954]">
          <BarChart3 className="h-4 w-4 text-black" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Product & Growth</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Internal Analytics
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-zinc-800/80 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-[#1db954]" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
