"""
Phase 2.3: Sentiment Analysis

Hybrid 3-layer pipeline — fully local, zero API calls:

  Layer 1 — VADER (rule-based, instantaneous)
    Fast lexicon-based scorer. Excellent for short app-store reviews with
    capitalization, punctuation and emoticons. Provides compound score [-1, 1].

  Layer 2 — TextBlob (rule-based polarity backup)
    Simple polarity [-1, 1] + subjectivity [0, 1]. Used to break VADER ties
    in the neutral band.

  Layer 3 — Ensemble decision
    Weighted average of VADER compound + TextBlob polarity → final polarity
    label (positive / neutral / negative) and a 1-5 sentiment score.
    Severity score (1-5) based on intensity + discovery-specific pain keywords.

Schema written to Supabase
--------------------------
  sentiment_label  VARCHAR(50)   — 'positive' | 'neutral' | 'negative'
  sentiment_score  INTEGER       — 1-5  (1=very negative … 5=very positive)

(Both columns already exist in processed_reviews from the original schema.)

Design goals
------------
- 100 % of reviews scored (no skips)
- Idempotent — re-running overwrites prior scores
- Batched Supabase upserts (500 rows/call)
- All processing in-process, no subprocess or model download required
"""

import logging
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv
load_dotenv()

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from textblob import TextBlob

from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FETCH_BATCH_SIZE = 1000   # rows per Supabase SELECT page
SUPABASE_BATCH_SIZE = 500  # rows per upsert call

# VADER compound thresholds (standard published values)
VADER_POS_THRESHOLD = 0.05
VADER_NEG_THRESHOLD = -0.05

# Severity keywords — these amplify the severity score when present
# (discovery-specific pain signals borrowed from Theme taxonomy)
SEVERITY_KEYWORDS = [
    "broken", "useless", "terrible", "awful", "hate", "worst", "horrible",
    "frustrating", "disappointed", "disappointing", "garbage", "rubbish",
    "trash", "waste", "scam", "fraud", "fix", "please fix", "fix this",
    "uninstall", "deleted", "deleted the app", "switching",
    "same songs", "same music", "repetitive", "boring", "bored", "stale",
    "never changes", "no variety", "ignores my taste", "doesn't learn",
    "can't find", "hard to find", "search broken", "discover weekly broken",
]

# ---------------------------------------------------------------------------
# Sentiment models — module-level singletons
# ---------------------------------------------------------------------------

_vader = None


def _get_vader() -> SentimentIntensityAnalyzer:
    global _vader
    if _vader is None:
        _vader = SentimentIntensityAnalyzer()
    return _vader


# ---------------------------------------------------------------------------
# Core scoring logic
# ---------------------------------------------------------------------------

def _vader_score(text: str) -> float:
    """Return VADER compound score in [-1, 1]."""
    return _get_vader().polarity_scores(text)["compound"]


def _textblob_score(text: str) -> float:
    """Return TextBlob polarity in [-1, 1]."""
    return TextBlob(text).sentiment.polarity


def _severity_boost(text: str) -> float:
    """
    Return an additional severity signal [0, 1] based on pain-keyword density.
    Used to push negative reviews toward score=1 when they contain strong pain words.
    """
    text_lower = text.lower()
    hits = sum(1 for kw in SEVERITY_KEYWORDS if kw in text_lower)
    # Cap boost at 1.0, ramp up quickly (3 hits → full boost)
    return min(hits / 3.0, 1.0)


def _compound_to_label_and_score(
    compound: float,
    severity_boost: float = 0.0,
) -> Tuple[str, int]:
    """
    Convert a compound sentiment value [-1, 1] → (label, 1-5 score).

    Score mapping (with severity boost pulling negatives lower):
      [-1.0, -0.6)  → negative, 1
      [-0.6, -0.05) → negative, 2
      [-0.05, 0.05] → neutral,  3
      (0.05, 0.5]   → positive, 4
      (0.5, 1.0]    → positive, 5

    Severity boost lowers the score by up to 1 point for negative reviews.
    """
    # Apply severity pull for negative texts
    adjusted = compound - (severity_boost * 0.3 if compound < 0 else 0.0)

    if adjusted >= 0.5:
        return "positive", 5
    elif adjusted >= VADER_POS_THRESHOLD:
        return "positive", 4
    elif adjusted > VADER_NEG_THRESHOLD:
        return "neutral", 3
    elif adjusted >= -0.6:
        return "negative", 2
    else:
        return "negative", 1


def analyze_sentiment(text: str) -> Tuple[str, int]:
    """
    Run the 3-layer hybrid sentiment pipeline on a single review text.

    Returns (sentiment_label, sentiment_score).
      sentiment_label : 'positive' | 'neutral' | 'negative'
      sentiment_score : 1-5
    """
    if not text or not text.strip():
        return "neutral", 3

    vader_c = _vader_score(text)
    tb_c = _textblob_score(text)
    sev = _severity_boost(text)

    # Weighted ensemble: VADER carries more weight (0.7) than TextBlob (0.3)
    compound = 0.7 * vader_c + 0.3 * tb_c

    return _compound_to_label_and_score(compound, severity_boost=sev)


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def fetch_reviews_for_sentiment(
    skip_scored: bool = True,
    batch_size: int = FETCH_BATCH_SIZE,
) -> List[Dict[str, Any]]:
    """
    Fetch processed reviews that need sentiment scoring.

    Parameters
    ----------
    skip_scored : bool
        When True, skip reviews that already have a sentiment_label set.
        Set False to re-score everything (idempotent re-run).
    """
    client = get_supabase_client()
    all_reviews: List[Dict[str, Any]] = []
    offset = 0

    logger.info(
        "Fetching reviews for sentiment analysis (skip_scored=%s)…", skip_scored
    )

    while True:
        query = (
            client.table("processed_reviews")
            .select("id, raw_review_id, cleaned_text")
            .order("processed_at", desc=False)
            .range(offset, offset + batch_size - 1)
        )
        if skip_scored:
            query = query.is_("sentiment_label", "null")

        resp = query.execute()
        batch = resp.data or []
        if not batch:
            break

        all_reviews.extend(batch)
        logger.info("  Fetched %d reviews so far…", len(all_reviews))

        if len(batch) < batch_size:
            break
        offset += batch_size

    logger.info("Total reviews to score: %d", len(all_reviews))
    return all_reviews


def write_sentiment_to_supabase(
    scored_reviews: List[Dict[str, Any]],
    batch_size: int = SUPABASE_BATCH_SIZE,
) -> Tuple[int, int]:
    """
    Batch-upsert sentiment_label and sentiment_score to Supabase.

    Each item in *scored_reviews* must have keys:
      id, raw_review_id, cleaned_text, sentiment_label, sentiment_score

    Returns (success_count, error_count).
    """
    client = get_supabase_client()
    success_count = 0
    error_count = 0
    total_batches = (len(scored_reviews) - 1) // batch_size + 1

    for i in range(0, len(scored_reviews), batch_size):
        batch = scored_reviews[i : i + batch_size]
        payload = [
            {
                "id": r["id"],
                "raw_review_id": r["raw_review_id"],
                "cleaned_text": r["cleaned_text"],
                "sentiment_label": r["sentiment_label"],
                "sentiment_score": r["sentiment_score"],
            }
            for r in batch
        ]
        try:
            client.table("processed_reviews").upsert(
                payload, on_conflict="id"
            ).execute()
            success_count += len(batch)
            logger.info(
                "  Upserted batch %d/%d (%d rows).",
                i // batch_size + 1,
                total_batches,
                len(batch),
            )
        except Exception as exc:
            logger.error(
                "  Upsert batch %d/%d failed: %s",
                i // batch_size + 1,
                total_batches,
                exc,
            )
            error_count += len(batch)

    return success_count, error_count


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def run_sentiment_analysis(
    skip_scored: bool = True,
    log_every: int = 5000,
) -> Dict[str, Any]:
    """
    Phase 2.3 orchestration: Sentiment Analysis.

    Steps
    -----
    1. Fetch reviews from Supabase (optionally skip already-scored rows).
    2. Run the VADER + TextBlob ensemble on every review text (in-process).
    3. Batch-upsert sentiment_label and sentiment_score back to Supabase.
    4. Return summary statistics.

    Parameters
    ----------
    skip_scored : bool
        Skip reviews that already have a sentiment_label.
        Set False to re-score all 48K reviews from scratch.
    log_every : int
        Log a progress line every N reviews during scoring.
    """
    logger.info("=" * 60)
    logger.info("Phase 2.3: Sentiment Analysis — START")
    logger.info("=" * 60)

    # 1. Fetch
    reviews = fetch_reviews_for_sentiment(skip_scored=skip_scored)
    if not reviews:
        logger.info("No reviews to score — all already have sentiment labels.")
        return {
            "reviews_scored": 0,
            "supabase_success": 0,
            "supabase_errors": 0,
            "label_distribution": {},
            "score_distribution": {},
        }

    # 2. Score in-process (VADER + TextBlob, no I/O)
    logger.info("Scoring %d reviews with VADER + TextBlob ensemble…", len(reviews))
    scored: List[Dict[str, Any]] = []
    label_counts: Dict[str, int] = {"positive": 0, "neutral": 0, "negative": 0}
    score_counts: Dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

    for idx, review in enumerate(reviews, 1):
        text = review.get("cleaned_text", "") or ""
        label, score = analyze_sentiment(text)

        scored.append({
            **review,
            "sentiment_label": label,
            "sentiment_score": score,
        })
        label_counts[label] = label_counts.get(label, 0) + 1
        score_counts[score] = score_counts.get(score, 0) + 1

        if idx % log_every == 0:
            logger.info(
                "  Scored %d/%d reviews (%.1f%%)…",
                idx, len(reviews), 100 * idx / len(reviews),
            )

    logger.info("Scoring complete. Label distribution: %s", label_counts)
    logger.info("Score distribution: %s", dict(sorted(score_counts.items())))

    # 3. Write back to Supabase
    logger.info("Writing sentiment scores to Supabase…")
    success, errors = write_sentiment_to_supabase(scored)

    summary: Dict[str, Any] = {
        "reviews_scored": len(scored),
        "supabase_success": success,
        "supabase_errors": errors,
        "label_distribution": label_counts,
        "score_distribution": dict(sorted(score_counts.items())),
    }

    logger.info("=" * 60)
    logger.info("Phase 2.3 complete:")
    logger.info("  Reviews scored     : %d", summary["reviews_scored"])
    logger.info("  Supabase success   : %d", summary["supabase_success"])
    logger.info("  Supabase errors    : %d", summary["supabase_errors"])
    logger.info("  Label distribution : %s", summary["label_distribution"])
    logger.info("  Score distribution : %s", summary["score_distribution"])
    logger.info("=" * 60)

    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Phase 2.3 — Sentiment Analysis (VADER + TextBlob)"
    )
    parser.add_argument(
        "--rescore-all",
        action="store_true",
        help="Re-score all reviews, even those already scored (idempotent).",
    )
    args = parser.parse_args()

    result = run_sentiment_analysis(skip_scored=not args.rescore_all)

    print("\n--- Phase 2.3 Summary ---")
    for k, v in result.items():
        print(f"  {k}: {v}")
