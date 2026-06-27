"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/insights", label: "User feedback" },
  { href: "/insights/analytics", label: "Themes & trends" },
];

export function InsightsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-zinc-800 px-6 pt-4">
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`border-b-2 px-4 pb-3 text-sm font-medium transition ${
              active
                ? "border-[#1db954] text-[#1db954]"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
