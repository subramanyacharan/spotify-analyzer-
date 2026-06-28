/** Shared caption for the fixed 90-day analysis window (client-safe). */

export function corpusReviewCaption(totalReviews: number): string {
  return `${totalReviews.toLocaleString()} reviews analyzed · Last 90 days`;
}
