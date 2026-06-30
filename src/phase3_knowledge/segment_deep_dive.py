"""
Phase 3.2: Segment Deep-Dive Engine

Produces behavioral segment profiles explaining discovery friction, listening
intent, and unmet needs — using Phase 2 outputs only (no per-review LLM calls).

Data sources
------------
  processed_reviews  — themes, sentiment, segments, clusters, pain_points, text
  cluster_insights   — severity, pain points, quotes per cluster
  raw_reviews        — date, source, rating (for optional filtering)
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from src.phase2_analysis.prompts import rank_themes_by_count

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase3_knowledge.problem_statement_engine import (
    BEHAVIORAL_SEGMENTS,
    QueryFilters,
    ReviewRecord,
    load_cluster_insights,
    load_filtered_reviews,
    resolve_query_filters,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

OUTPUT_DIR = os.path.join(project_root, "data", "outputs")
DEFAULT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "segment_deep_dives.json")

# Listening-intent language patterns (review text)
DISCOVERY_SIGNAL = re.compile(
    r"\b(discover|explore|find new|new music|new artist|recommendation|algorithm|suggest)\b",
    re.I,
)
COMFORT_HABIT_SIGNAL = re.compile(
    r"\b(comfort|familiar|same song|same artist|repeat|routine|daily|playlist|"
    r"background|relax|habit|over and over)\b",
    re.I,
)
MOOD_CONTEXT_SIGNAL = re.compile(
    r"\b(mood|workout|sleep|study|party|commute|listen while|driving|gym|focus)\b",
    re.I,
)

# Cross-segment friction theme/text signals
REPETITIVE_THEMES = {"repetitive recommendations", "playlist fatigue"}
REPETITIVE_TEXT = re.compile(
    r"\b(same song|same artist|repeat|over and over|hear the same|playlist fatigue)\b",
    re.I,
)
REC_FATIGUE_THEMES = {"repetitive recommendations", "playlist fatigue", "recommendation quality"}
REC_FATIGUE_TEXT = re.compile(
    r"\b(recommend|suggest|algorithm|discover weekly|daily mix|repetitive|boring)\b",
    re.I,
)
DISCOVERY_FAIL_THEMES = {
    "search & discovery ux",
    "discover weekly issues",
    "recommendation quality",
    "niche discovery issues",
}
DISCOVERY_FAIL_TEXT = re.compile(
    r"\b(can't find|hard to find|discover|explore|find new|no new music|stuck)\b",
    re.I,
)


def _extract_pain_point_text(pain_points: List[Any]) -> Optional[str]:
    if not pain_points:
        return None
    for item in pain_points:
        if isinstance(item, dict) and item.get("pain_point"):
            return str(item["pain_point"])
        if isinstance(item, str):
            return item
    return None


def _sentiment_breakdown(reviews: List[ReviewRecord]) -> Dict[str, Any]:
    counts = Counter(r.sentiment_label for r in reviews)
    total = len(reviews) or 1
    negative = counts.get("negative", 0)
    scores = [float(r.sentiment_score) for r in reviews if r.sentiment_score is not None]
    return {
        "positive": counts.get("positive", 0),
        "neutral": counts.get("neutral", 0),
        "negative": negative,
        "negative_pct": round(100 * negative / total, 1),
        "avg_sentiment_score": round(sum(scores) / len(scores), 2) if scores else None,
    }


def _top_themes(reviews: List[ReviewRecord], limit: int = 5) -> List[Dict[str, Any]]:
    counter: Counter = Counter()
    for r in reviews:
        for t in r.themes:
            counter[t] += 1
    total = len(reviews) or 1
    return [
        {"theme": theme, "count": count, "pct": round(100 * count / total, 1)}
        for theme, count in rank_themes_by_count(counter, limit)
    ]


def _top_pain_points(reviews: List[ReviewRecord], limit: int = 5) -> List[Dict[str, Any]]:
    counter: Counter = Counter()
    for r in reviews:
        pt = _extract_pain_point_text(r.pain_points)
        if pt:
            counter[pt] += 1
    total = len(reviews) or 1
    return [
        {"pain_point": pp, "count": count, "pct": round(100 * count / total, 1)}
        for pp, count in counter.most_common(limit)
    ]


def _listening_intent_signals(reviews: List[ReviewRecord]) -> Dict[str, Any]:
    discovery = comfort = mood = 0
    for r in reviews:
        text = r.cleaned_text
        if DISCOVERY_SIGNAL.search(text):
            discovery += 1
        if COMFORT_HABIT_SIGNAL.search(text):
            comfort += 1
        if MOOD_CONTEXT_SIGNAL.search(text):
            mood += 1
    total = len(reviews) or 1
    return {
        "discovery_signals": discovery,
        "comfort_habit_signals": comfort,
        "mood_context_signals": mood,
        "discovery_pct": round(100 * discovery / total, 1),
        "comfort_habit_pct": round(100 * comfort / total, 1),
        "mood_context_pct": round(100 * mood / total, 1),
        "dominant_intent": _dominant_intent(discovery, comfort, mood),
    }


def _dominant_intent(discovery: int, comfort: int, mood: int) -> str:
    scores = {
        "discovery": discovery,
        "comfort_habit": comfort,
        "mood_context": mood,
    }
    top = max(scores, key=scores.get)
    if scores[top] == 0:
        return "mixed/unclear"
    return top


def _cluster_overlap(
    reviews: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    counter = Counter(r.cluster_id for r in reviews if r.cluster_id is not None)
    insight_map = {ci["cluster_id"]: ci for ci in cluster_insights}
    total = len(reviews) or 1
    results = []
    for cid, count in counter.most_common(limit):
        ci = insight_map.get(cid, {})
        results.append(
            {
                "cluster_id": cid,
                "review_count": count,
                "pct": round(100 * count / total, 1),
                "themes": ci.get("themes") or [],
                "pain_point": ci.get("pain_point"),
                "severity": ci.get("severity"),
                "product_opportunity": ci.get("product_opportunity"),
            }
        )
    return results


def _avg_cluster_severity(
    reviews: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> Optional[float]:
    insight_map = {ci["cluster_id"]: ci.get("severity") for ci in cluster_insights}
    weighted_sum = 0.0
    weight = 0
    for r in reviews:
        if r.cluster_id is not None and insight_map.get(r.cluster_id):
            weighted_sum += float(insight_map[r.cluster_id])
            weight += 1
    return round(weighted_sum / weight, 2) if weight else None


def _pick_quotes(reviews: List[ReviewRecord], limit: int = 5) -> List[str]:
    sorted_reviews = sorted(
        reviews,
        key=lambda r: (0 if r.sentiment_label == "negative" else 1),
    )
    quotes: List[str] = []
    for r in sorted_reviews:
        text = r.cleaned_text.strip()
        if len(text) < 20:
            continue
        snippet = text[:200] + ("…" if len(text) > 200 else "")
        if snippet not in quotes:
            quotes.append(snippet)
        if len(quotes) >= limit:
            break
    return quotes


def _build_profile_summary(
    segment: str,
    reviews: List[ReviewRecord],
    sentiment: Dict[str, Any],
    intent: Dict[str, Any],
    top_themes: List[Dict[str, Any]],
) -> str:
    n = len(reviews)
    if n == 0:
        return f"No reviews mapped to {segment} in the current filter window."

    theme_str = ", ".join(t["theme"] for t in top_themes[:3]) if top_themes else "mixed themes"
    return (
        f"{segment} ({n:,} reviews, {sentiment['negative_pct']}% negative): "
        f"Dominant listening intent signal is {intent['dominant_intent'].replace('_', ' ')}. "
        f"Top themes include {theme_str}. "
        f"Discovery language appears in {intent['discovery_pct']}% of reviews; "
        f"comfort/habit signals in {intent['comfort_habit_pct']}%."
    )


def build_segment_profile(
    segment: str,
    all_reviews: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build a deep-dive profile for one behavioral segment."""
    reviews = [r for r in all_reviews if r.behavioral_segment == segment]
    sentiment = _sentiment_breakdown(reviews)
    top_themes = _top_themes(reviews)
    top_pain = _top_pain_points(reviews)
    intent = _listening_intent_signals(reviews)
    clusters = _cluster_overlap(reviews, cluster_insights)

    return {
        "segment": segment,
        "review_count": len(reviews),
        "top_themes": top_themes,
        "top_pain_points": top_pain,
        "sentiment_breakdown": sentiment,
        "avg_cluster_severity": _avg_cluster_severity(reviews, cluster_insights),
        "listening_intent_signals": intent,
        "cluster_overlap": clusters,
        "representative_quotes": _pick_quotes(reviews),
        "profile_summary": _build_profile_summary(
            segment, reviews, sentiment, intent, top_themes
        ),
    }


def _friction_score(
    reviews: List[ReviewRecord],
    theme_set: set,
    text_pattern: re.Pattern,
) -> float:
    score = 0.0
    for r in reviews:
        theme_hit = any(t.lower() in theme_set for t in r.themes)
        text_hit = bool(text_pattern.search(r.cleaned_text))
        if not theme_hit and not text_hit:
            continue
        score += 1.0
        if r.sentiment_label == "negative":
            score += 1.5
        if r.sentiment_score is not None and float(r.sentiment_score) <= 2:
            score += 0.5
    return round(score, 1)


def build_segment_comparison(all_reviews: List[ReviewRecord]) -> Dict[str, Any]:
    """Compare segments on repetitive listening, recommendation fatigue, discovery failure."""
    by_segment: Dict[str, List[ReviewRecord]] = defaultdict(list)
    for r in all_reviews:
        by_segment[r.behavioral_segment].append(r)

    metrics = {}
    for segment in BEHAVIORAL_SEGMENTS:
        seg_reviews = by_segment.get(segment, [])
        metrics[segment] = {
            "repetitive_listening_score": _friction_score(
                seg_reviews, REPETITIVE_THEMES, REPETITIVE_TEXT
            ),
            "recommendation_fatigue_score": _friction_score(
                seg_reviews, REC_FATIGUE_THEMES, REC_FATIGUE_TEXT
            ),
            "discovery_failure_score": _friction_score(
                seg_reviews, DISCOVERY_FAIL_THEMES, DISCOVERY_FAIL_TEXT
            ),
            "review_count": len(seg_reviews),
        }

    def _rank(key: str) -> List[Dict[str, Any]]:
        ranked = sorted(
            metrics.items(),
            key=lambda x: -x[1][key],
        )
        return [
            {"segment": seg, "score": data[key], "review_count": data["review_count"]}
            for seg, data in ranked
            if data["review_count"] > 0
        ]

    return {
        "repetitive_listening_ranking": _rank("repetitive_listening_score"),
        "recommendation_fatigue_ranking": _rank("recommendation_fatigue_score"),
        "discovery_failure_ranking": _rank("discovery_failure_score"),
        "highest_friction_segment": _rank("recommendation_fatigue_score")[0]["segment"]
        if any(m["review_count"] > 0 for m in metrics.values())
        else None,
        "segment_metrics": metrics,
    }


def run_segment_deep_dives(filters: Optional[QueryFilters] = None) -> Dict[str, Any]:
    """Generate profiles for all six behavioral segments plus cross-segment comparison."""
    filters = resolve_query_filters(filters)
    records = load_filtered_reviews(filters)
    cluster_insights = load_cluster_insights()

    profiles = [
        build_segment_profile(seg, records, cluster_insights)
        for seg in BEHAVIORAL_SEGMENTS
    ]
    comparison = build_segment_comparison(records)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {
            k: v
            for k, v in filters.__dict__.items()
            if v is not None
        },
        "total_reviews_analyzed": len(records),
        "segment_profiles": profiles,
        "segment_comparison": comparison,
    }


def save_results(results: Dict[str, Any], output_path: str = DEFAULT_OUTPUT_FILE) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    logger.info("Saved segment deep-dives to %s", output_path)
    return output_path


def _build_markdown_report(results: Dict[str, Any]) -> str:
    lines = [
        "# Segment Deep-Dive Report (Phase 3.2)",
        "",
        f"Generated: {results.get('generated_at', '')}",
        f"Reviews analyzed: {results.get('total_reviews_analyzed', 0):,}",
        "",
        "## Cross-Segment Comparison",
        "",
    ]
    comp = results.get("segment_comparison", {})
    for label, key in [
        ("Repetitive Listening", "repetitive_listening_ranking"),
        ("Recommendation Fatigue", "recommendation_fatigue_ranking"),
        ("Discovery Failure", "discovery_failure_ranking"),
    ]:
        lines.append(f"### {label}")
        for row in comp.get(key, [])[:3]:
            lines.append(
                f"- **{row['segment']}** — score {row['score']} ({row['review_count']:,} reviews)"
            )
        lines.append("")

    lines.append("## Segment Profiles")
    lines.append("")
    for profile in results.get("segment_profiles", []):
        lines.append(f"### {profile['segment']} ({profile['review_count']:,} reviews)")
        lines.append("")
        lines.append(profile["profile_summary"])
        sb = profile.get("sentiment_breakdown", {})
        lines.append(
            f"- Negative sentiment: **{sb.get('negative_pct', 0)}%** | "
            f"Avg cluster severity: **{profile.get('avg_cluster_severity', 'N/A')}**"
        )
        intent = profile.get("listening_intent_signals", {})
        lines.append(
            f"- Intent signals — discovery: {intent.get('discovery_pct')}%, "
            f"comfort/habit: {intent.get('comfort_habit_pct')}%, "
            f"mood/context: {intent.get('mood_context_pct')}%"
        )
        if profile.get("representative_quotes"):
            lines.append("- Sample quote:")
            lines.append(f'  - "{profile["representative_quotes"][0]}"')
        lines.append("")

    return "\n".join(lines)


def save_to_weekly_insights(results: Dict[str, Any]) -> bool:
    """Merge segment deep-dives into the current week's weekly_insights row."""
    from src.phase5_orchestration.weekly_insights_store import merge_top_themes_for_week

    client = get_supabase_client()
    if not client:
        return False

    try:
        merge_top_themes_for_week(
            client,
            "segment_deep_dives",
            results,
            _build_markdown_report(results),
        )
        logger.info("Saved segment deep-dives to weekly_insights.")
        return True
    except Exception as exc:
        logger.error("Could not save to weekly_insights: %s", exc)
        return False


def run_segment_deep_dive_engine(
    filters: Optional[QueryFilters] = None,
    output_path: str = DEFAULT_OUTPUT_FILE,
    save_supabase: bool = True,
) -> Dict[str, Any]:
    """Phase 3.2 entry point."""
    results = run_segment_deep_dives(filters)
    save_results(results, output_path)
    if save_supabase:
        save_to_weekly_insights(results)
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.2 — Segment Deep-Dive Engine")
    parser.add_argument("--source", type=str, default=None)
    parser.add_argument("--date-start", type=str, default=None)
    parser.add_argument("--date-end", type=str, default=None)
    parser.add_argument("--no-supabase", action="store_true")
    args = parser.parse_args()

    filt = QueryFilters(
        date_start=args.date_start,
        date_end=args.date_end,
        source=args.source,
    )
    result = run_segment_deep_dive_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.2 Summary ---")
    print(f"  Reviews analyzed : {result['total_reviews_analyzed']:,}")
    print(f"  Segments profiled: {len(result['segment_profiles'])}")
    comp = result["segment_comparison"]
    print(f"  Highest friction : {comp.get('highest_friction_segment')}")
    for profile in result["segment_profiles"]:
        if profile["review_count"] == 0:
            continue
        sb = profile["sentiment_breakdown"]
        print(
            f"\n  {profile['segment']}: {profile['review_count']:,} reviews | "
            f"{sb['negative_pct']}% negative | severity {profile.get('avg_cluster_severity')}"
        )
