-- One-time cleanup: processed_reviews should have one row per raw_review_id.
-- Duplicate rows inflate Phase 3 counts (~4x) even when the 90-day date filter is correct.
-- Run in Supabase SQL editor, then re-run the weekly pipeline (Phase 3–5).

-- Keep the newest processed row per raw_review_id; delete the rest.
DELETE FROM public.processed_reviews
WHERE raw_review_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (raw_review_id) id
    FROM public.processed_reviews
    WHERE raw_review_id IS NOT NULL
    ORDER BY raw_review_id, processed_at DESC NULLS LAST, id
  );

-- Ensure unique index exists (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_reviews_raw_review_id
  ON public.processed_reviews(raw_review_id);
