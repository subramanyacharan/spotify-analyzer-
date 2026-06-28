"""
Phase 2.2: Theme Classification

Cluster-level theme assignment using a 3-stage hybrid pipeline:

  Stage 1 — Keyword mapping
    Extract representative review texts for each cluster. Score each theme
    from THEME_TAXONOMY against the cluster's vocabulary using TF-IDF keyword
    overlap with a per-theme keyword dictionary.

  Stage 2 — Zero-shot NLI classification (fallback / tie-break)
    For clusters where keyword scoring is ambiguous, run a Hugging Face
    zero-shot pipeline (facebook/bart-large-mnli) against the top-N
    representative reviews and vote.

  Stage 3 — Propagation
    Assign the winning theme list to every review in the cluster and batch-
    upsert the `themes` column of Supabase `processed_reviews`.

Design goals
------------
- Zero LLM API calls (fully local, free)
- Idempotent — re-running overwrites existing theme assignments
- Compatible with Phase 4 reporting (themes stored as JSONB array in Supabase)
- Compatible with existing THEME_TAXONOMY from prompts.py
"""

import logging
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv
load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase2_analysis.prompts import GENERAL_APP_THEME, LEGACY_GENERAL_THEME, THEME_TAXONOMY

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FETCH_BATCH_SIZE = 1000
SUPABASE_BATCH_SIZE = 500

# How many representative reviews to pull per cluster for classification
REPRESENTATIVE_SAMPLE_SIZE = 100

# Minimum keyword-score gap to accept keyword result without zero-shot fallback
# Set low so zero-shot always runs (keyword alone is too generic for short reviews)
KEYWORD_CONFIDENCE_THRESHOLD = 0.99

# Zero-shot model — runs locally via transformers pipeline.
# cross-encoder/nli-MiniLM2-L6-H768 is 84 MB (vs 1.63 GB for bart-large-mnli)
# and perfectly adequate for 7-class theme discrimination.
ZS_MODEL = "cross-encoder/nli-MiniLM2-L6-H768"

# Keyword dictionary: maps each theme to its signal words/phrases.
# These were chosen to reflect Spotify discovery language.
THEME_KEYWORDS: Dict[str, List[str]] = {
    "Repetitive Recommendations": [
        "same songs", "same artists", "same music", "over and over",
        "always the same", "repetitive", "repeat", "again and again",
        "keeps recommending", "keeps suggesting", "stuck", "nothing new",
        "same playlist", "same tracks", "same recommendations",
    ],
    "Discover Weekly Issues": [
        "discover weekly", "discovery weekly", "weekly mix", "release radar",
        "weekly playlist", "discover weekly stopped", "discover weekly broken",
        "discover weekly sucks", "discover weekly useless", "monday playlist",
    ],
    "Niche Music Gap": [
        "niche", "underground", "indie", "obscure", "local artist",
        "small artist", "local band", "regional music", "rare music",
        "genre not supported", "my genre", "not mainstream", "non mainstream",
        "folk", "metal", "classical", "jazz", "world music", "ethnic music",
        "language", "foreign music", "not in english",
    ],
    "Playlist Fatigue": [
        "tired of", "bored", "sick of", "playlist fatigue", "stale",
        "old playlist", "same playlist", "refresh playlist", "update playlist",
        "playlist never changes", "no variety", "lacks variety",
        "no diversity", "monotonous", "stagnant", "boring",
    ],
    "Algorithm Bias": [
        "algorithm", "bias", "biased", "mainstream", "popular only",
        "only shows popular", "only popular", "chart music", "top 40",
        "ignores", "ignores my taste", "doesn't learn", "doesn't understand",
        "not personalized", "generic", "push popular", "favors", "favouring",
    ],
    "Recommendation Quality": [
        "recommendation", "suggest", "suggested", "recommend",
        "bad recommendation", "wrong recommendation", "irrelevant",
        "off", "doesn't match", "not my taste", "doesn't know my taste",
        "terrible recommendation", "poor recommendation", "suggestion",
        "radio", "daily mix", "for you",
    ],
    "Search & Discovery UX": [
        "search", "can't find", "cannot find", "hard to find", "search bar",
        "search doesn't work", "search broken", "no results", "wrong results",
        "search result", "explore", "browse", "navigation", "filter",
        "hard to navigate", "ui", "ux", "interface", "discover",
        "can't search", "search sucks",
    ],
    GENERAL_APP_THEME: [
        "crash", "bug", "glitch", "freeze", "loading", "slow", "battery",
        "subscription", "billing", "payment", "premium", "ads", "advert",
        "advertisement", "podcast", "login", "sign in", "account",
        "storage", "download", "offline", "data", "wifi",
    ],
}


# ---------------------------------------------------------------------------
# Stage 1: Keyword scoring
# ---------------------------------------------------------------------------

def _keyword_score(text: str, keywords: List[str]) -> float:
    """Count how many keyword phrases appear in lowercased text, normalised by total keywords."""
    text_lower = text.lower()
    hits = sum(1 for kw in keywords if kw in text_lower)
    return hits / max(len(keywords), 1)


def classify_cluster_by_keywords(
    representative_texts: List[str],
) -> List[Tuple[str, float]]:
    """
    Score each theme against a set of representative review texts.

    Returns a list of (theme, score) sorted descending by score.
    Score = mean keyword-hit rate across all representative texts.
    """
    theme_scores: Dict[str, float] = {}

    for theme in THEME_TAXONOMY:
        kws = THEME_KEYWORDS.get(theme, [])
        if not kws:
            theme_scores[theme] = 0.0
            continue
        scores = [_keyword_score(t, kws) for t in representative_texts]
        theme_scores[theme] = sum(scores) / len(scores) if scores else 0.0

    return sorted(theme_scores.items(), key=lambda x: x[1], reverse=True)


def _pick_themes_from_scores(
    scored_themes: List[Tuple[str, float]],
    top_n: int = 2,
) -> List[str]:
    """
    Pick the top themes from keyword scores.

    Rules:
    - Always include the top-scoring theme.
    - Include additional themes if their score is within 30% of the top score
      and the top score is meaningful (> 0.01).
    - Hard cap at top_n themes.
    - Fall back to GENERAL_APP_THEME only if top score is effectively 0.
    """
    if not scored_themes or scored_themes[0][1] < 0.001:
        return [GENERAL_APP_THEME]

    top_score = scored_themes[0][1]
    threshold = top_score * 0.70  # within 30% of top

    selected = []
    for theme, score in scored_themes[:top_n * 2]:  # look at more candidates
        if score >= threshold and len(selected) < top_n:
            selected.append(theme)

    return selected or [GENERAL_APP_THEME]


# ---------------------------------------------------------------------------
# Stage 2: Zero-shot NLI fallback
# ---------------------------------------------------------------------------

_zs_pipeline = None  # lazy singleton


def _get_zs_pipeline():
    """Lazy-load the zero-shot classification pipeline."""
    global _zs_pipeline
    if _zs_pipeline is None:
        from transformers import pipeline
        logger.info("Loading zero-shot classification model '%s'…", ZS_MODEL)
        # MiniLM NLI cross-encoder is exposed as zero-shot-classification
        # by wrapping it in the standard HF pipeline with the right model
        _zs_pipeline = pipeline(
            "zero-shot-classification",
            model=ZS_MODEL,
            device=-1,  # CPU
        )
        logger.info("Zero-shot model loaded.")
    return _zs_pipeline


def classify_cluster_zero_shot(
    representative_texts: List[str],
    candidate_themes: Optional[List[str]] = None,
) -> List[Tuple[str, float]]:
    """
    Run zero-shot NLI on representative cluster reviews and return
    (theme, score) sorted descending.
    """
    zs = _get_zs_pipeline()
    labels = candidate_themes or [
        t for t in THEME_TAXONOMY if t not in (GENERAL_APP_THEME, LEGACY_GENERAL_THEME)
    ]

    # Run NLI per review, then average scores across reviews for each label
    theme_score_accum: Dict[str, float] = defaultdict(float)
    count = 0

    for text in representative_texts[:20]:  # cap at 20 to keep it fast
        try:
            result = zs(text[:256], candidate_labels=labels, multi_label=True)
            for label, score in zip(result["labels"], result["scores"]):
                theme_score_accum[label] += score
            count += 1
        except Exception as exc:
            logger.warning("Zero-shot failed for one review: %s", exc)

    if count == 0:
        return []

    # Average and sort
    averaged = [(theme, theme_score_accum[theme] / count) for theme in labels]
    return sorted(averaged, key=lambda x: x[1], reverse=True)


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def fetch_cluster_reviews(
    cluster_id: int,
    limit: int = REPRESENTATIVE_SAMPLE_SIZE,
) -> List[Dict[str, Any]]:
    """Fetch a sample of reviews for a given cluster_id."""
    client = get_supabase_client()
    resp = (
        client.table("processed_reviews")
        .select("id, raw_review_id, cleaned_text, cluster_id")
        .eq("cluster_id", cluster_id)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def fetch_all_reviews_for_cluster(cluster_id: int) -> List[Dict[str, Any]]:
    """Fetch ALL reviews for a cluster in pages (needed for propagation)."""
    client = get_supabase_client()
    all_reviews: List[Dict[str, Any]] = []
    offset = 0

    while True:
        resp = (
            client.table("processed_reviews")
            .select("id, raw_review_id, cleaned_text, cluster_id")
            .eq("cluster_id", cluster_id)
            .range(offset, offset + FETCH_BATCH_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        all_reviews.extend(batch)
        if len(batch) < FETCH_BATCH_SIZE:
            break
        offset += FETCH_BATCH_SIZE

    return all_reviews


def get_distinct_cluster_ids() -> List[int]:
    """Return the list of distinct cluster_ids present in processed_reviews."""
    client = get_supabase_client()
    # Fetch a large page and collect unique values (Supabase REST doesn't support DISTINCT natively)
    all_ids = set()
    offset = 0
    while True:
        resp = (
            client.table("processed_reviews")
            .select("cluster_id")
            .range(offset, offset + FETCH_BATCH_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for r in batch:
            if r["cluster_id"] is not None:
                all_ids.add(r["cluster_id"])
        if len(batch) < FETCH_BATCH_SIZE:
            break
        offset += FETCH_BATCH_SIZE
    return sorted(all_ids)


def propagate_themes_to_supabase(
    reviews: List[Dict[str, Any]],
    themes: List[str],
    batch_size: int = SUPABASE_BATCH_SIZE,
) -> Tuple[int, int]:
    """
    Upsert theme labels for a list of reviews to Supabase processed_reviews.

    Returns (success_count, error_count).
    """
    client = get_supabase_client()
    success_count = 0
    error_count = 0

    for i in range(0, len(reviews), batch_size):
        batch = reviews[i : i + batch_size]
        payload = [
            {
                "id": r["id"],
                "raw_review_id": r["raw_review_id"],
                "cleaned_text": r["cleaned_text"],
                "cluster_id": r["cluster_id"],
                "themes": themes,
            }
            for r in batch
        ]
        try:
            client.table("processed_reviews").upsert(payload, on_conflict="id").execute()
            success_count += len(batch)
        except Exception as exc:
            logger.error("Theme upsert batch %d failed: %s", i // batch_size + 1, exc)
            error_count += len(batch)

    return success_count, error_count


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def classify_and_propagate_cluster(
    cluster_id: int,
    use_zero_shot_fallback: bool = True,
) -> Dict[str, Any]:
    """
    Classify a single cluster and propagate themes to all its reviews.

    Returns a dict with cluster_id, assigned_themes, method_used, review_count.
    """
    logger.info("Processing cluster %d…", cluster_id)

    # Fetch representative sample for classification
    sample_reviews = fetch_cluster_reviews(cluster_id, limit=REPRESENTATIVE_SAMPLE_SIZE)
    if not sample_reviews:
        logger.warning("Cluster %d has no reviews — skipping.", cluster_id)
        return {"cluster_id": cluster_id, "assigned_themes": [], "review_count": 0}

    texts = [r["cleaned_text"] for r in sample_reviews]

    # Stage 1: Keyword scoring
    keyword_scores = classify_cluster_by_keywords(texts)
    top_score = keyword_scores[0][1] if keyword_scores else 0.0
    second_score = keyword_scores[1][1] if len(keyword_scores) > 1 else 0.0
    gap = top_score - second_score
    method_used = "keyword"

    logger.info(
        "  Cluster %d keyword scores — top: %s=%.4f, 2nd: %s=%.4f, gap=%.4f",
        cluster_id,
        keyword_scores[0][0] if keyword_scores else "?",
        top_score,
        keyword_scores[1][0] if len(keyword_scores) > 1 else "?",
        second_score,
        gap,
    )

    if use_zero_shot_fallback and (top_score < 0.01 or gap < KEYWORD_CONFIDENCE_THRESHOLD):
        # Ambiguous — run zero-shot NLI
        logger.info("  Cluster %d: keyword ambiguous, running zero-shot NLI…", cluster_id)
        zs_scores = classify_cluster_zero_shot(texts)
        if zs_scores:
            # Merge: average keyword + zero-shot scores (normalised)
            kw_dict = dict(keyword_scores)
            zs_dict = dict(zs_scores)
            merged: Dict[str, float] = {}
            for theme in THEME_TAXONOMY:
                kw = kw_dict.get(theme, 0.0)
                zs = zs_dict.get(theme, 0.0)
                merged[theme] = (kw + zs) / 2.0
            combined_scores = sorted(merged.items(), key=lambda x: x[1], reverse=True)
            themes = _pick_themes_from_scores(combined_scores)
            method_used = "keyword+zero-shot"
            logger.info(
                "  Cluster %d zero-shot top: %s=%.4f",
                cluster_id,
                zs_scores[0][0] if zs_scores else "?",
                zs_scores[0][1] if zs_scores else 0.0,
            )
        else:
            themes = _pick_themes_from_scores(keyword_scores)
    else:
        themes = _pick_themes_from_scores(keyword_scores)

    logger.info("  Cluster %d → themes: %s (method: %s)", cluster_id, themes, method_used)

    # Fetch ALL reviews in this cluster for propagation
    all_cluster_reviews = fetch_all_reviews_for_cluster(cluster_id)
    review_count = len(all_cluster_reviews)
    logger.info("  Propagating themes to %d reviews in cluster %d…", review_count, cluster_id)

    success, errors = propagate_themes_to_supabase(all_cluster_reviews, themes)
    logger.info(
        "  Cluster %d propagation done — success: %d, errors: %d", cluster_id, success, errors
    )

    return {
        "cluster_id": cluster_id,
        "assigned_themes": themes,
        "method_used": method_used,
        "review_count": review_count,
        "supabase_success": success,
        "supabase_errors": errors,
    }


def run_theme_classification_v2(
    use_zero_shot_fallback: bool = True,
    cluster_ids: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """
    Phase 2.2 orchestration: Cluster-Level Theme Classification & Propagation.

    Steps
    -----
    1. Discover all distinct cluster_ids in processed_reviews.
    2. For each cluster:
       a. Sample representative reviews.
       b. Score themes via keyword mapping (Stage 1).
       c. If ambiguous, run zero-shot NLI (Stage 2).
       d. Propagate winning theme(s) to ALL reviews in cluster (Stage 3).
    3. Return summary statistics.

    Parameters
    ----------
    use_zero_shot_fallback : bool
        Whether to run zero-shot NLI when keyword scoring is ambiguous.
        Set False for a fast keyword-only run (quicker but less accurate).
    cluster_ids : list[int] | None
        Specific clusters to process. If None, all clusters are processed.
    """
    logger.info("=" * 60)
    logger.info("Phase 2.2: Theme Classification — START")
    logger.info("=" * 60)

    # Discover clusters
    if cluster_ids is None:
        logger.info("Discovering cluster IDs from Supabase…")
        cluster_ids = get_distinct_cluster_ids()

    logger.info("Found %d clusters to classify: %s", len(cluster_ids), cluster_ids)

    cluster_results: List[Dict[str, Any]] = []
    total_reviews_tagged = 0
    total_errors = 0

    for cid in cluster_ids:
        result = classify_and_propagate_cluster(
            cluster_id=cid,
            use_zero_shot_fallback=use_zero_shot_fallback,
        )
        cluster_results.append(result)
        total_reviews_tagged += result.get("supabase_success", 0)
        total_errors += result.get("supabase_errors", 0)

    # Build summary
    theme_map = {r["cluster_id"]: r["assigned_themes"] for r in cluster_results}

    summary: Dict[str, Any] = {
        "clusters_processed": len(cluster_results),
        "total_reviews_tagged": total_reviews_tagged,
        "total_errors": total_errors,
        "cluster_theme_map": theme_map,
    }

    logger.info("=" * 60)
    logger.info("Phase 2.2 complete:")
    logger.info("  Clusters processed : %d", summary["clusters_processed"])
    logger.info("  Reviews tagged     : %d", summary["total_reviews_tagged"])
    logger.info("  Errors             : %d", summary["total_errors"])
    logger.info("  Theme assignments  :")
    for cid, themes in sorted(theme_map.items()):
        logger.info("    Cluster %d → %s", cid, themes)
    logger.info("=" * 60)

    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.2 — Theme Classification")
    parser.add_argument(
        "--no-zero-shot",
        action="store_true",
        help="Skip zero-shot NLI fallback (keyword-only, faster).",
    )
    parser.add_argument(
        "--clusters",
        nargs="+",
        type=int,
        default=None,
        help="Specific cluster IDs to process (default: all).",
    )
    args = parser.parse_args()

    result = run_theme_classification_v2(
        use_zero_shot_fallback=not args.no_zero_shot,
        cluster_ids=args.clusters,
    )
    print("\n--- Phase 2.2 Summary ---")
    for k, v in result.items():
        print(f"  {k}: {v}")
