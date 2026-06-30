interface FilterEmptyStateProps {
  message?: string;
}

export function FilterEmptyState({
  message = "No items match the selected filters.",
}: FilterEmptyStateProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
      <p className="text-sm text-zinc-400">{message}</p>
      <p className="mt-1 text-xs text-zinc-600">
        Try changing tier, theme, or comparison options on this page.
      </p>
    </div>
  );
}
