"""
Phase 2.4: User Segment Detection

Hybrid 2-stage pipeline — fully local, zero API calls:

  Stage 1 — Rule-based detection (priority-ordered)
    Scan review text for explicit language signals and rating metadata.
    Rules are priority-ordered: first match wins.
    Covers the majority of clear-cut cases in <1ms per review.

  Stage 2 — Keyword-density fallback
    For reviews that don't fire any priority rule, score each segment
    against a keyword dictionary and pick the highest-scoring segment.
    Falls back to "Casual Listener" when no segment scores above noise.

Segments (from implementation plan)
-------------------------------------
  New User            — just started, first time, new to spotify
  Premium User        — explicitly mentions paying / premium / family plan
  Heavy Listener      — hours daily, music all day, can't live without
  Niche Music Listener — indie, underground, niche genre, lesser-known
  Casual Listener     — default / fallback segment

Schema written to Supabase
--------------------------
  user_segment  VARCHAR(100) — one of the five segment labels above
  (Column already exists in processed_reviews from the original schema.)

Design goals
------------
- 100% coverage — every review receives exactly one segment label
- Idempotent — re-running overwrites prior segments
- Batched Supabase upserts (500 rows/call)
- No model downloads required (pure regex + keyword matching)
"""

import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv
load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Segment labels — canonical names stored in Supabase
# ---------------------------------------------------------------------------

SEGMENT_NEW_USER = "New User"
SEGMENT_PREMIUM = "Premium User"
SEGMENT_HEAVY = "Heavy Listener"
SEGMENT_NICHE = "Niche Music Listener"
SEGMENT_CASUAL = "Casual Listener"

ALL_SEGMENTS = [
    SEGMENT_NEW_USER,
    SEGMENT_PREMIUM,
    SEGMENT_HEAVY,
    SEGMENT_NICHE,
    SEGMENT_CASUAL,
]

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FETCH_BATCH_SIZE = 1000
SUPABASE_BATCH_SIZE = 500

# ---------------------------------------------------------------------------
# Stage 1: Priority rules (compiled regex patterns)
# ---------------------------------------------------------------------------
# Rules are evaluated in order — first match wins.
# Each rule is (segment, compiled_regex).
# We compile once at module load to avoid re-compiling per review.

_PRIORITY_RULES: List[Tuple[str, re.Pattern]] = [
    # ── New User ─────────────────────────────────────────────────────────
    (SEGMENT_NEW_USER, re.compile(
        r"\b("
        r"just (started|downloaded|installed|joined|signed up|got|tried)"
        r"|new(ly)? (to spotify|user|subscriber|member)"
        r"|first (time|day|week|month)"
        r"|recently (switched|moved|started|joined)"
        r"|just (got|made|created) (an? )?(account|spotify)"
        r"|beginner|brand new to"
        r")\b",
        re.IGNORECASE,
    )),

    # ── Premium User ──────────────────────────────────────────────────────
    (SEGMENT_PREMIUM, re.compile(
        r"\b("
        r"pay(ing)? for (premium|this|spotify)"
        r"|paid (user|subscriber|member|account)"
        r"|(i |i've |i am |i'm )(been |a )?(paying|premium|subscriber)"
        r"|premium (user|subscriber|member|account|plan|tier)"
        r"|family plan|duo plan|student plan"
        r"|(my |our )premium"
        r"|\$[\d]+(\.[\d]{2})? (a |per )month"
        r"|pay \$|annual (plan|subscription)"
        r")\b",
        re.IGNORECASE,
    )),

    # ── Heavy Listener ────────────────────────────────────────────────────
    (SEGMENT_HEAVY, re.compile(
        r"\b("
        r"(listen|use|play) (music |spotify )?(all day|every day|constantly|non.?stop|24.?7|all the time)"
        r"|(all day|every day|hours (a|per) day|all night) (listening|music)"
        r"|music is (my life|everything|my world)"
        r"|can.?t (live|work|sleep|focus|function) without (spotify|music|it)"
        r"|(use|listen to) spotify (for|during) (work|study|gym|running|commute|everything)"
        r"|[3-9]\d* (songs|tracks|hours) (a|per) day"
        r"|obsessed with (music|spotify)"
        r")\b",
        re.IGNORECASE,
    )),

    # ── Niche Music Listener ──────────────────────────────────────────────
    (SEGMENT_NICHE, re.compile(
        r"\b("
        r"(niche|underground|obscure|indie|local|regional|rare) (music|artist|band|genre|scene)"
        r"|small (artist|band|label)"
        r"|(not|never) (on|in) spotify"
        r"|(my|the) (genre|scene|taste) (is|isn.?t) (not )?(well.?represented|supported|covered)"
        r"|(folk|metal|jazz|classical|ambient|lo.?fi|shoegaze|post.?rock|math.?rock"
        r"|black metal|doom|grindcore|noise|experimental|avant.?garde"
        r"|bossa nova|flamenco|cumbia|afrobeat|qawwali|bhangra|kpop|j.?pop"
        r"|city pop|vaporwave|chiptune|darkwave|synthwave) (music|artist|band|fan)"
        r"|foreign (music|language|artist|song)"
        r"|non.?english (music|song|artist)"
        r"|world music"
        r")\b",
        re.IGNORECASE,
    )),
]

# ---------------------------------------------------------------------------
# Stage 2: Keyword-density fallback scoring
# ---------------------------------------------------------------------------

_SEGMENT_KEYWORDS: Dict[str, List[str]] = {
    SEGMENT_NEW_USER: [
        "new", "just started", "downloaded", "first time", "recently",
        "trying out", "getting used to", "learning",
    ],
    SEGMENT_PREMIUM: [
        "premium", "subscription", "paid", "paying", "family plan",
        "upgrade", "subscriber", "ad-free", "no ads",
    ],
    SEGMENT_HEAVY: [
        "all day", "every day", "constantly", "always listening",
        "hours", "non-stop", "daily", "all the time", "obsessed",
    ],
    SEGMENT_NICHE: [
        "indie", "underground", "obscure", "niche", "local artist",
        "rare", "genre", "unknown", "hidden gem", "lesser known",
        "world music", "foreign",
    ],
    SEGMENT_CASUAL: [
        "sometimes", "occasionally", "now and then", "once in a while",
        "background", "casual", "everyday",
    ],
}


def _keyword_density(text: str, keywords: List[str]) -> float:
    """Return fraction of keywords present in lowercased text."""
    tl = text.lower()
    hits = sum(1 for kw in keywords if kw in tl)
    return hits / max(len(keywords), 1)


# ---------------------------------------------------------------------------
# Core classification logic
# ---------------------------------------------------------------------------

def detect_segment(text: str) -> str:
    """
    Detect the user segment for a single review text.

    Stage 1: Priority rules — evaluated in order, first match wins.
    Stage 2: Keyword-density fallback — highest density wins.
    Default: Casual Listener.
    """
    if not text or not text.strip():
        return SEGMENT_CASUAL

    # Stage 1 — priority regex rules
    for segment, pattern in _PRIORITY_RULES:
        if pattern.search(text):
            return segment

    # Stage 2 — keyword-density fallback
    best_segment = SEGMENT_CASUAL
    best_score = 0.0

    for segment, keywords in _SEGMENT_KEYWORDS.items():
        score = _keyword_density(text, keywords)
        if score > best_score:
            best_score = score
            best_segment = segment

    return best_segment


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def fetch_reviews_for_segmentation(
    skip_segmented: bool = True,
    batch_size: int = FETCH_BATCH_SIZE,
) -> List[Dict[str, Any]]:
    """
    Fetch processed reviews that need segment detection.

    Parameters
    ----------
    skip_segmented : bool
        When True, skip reviews that already have a user_segment set.
        Set False to re-segment everything (idempotent re-run).
    """
    client = get_supabase_client()
    all_reviews: List[Dict[str, Any]] = []
    offset = 0

    logger.info(
        "Fetching reviews for segment detection (skip_segmented=%s)…", skip_segmented
    )

    while True:
        query = (
            client.table("processed_reviews")
            .select("id, raw_review_id, cleaned_text")
            .order("processed_at", desc=False)
            .range(offset, offset + batch_size - 1)
        )
        if skip_segmented:
            query = query.is_("user_segment", "null")

        resp = query.execute()
        batch = resp.data or []
        if not batch:
            break

        all_reviews.extend(batch)
        logger.info("  Fetched %d reviews so far…", len(all_reviews))

        if len(batch) < batch_size:
            break
        offset += batch_size

    logger.info("Total reviews to segment: %d", len(all_reviews))
    return all_reviews


def write_segments_to_supabase(
    segmented_reviews: List[Dict[str, Any]],
    batch_size: int = SUPABASE_BATCH_SIZE,
) -> Tuple[int, int]:
    """
    Batch-upsert user_segment to Supabase processed_reviews.

    Each item in *segmented_reviews* must have keys:
      id, raw_review_id, cleaned_text, user_segment

    Returns (success_count, error_count).
    """
    client = get_supabase_client()
    success_count = 0
    error_count = 0
    total_batches = (len(segmented_reviews) - 1) // batch_size + 1

    for i in range(0, len(segmented_reviews), batch_size):
        batch = segmented_reviews[i : i + batch_size]
        payload = [
            {
                "id": r["id"],
                "raw_review_id": r["raw_review_id"],
                "cleaned_text": r["cleaned_text"],
                "user_segment": r["user_segment"],
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

def run_user_segment_detection(
    skip_segmented: bool = True,
    log_every: int = 5000,
) -> Dict[str, Any]:
    """
    Phase 2.4 orchestration: User Segment Detection.

    Steps
    -----
    1. Fetch reviews from Supabase (optionally skip already-segmented rows).
    2. Run the rule-based + keyword-density pipeline on every review (in-process).
    3. Batch-upsert user_segment back to Supabase processed_reviews.
    4. Return summary statistics.

    Parameters
    ----------
    skip_segmented : bool
        Skip reviews that already have a user_segment value.
        Set False to re-segment all reviews from scratch.
    log_every : int
        Log a progress line every N reviews during detection.
    """
    logger.info("=" * 60)
    logger.info("Phase 2.4: User Segment Detection — START")
    logger.info("=" * 60)

    # 1. Fetch
    reviews = fetch_reviews_for_segmentation(skip_segmented=skip_segmented)
    if not reviews:
        logger.info("No reviews to segment — all already have user_segment labels.")
        return {
            "reviews_segmented": 0,
            "supabase_success": 0,
            "supabase_errors": 0,
            "segment_distribution": {},
        }

    # 2. Detect segments in-process
    logger.info(
        "Detecting segments for %d reviews (rule-based + keyword-density)…",
        len(reviews),
    )
    segmented: List[Dict[str, Any]] = []
    segment_counts: Dict[str, int] = {s: 0 for s in ALL_SEGMENTS}

    for idx, review in enumerate(reviews, 1):
        text = review.get("cleaned_text", "") or ""
        segment = detect_segment(text)

        segmented.append({**review, "user_segment": segment})
        segment_counts[segment] = segment_counts.get(segment, 0) + 1

        if idx % log_every == 0:
            logger.info(
                "  Segmented %d/%d reviews (%.1f%%)…",
                idx, len(reviews), 100 * idx / len(reviews),
            )

    logger.info("Detection complete. Segment distribution: %s", segment_counts)

    # 3. Write back to Supabase
    logger.info("Writing user segments to Supabase…")
    success, errors = write_segments_to_supabase(segmented)

    summary: Dict[str, Any] = {
        "reviews_segmented": len(segmented),
        "supabase_success": success,
        "supabase_errors": errors,
        "segment_distribution": segment_counts,
    }

    logger.info("=" * 60)
    logger.info("Phase 2.4 complete:")
    logger.info("  Reviews segmented  : %d", summary["reviews_segmented"])
    logger.info("  Supabase success   : %d", summary["supabase_success"])
    logger.info("  Supabase errors    : %d", summary["supabase_errors"])
    logger.info("  Segment distribution:")
    for seg, count in sorted(summary["segment_distribution"].items(), key=lambda x: -x[1]):
        pct = 100 * count / max(len(segmented), 1)
        logger.info("    %-25s %6d  (%.1f%%)", seg, count, pct)
    logger.info("=" * 60)

    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Phase 2.4 — User Segment Detection (rule-based + keyword-density)"
    )
    parser.add_argument(
        "--resegment-all",
        action="store_true",
        help="Re-segment all reviews, even those already segmented (idempotent).",
    )
    args = parser.parse_args()

    result = run_user_segment_detection(skip_segmented=not args.resegment_all)

    print("\n--- Phase 2.4 Summary ---")
    for k, v in result.items():
        print(f"  {k}: {v}")
