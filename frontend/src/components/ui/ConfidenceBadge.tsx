import type { ConfidenceLevel } from "@/lib/types";

const STYLES: Record<
  ConfidenceLevel,
  { badge: string; dot: string }
> = {
  High: {
    badge: "bg-[#1db954]/15 text-[#1db954] border-[#1db954]/30",
    dot: "bg-[#1db954]",
  },
  Medium: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
  },
  Low: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
};

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  factors?: string[];
  className?: string;
}

export function ConfidenceBadge({
  level,
  factors = [],
  className = "",
}: ConfidenceBadgeProps) {
  const style = STYLES[level];
  const title = factors.length ? factors.join(" · ") : `${level} confidence`;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {level} confidence
    </span>
  );
}
