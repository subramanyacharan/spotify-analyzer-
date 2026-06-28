"""
Phase 2.5: Cluster-Level LLM Insight Generation

Sends one LLM call per cluster (5 total) instead of one per review, reducing
LLM usage by ~90-98%. Each call receives:
  - The cluster's assigned themes
  - Dominant sentiment statistics
  - Top user segments
  - 15 representative negative/neutral review samples (most signal-rich)

The LLM (Groq llama-3.3-70b-versatile) returns structured JSON containing:
  pain_point                 — primary complaint or issue
  severity                   — 1-5 impact level
  feature_request            — concrete improvement suggestion
  representative_user_quotes — list of 3 verbatim user quotes
  product_opportunity        — actionable business opportunity

Outputs written to Supabase
----------------------------
  cluster_insights table     — one row per cluster (full structured insight)
  processed_reviews.pain_points — propagated back to every review in the cluster
                                  as a JSONB array with the cluster's pain_point

Design goals
------------
- Exactly N_CLUSTERS LLM calls (default 5)
- Idempotent — re-running upserts on cluster_id conflict
- Retry with exponential backoff on Groq rate limits / transient errors
- Graceful degradation — if one cluster fails, others still complete
- Compatible with Phase 4 reporting (cluster_insights is the source for
  opportunity scoring; pain_points on processed_reviews feeds the dashboard)
"""

import json
import logging
import os
import sys
import time
from collections import Counter
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv
load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase2_analysis.llm_client import get_groq_client, get_model_name

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FETCH_BATCH_SIZE = 1000
SUPABASE_BATCH_SIZE = 500

# Number of representative reviews sent to the LLM per cluster
# Prioritises negative/neutral reviews (highest signal for pain points)
SAMPLE_SIZE = 15

# LLM retry settings
MAX_RETRIES = 4
RETRY_BASE_DELAY = 5   # seconds; doubles on each retry
RATE_LIMIT_DELAY = 65  # seconds to wait after HTTP 429

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

INSIGHT_SYSTEM_PROMPT = """\
You are a senior product analyst at Spotify's Growth Team.
Analyse a batch of user reviews from a single semantic cluster and extract
structured product insights. Respond with valid JSON only — no prose, no markdown.
"""

INSIGHT_USER_TEMPLATE = """\
CLUSTER CONTEXT
===============
Cluster ID      : {cluster_id}
Themes          : {themes}
Review count    : {review_count}
Sentiment mix   : {sentiment_summary}
Top user segments: {top_segments}

REPRESENTATIVE USER REVIEWS (most negative/neutral — highest signal)
=====================================================================
{review_samples}

TASK
====
Extract the following fields and return them as a single JSON object.
Use exact field names. All fields are required.

{{
  "pain_point": "<one sentence — the primary discovery-related complaint>",
  "severity": <integer 1-5, where 5 = most severe>,
  "feature_request": "<one concrete product improvement users are asking for>",
  "representative_user_quotes": [
    "<verbatim quote from review 1>",
    "<verbatim quote from review 2>",
    "<verbatim quote from review 3>"
  ],
  "product_opportunity": "<one sentence — the business opportunity this cluster reveals>"
}}

Rules:
- pain_point and feature_request must relate to music discovery, not generic bugs/billing.
- representative_user_quotes must be copied verbatim from the reviews above (max 120 chars each).
- severity 5 = widespread problem blocking core use case; 1 = minor annoyance.
- product_opportunity should be framed as an action Spotify's team could take.
"""

# ---------------------------------------------------------------------------
# Supabase data helpers
# ---------------------------------------------------------------------------

def get_distinct_cluster_ids() -> List[int]:
    """Return sorted list of cluster IDs present in processed_reviews."""
    client = get_supabase_client()
    seen: set = set()
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
                seen.add(r["cluster_id"])
        if len(batch) < FETCH_BATCH_SIZE:
            break
        offset += FETCH_BATCH_SIZE
    return sorted(seen)


def fetch_cluster_data(cluster_id: int) -> Dict[str, Any]:
    """
    Fetch all data needed to build the LLM prompt for one cluster.

    Returns a dict with:
      reviews          — list of all review dicts (id, cleaned_text, sentiment_label,
                         sentiment_score, user_segment)
      themes           — list[str] (taken from first row)
      sentiment_counts — Counter of label → count
      segment_counts   — Counter of segment → count
    """
    client = get_supabase_client()
    all_reviews: List[Dict[str, Any]] = []
    offset = 0
    themes: List[str] = []

    while True:
        resp = (
            client.table("processed_reviews")
            .select(
                "id, raw_review_id, cleaned_text, themes, "
                "sentiment_label, sentiment_score, user_segment"
            )
            .eq("cluster_id", cluster_id)
            .range(offset, offset + FETCH_BATCH_SIZE - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break

        # Grab themes from the first row that has them
        if not themes:
            for r in batch:
                t = r.get("themes") or []
                if t:
                    themes = t if isinstance(t, list) else json.loads(t)
                    break

        all_reviews.extend(batch)
        if len(batch) < FETCH_BATCH_SIZE:
            break
        offset += FETCH_BATCH_SIZE

    sentiment_counts = Counter(
        r.get("sentiment_label", "unknown") for r in all_reviews
    )
    segment_counts = Counter(
        r.get("user_segment", "Unknown") for r in all_reviews
    )

    return {
        "reviews": all_reviews,
        "themes": themes,
        "sentiment_counts": sentiment_counts,
        "segment_counts": segment_counts,
    }


def select_representative_samples(
    reviews: List[Dict[str, Any]],
    n: int = SAMPLE_SIZE,
) -> List[Dict[str, Any]]:
    """
    Pick the most signal-rich reviews for the LLM prompt.

    Priority order:
      1. Negative reviews (sentiment_score 1-2) — most pain signal
      2. Neutral reviews (sentiment_score 3)
      3. Positive reviews (only if we still need to fill the quota)

    Within each group, prefer longer reviews (more detail).
    """
    def sort_key(r: Dict[str, Any]) -> Tuple[int, int]:
        score = r.get("sentiment_score") or 3
        # Lower score → higher priority (more negative first)
        priority = score  # 1=best, 5=worst for pain extraction
        length = -len(r.get("cleaned_text") or "")  # longer first
        return (priority, length)

    sorted_reviews = sorted(reviews, key=sort_key)
    return sorted_reviews[:n]


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def build_prompt(
    cluster_id: int,
    themes: List[str],
    review_count: int,
    sentiment_counts: Counter,
    segment_counts: Counter,
    samples: List[Dict[str, Any]],
) -> str:
    """Build the user prompt for one cluster."""
    total = sum(sentiment_counts.values()) or 1
    sentiment_summary = ", ".join(
        f"{label}: {count} ({100*count//total}%)"
        for label, count in sorted(sentiment_counts.items(), key=lambda x: -x[1])
    )

    top_segs = ", ".join(
        f"{seg} ({cnt})"
        for seg, cnt in segment_counts.most_common(3)
    )

    review_lines = []
    for i, r in enumerate(samples, 1):
        text = (r.get("cleaned_text") or "").strip()
        label = r.get("sentiment_label", "?")
        score = r.get("sentiment_score", "?")
        review_lines.append(f'[{i}] ({label}, score={score}) "{text}"')

    return INSIGHT_USER_TEMPLATE.format(
        cluster_id=cluster_id,
        themes=", ".join(themes) if themes else "Unknown",
        review_count=review_count,
        sentiment_summary=sentiment_summary,
        top_segments=top_segs or "Unknown",
        review_samples="\n\n".join(review_lines),
    )


# ---------------------------------------------------------------------------
# LLM call with retry
# ---------------------------------------------------------------------------

def call_llm_with_retry(
    system_prompt: str,
    user_prompt: str,
    model: str,
    client,
) -> Dict[str, Any]:
    """
    Call Groq with retry / backoff for rate limits and transient errors.

    Returns the parsed JSON dict from the LLM response.
    Raises RuntimeError after MAX_RETRIES exhausted.
    """
    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            raw = response.choices[0].message.content or "{}"
            parsed = json.loads(raw)
            return parsed

        except Exception as exc:
            last_error = exc
            err_str = str(exc)

            if "429" in err_str or "rate_limit" in err_str.lower():
                logger.warning(
                    "Rate limit hit on attempt %d/%d — waiting %ds…",
                    attempt, MAX_RETRIES, RATE_LIMIT_DELAY,
                )
                time.sleep(RATE_LIMIT_DELAY)
            else:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    "LLM call failed attempt %d/%d: %s — retrying in %ds…",
                    attempt, MAX_RETRIES, exc, delay,
                )
                time.sleep(delay)

    raise RuntimeError(
        f"LLM call failed after {MAX_RETRIES} attempts: {last_error}"
    )


def _build_fallback_insight(
    themes: List[str],
    samples: List[Dict[str, Any]],
    sentiment_counts: Counter,
) -> Dict[str, Any]:
    """User-facing fallback when the LLM call fails — never expose pipeline jargon."""
    theme_list = [t for t in themes if t][:3]
    theme_text = ", ".join(theme_list) if theme_list else "the product experience"

    pain_point = f"Users frequently mention issues related to {theme_text}."

    total = sum(sentiment_counts.values()) or 1
    negative = sentiment_counts.get("negative", 0)
    severity = min(5, max(2, 2 + int(3 * negative / total)))

    quotes: List[str] = []
    for review in samples:
        text = (review.get("cleaned_text") or "").strip()
        if text:
            quotes.append(text[:120])
        if len(quotes) >= 3:
            break
    while len(quotes) < 3:
        quotes.append("")

    primary_theme = theme_list[0] if theme_list else "this area"
    feature_request = f"Improve {primary_theme.lower()} based on recurring user feedback."
    product_opportunity = f"Address feedback about {theme_text} to reduce friction for affected users."

    return {
        "pain_point": pain_point,
        "severity": severity,
        "feature_request": feature_request,
        "representative_user_quotes": quotes,
        "product_opportunity": product_opportunity,
    }


# ---------------------------------------------------------------------------
# Validate and normalise the LLM response
# ---------------------------------------------------------------------------

def _validate_insight(raw: Dict[str, Any], cluster_id: int) -> Dict[str, Any]:
    """
    Validate the LLM JSON response and fill any missing fields with safe defaults.
    """
    pain_point = str(raw.get("pain_point") or "No clear pain point identified")
    severity = int(raw.get("severity") or 3)
    severity = max(1, min(5, severity))  # clamp to [1, 5]
    feature_request = str(
        raw.get("feature_request") or "No specific feature request identified"
    )
    quotes = raw.get("representative_user_quotes") or []
    if not isinstance(quotes, list):
        quotes = [str(quotes)]
    quotes = [str(q)[:120] for q in quotes[:3]]  # max 3 quotes, max 120 chars each
    while len(quotes) < 3:
        quotes.append("")

    product_opportunity = str(
        raw.get("product_opportunity") or "Opportunity not specified"
    )

    return {
        "pain_point": pain_point,
        "severity": severity,
        "feature_request": feature_request,
        "representative_user_quotes": quotes,
        "product_opportunity": product_opportunity,
    }


# ---------------------------------------------------------------------------
# Supabase write-back
# ---------------------------------------------------------------------------

def upsert_cluster_insight(
    cluster_id: int,
    themes: List[str],
    review_count: int,
    dominant_sentiment: str,
    top_segments: List[str],
    insight: Dict[str, Any],
) -> bool:
    """Upsert one row to cluster_insights. Returns True on success."""
    client = get_supabase_client()
    payload = {
        "cluster_id": cluster_id,
        "themes": themes,
        "pain_point": insight["pain_point"],
        "severity": insight["severity"],
        "feature_request": insight["feature_request"],
        "representative_user_quotes": insight["representative_user_quotes"],
        "product_opportunity": insight["product_opportunity"],
        "review_count": review_count,
        "dominant_sentiment": dominant_sentiment,
        "top_segments": top_segments,
    }
    try:
        client.table("cluster_insights").upsert(
            payload, on_conflict="cluster_id"
        ).execute()
        return True
    except Exception as exc:
        logger.error("Failed to upsert cluster_insights for cluster %d: %s", cluster_id, exc)
        return False


def propagate_pain_points_to_reviews(
    reviews: List[Dict[str, Any]],
    pain_point: str,
    batch_size: int = SUPABASE_BATCH_SIZE,
) -> Tuple[int, int]:
    """
    Write the cluster's pain_point back to every review's pain_points JSONB column.

    Stores as [{"source": "cluster_llm", "pain_point": "<text>"}] so it's
    extensible for future per-review enrichment.
    """
    client = get_supabase_client()
    pain_points_value = [{"source": "cluster_llm", "pain_point": pain_point}]
    success_count = 0
    error_count = 0
    total_batches = (len(reviews) - 1) // batch_size + 1

    for i in range(0, len(reviews), batch_size):
        batch = reviews[i : i + batch_size]
        payload = [
            {
                "id": r["id"],
                "raw_review_id": r["raw_review_id"],
                "cleaned_text": r["cleaned_text"],
                "pain_points": pain_points_value,
            }
            for r in batch
        ]
        try:
            client.table("processed_reviews").upsert(
                payload, on_conflict="id"
            ).execute()
            success_count += len(batch)
            logger.info(
                "  pain_points batch %d/%d — %d rows.",
                i // batch_size + 1,
                total_batches,
                len(batch),
            )
        except Exception as exc:
            logger.error(
                "  pain_points batch %d/%d failed: %s",
                i // batch_size + 1,
                total_batches,
                exc,
            )
            error_count += len(batch)

    return success_count, error_count


def build_weekly_pulse_markdown(cluster_results: List[Dict[str, Any]]) -> str:
    """Build a markdown pulse report from cluster-level insights."""
    lines = [
        "# Weekly Discovery Pulse — Cluster Insights",
        "",
        f"Generated from **{len(cluster_results)}** semantic clusters.",
        "",
    ]

    sorted_clusters = sorted(cluster_results, key=lambda r: r.get("severity", 0), reverse=True)
    for cluster in sorted_clusters:
        lines.extend([
            f"## Cluster {cluster['cluster_id']} (Severity {cluster['severity']}/5)",
            "",
            f"**Themes:** {', '.join(cluster.get('themes') or [])}",
            f"**Reviews:** {cluster.get('review_count', 0):,}",
            "",
            f"**Pain point:** {cluster['pain_point']}",
            "",
            f"**Feature request:** {cluster.get('feature_request', 'N/A')}",
            "",
            f"**Product opportunity:** {cluster['product_opportunity']}",
            "",
            "**Representative quotes:**",
        ])
        for quote in cluster.get("representative_user_quotes") or []:
            if quote:
                lines.append(f"- \"{quote}\"")
        lines.append("")

    return "\n".join(lines).strip()


def save_weekly_insights(cluster_results: List[Dict[str, Any]]) -> bool:
    """Store aggregated cluster insights in weekly_insights for Phase 4 reporting."""
    if not cluster_results:
        return False

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    theme_counts: Counter = Counter()
    for cluster in cluster_results:
        for theme in cluster.get("themes") or []:
            theme_counts[theme] += cluster.get("review_count", 0)

    top_themes = [
        {"theme": theme, "mention_count": count}
        for theme, count in theme_counts.most_common(10)
    ]

    payload = {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "top_themes": top_themes,
        "pulse_report_md": build_weekly_pulse_markdown(cluster_results),
    }

    client = get_supabase_client()
    try:
        client.table("weekly_insights").insert(payload).execute()
        logger.info(
            "Saved weekly_insights pulse report (%s to %s).",
            week_start,
            week_end,
        )
        return True
    except Exception as exc:
        logger.error("Failed to save weekly_insights: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Per-cluster orchestration
# ---------------------------------------------------------------------------

def process_cluster(
    cluster_id: int,
    groq_client,
    model: str,
) -> Dict[str, Any]:
    """
    Run the full Phase 2.5 pipeline for one cluster.

    1. Fetch all reviews + metadata for the cluster.
    2. Select 15 most signal-rich samples.
    3. Build LLM prompt.
    4. Call Groq LLM, parse and validate response.
    5. Upsert to cluster_insights.
    6. Propagate pain_point to all reviews in the cluster.

    Returns a result dict for the summary.
    """
    logger.info("─" * 50)
    logger.info("Processing cluster %d…", cluster_id)

    # 1. Fetch
    data = fetch_cluster_data(cluster_id)
    reviews = data["reviews"]
    themes = data["themes"]
    sentiment_counts = data["sentiment_counts"]
    segment_counts = data["segment_counts"]
    review_count = len(reviews)

    logger.info(
        "  Cluster %d: %d reviews | themes=%s | sentiment=%s",
        cluster_id, review_count, themes,
        dict(sentiment_counts),
    )

    # 2. Select samples
    samples = select_representative_samples(reviews, n=SAMPLE_SIZE)

    # 3. Build prompt
    user_prompt = build_prompt(
        cluster_id=cluster_id,
        themes=themes,
        review_count=review_count,
        sentiment_counts=sentiment_counts,
        segment_counts=segment_counts,
        samples=samples,
    )

    # 4. LLM call
    logger.info("  Calling Groq LLM for cluster %d…", cluster_id)
    try:
        raw_insight = call_llm_with_retry(
            system_prompt=INSIGHT_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            model=model,
            client=groq_client,
        )
        insight = _validate_insight(raw_insight, cluster_id)
    except RuntimeError as exc:
        logger.error("  Cluster %d LLM call failed: %s — using theme-based fallback.", cluster_id, exc)
        insight = _build_fallback_insight(themes, samples, sentiment_counts)

    logger.info("  Cluster %d insight: pain=%s | severity=%d",
                cluster_id, insight["pain_point"][:80], insight["severity"])

    # 5. Write to cluster_insights
    dominant_sentiment = sentiment_counts.most_common(1)[0][0] if sentiment_counts else "unknown"
    top_segments = [seg for seg, _ in segment_counts.most_common(3)]

    ci_ok = upsert_cluster_insight(
        cluster_id=cluster_id,
        themes=themes,
        review_count=review_count,
        dominant_sentiment=dominant_sentiment,
        top_segments=top_segments,
        insight=insight,
    )
    logger.info("  cluster_insights upsert: %s", "OK" if ci_ok else "FAILED")

    # 6. Propagate pain_points to all reviews
    logger.info(
        "  Propagating pain_point to %d reviews in cluster %d…",
        review_count, cluster_id,
    )
    pp_success, pp_errors = propagate_pain_points_to_reviews(
        reviews, insight["pain_point"]
    )
    logger.info(
        "  pain_points propagation — success: %d, errors: %d",
        pp_success, pp_errors,
    )

    return {
        "cluster_id": cluster_id,
        "review_count": review_count,
        "themes": themes,
        "pain_point": insight["pain_point"],
        "severity": insight["severity"],
        "feature_request": insight["feature_request"],
        "product_opportunity": insight["product_opportunity"],
        "representative_user_quotes": insight["representative_user_quotes"],
        "dominant_sentiment": dominant_sentiment,
        "top_segments": top_segments,
        "cluster_insights_saved": ci_ok,
        "pain_points_propagated": pp_success,
        "pain_points_errors": pp_errors,
    }


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def run_cluster_insight_generation(
    cluster_ids: Optional[List[int]] = None,
    inter_cluster_delay: float = 2.0,
) -> Dict[str, Any]:
    """
    Phase 2.5 orchestration: Cluster-Level LLM Insight Generation.

    Steps
    -----
    1. Discover all cluster IDs (or use provided list).
    2. For each cluster, run process_cluster() — one LLM call per cluster.
    3. Write structured insights to cluster_insights table.
    4. Propagate pain_point to all reviews in processed_reviews.pain_points.
    5. Return full summary.

    Parameters
    ----------
    cluster_ids : list[int] | None
        Specific clusters to process. If None, all clusters are processed.
    inter_cluster_delay : float
        Seconds to wait between cluster calls to avoid rate limits.
    """
    logger.info("=" * 60)
    logger.info("Phase 2.5: Cluster-Level LLM Insight Generation — START")
    logger.info("=" * 60)

    if cluster_ids is None:
        logger.info("Discovering cluster IDs from Supabase…")
        cluster_ids = get_distinct_cluster_ids()

    logger.info("Clusters to process: %s", cluster_ids)
    logger.info("LLM calls required : %d (one per cluster)", len(cluster_ids))

    groq_client = get_groq_client()
    model = get_model_name()
    logger.info("LLM model: %s (via Groq)", model)

    cluster_results: List[Dict[str, Any]] = []

    for idx, cid in enumerate(cluster_ids):
        result = process_cluster(cid, groq_client, model)
        cluster_results.append(result)

        # Brief pause between clusters to be polite to the API
        if idx < len(cluster_ids) - 1:
            logger.info("  Waiting %.1fs before next cluster…", inter_cluster_delay)
            time.sleep(inter_cluster_delay)

    # Build summary table
    total_reviews = sum(r["review_count"] for r in cluster_results)
    total_pp_propagated = sum(r["pain_points_propagated"] for r in cluster_results)
    total_pp_errors = sum(r["pain_points_errors"] for r in cluster_results)
    clusters_saved = sum(1 for r in cluster_results if r["cluster_insights_saved"])
    weekly_saved = save_weekly_insights(cluster_results)

    summary: Dict[str, Any] = {
        "clusters_processed": len(cluster_results),
        "clusters_saved_to_supabase": clusters_saved,
        "weekly_insights_saved": weekly_saved,
        "total_reviews_processed": total_reviews,
        "pain_points_propagated": total_pp_propagated,
        "pain_points_errors": total_pp_errors,
        "cluster_summaries": [
            {
                "cluster_id": r["cluster_id"],
                "themes": r["themes"],
                "pain_point": r["pain_point"],
                "severity": r["severity"],
                "product_opportunity": r["product_opportunity"],
                "review_count": r["review_count"],
            }
            for r in cluster_results
        ],
    }

    logger.info("=" * 60)
    logger.info("Phase 2.5 complete:")
    logger.info("  Clusters processed         : %d", summary["clusters_processed"])
    logger.info("  Saved to cluster_insights  : %d", summary["clusters_saved_to_supabase"])
    logger.info("  weekly_insights saved    : %s", summary["weekly_insights_saved"])
    logger.info("  Total reviews processed    : %d", summary["total_reviews_processed"])
    logger.info("  pain_points propagated     : %d", summary["pain_points_propagated"])
    logger.info("  pain_points errors         : %d", summary["pain_points_errors"])
    logger.info("  ── Per-cluster results ──")
    for r in cluster_results:
        logger.info(
            "    Cluster %d | severity=%d | themes=%s",
            r["cluster_id"], r["severity"], r["themes"],
        )
        logger.info("      pain_point: %s", r["pain_point"])
        logger.info("      opportunity: %s", r["product_opportunity"])
    logger.info("=" * 60)

    return summary


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Phase 2.5 — Cluster-Level LLM Insight Generation (Groq)"
    )
    parser.add_argument(
        "--clusters",
        nargs="+",
        type=int,
        default=None,
        help="Specific cluster IDs to process (default: all).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Seconds between cluster API calls (default: 2.0).",
    )
    args = parser.parse_args()

    result = run_cluster_insight_generation(
        cluster_ids=args.clusters,
        inter_cluster_delay=args.delay,
    )

    print("\n--- Phase 2.5 Summary ---")
    print(f"  Clusters processed        : {result['clusters_processed']}")
    print(f"  Saved to cluster_insights : {result['clusters_saved_to_supabase']}")
    print(f"  Total reviews processed   : {result['total_reviews_processed']}")
    print(f"  pain_points propagated    : {result['pain_points_propagated']}")
    print(f"\n  Cluster Insights:")
    for c in result["cluster_summaries"]:
        print(f"\n  Cluster {c['cluster_id']} (severity {c['severity']}/5)")
        print(f"    Themes     : {', '.join(c['themes'])}")
        print(f"    Pain point : {c['pain_point']}")
        print(f"    Opportunity: {c['product_opportunity']}")
