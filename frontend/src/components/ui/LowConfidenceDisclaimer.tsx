"use client";

import type { ConfidenceLevel } from "@/lib/types";

interface LowConfidenceDisclaimerProps {
  level: ConfidenceLevel;
  className?: string;
}

export function LowConfidenceDisclaimer({
  level,
  className = "",
}: LowConfidenceDisclaimerProps) {
  if (level !== "Low") return null;

  return (
    <p
      className={`text-xs text-amber-500/90 ${className}`}
      role="note"
    >
      Limited evidence — interpret with caution.
    </p>
  );
}
