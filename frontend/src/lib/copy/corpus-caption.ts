/** Shared caption for the fixed 90-day analysis window (client-safe). */

export function corpusReviewCaption(
  totalReviews: number,
  anchor?: string | Date
): string {
  const window =
    anchor != null
      ? (() => {
          const d = typeof anchor === "string" ? new Date(anchor) : anchor;
          if (Number.isNaN(d.getTime())) return "Last 90 days";
          const through = d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `Last 90 days · through ${through}`;
        })()
      : "Last 90 days";
  return `${totalReviews.toLocaleString()} reviews analyzed · ${window}`;
}
