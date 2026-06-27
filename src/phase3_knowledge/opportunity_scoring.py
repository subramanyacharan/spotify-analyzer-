"""
Phase 3.3: Opportunity Scoring Engine

Ranks product opportunities using metrics derivable from Phase 2 outputs:
  Score = Frequency × Severity × Segment Impact × Sentiment Intensity

Seeds candidates from cluster_insights (pain_point, product_opportunity) and
aggregated review/theme evidence — no per-review LLM calls.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase3_knowledge.problem_statement_engine import (
    QueryFilters,
    ReviewRecord,
    load_cluster_insights,
    load_filtered_reviews,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

OUTPUT_DIR = os.path.join(project_root, "data", "outputs")
DEFAULT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "opportunity_scores.json")

# Behavioral segments with elevated discovery friction (from Phase 3.2 findings)
HIGH_FRICTION_SEGMENTS = {
    "Playlist Driven",
    "Habit Listener",
    "Discovery Seeker",
}

# Exclude opportunities requiring unsupported demographic inference
UNSUPPORTED_PATTERN = re.compile(
    r"\b(age group|students?|working professionals?|parents?|teenagers?|"
    r"gen z|millennials?|boomers?|demographic)\b",
    re.I,
)

TIER_CRITICAL = "Critical"
TIER_HIGH = "High"
TIER_MONITOR = "Monitor"


def _normalize_frequency(review_count: int, max_count: int) -> float:
    if max_count <= 0:
        return 0.0
    return round(review_count / max_count, 4)


def _normalize_severity(severity: int) -> float:
    return round(max(1, min(5, severity)) / 5.0, 4)


def _segment_impact(reviews: List[ReviewRecord]) -> float:
    if not reviews:
        return 0.0
    friction_count = sum(
        1 for r in reviews if r.behavioral_segment in HIGH_FRICTION_SEGMENTS
    )
    return round(friction_count / len(reviews), 4)


def _sentiment_intensity(reviews: List[ReviewRecord]) -> float:
    if not reviews:
        return 0.0
    negative = sum(1 for r in reviews if r.sentiment_label == "negative")
    negative_pct = negative / len(reviews)

    score_magnitudes = []
    for r in reviews:
        if r.sentiment_score is not None:
            # Lower scores (1-2) = stronger negative intensity
            score_magnitudes.append(max(0.0, (3.0 - float(r.sentiment_score)) / 2.0))
    avg_magnitude = sum(score_magnitudes) / len(score_magnitudes) if score_magnitudes else 0.0

    return round(min(1.0, (negative_pct + avg_magnitude) / 2.0), 4)


def compute_opportunity_score(
    review_count: int,
    max_count: int,
    severity: int,
    reviews: List[ReviewRecord],
) -> Dict[str, float]:
    frequency = _normalize_frequency(review_count, max_count)
    severity_norm = _normalize_severity(severity)
    segment_imp = _segment_impact(reviews)
    sentiment = _sentiment_intensity(reviews)

    composite = round(frequency * severity_norm * segment_imp * sentiment, 6)

    return {
        "frequency": frequency,
        "severity": severity_norm,
        "segment_impact": segment_imp,
        "sentiment_intensity": sentiment,
        "composite": composite,
    }


def _segment_breakdown(reviews: List[ReviewRecord]) -> List[Dict[str, Any]]:
    counter = Counter(r.behavioral_segment for r in reviews)
    total = len(reviews) or 1
    return [
        {"segment": seg, "count": cnt, "pct": round(100 * cnt / total, 1)}
        for seg, cnt in counter.most_common()
    ]


def _theme_breakdown(reviews: List[ReviewRecord]) -> List[Dict[str, Any]]:
    counter: Counter = Counter()
    for r in reviews:
        for t in r.themes:
            counter[t] += 1
    total = len(reviews) or 1
    return [
        {"theme": theme, "count": cnt, "pct": round(100 * cnt / total, 1)}
        for theme, cnt in counter.most_common(5)
    ]


def _pick_quotes(reviews: List[ReviewRecord], limit: int = 3) -> List[str]:
    sorted_reviews = sorted(
        reviews,
        key=lambda r: (0 if r.sentiment_label == "negative" else 1),
    )
    quotes: List[str] = []
    for r in sorted_reviews:
        text = r.cleaned_text.strip()
        if len(text) < 15:
            continue
        snippet = text[:180] + ("…" if len(text) > 180 else "")
        if snippet not in quotes:
            quotes.append(snippet)
        if len(quotes) >= limit:
            break
    return quotes


def _is_supported_opportunity(text: str) -> bool:
    return not UNSUPPORTED_PATTERN.search(text or "")


def _assign_tier(composite: float, rank: int) -> str:
    if rank <= 2 or composite >= 0.12:
        return TIER_CRITICAL
    if rank <= 5 or composite >= 0.06:
        return TIER_HIGH
    return TIER_MONITOR


def build_opportunity_candidates(
    records: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Build scored opportunity list from cluster_insights seeds."""
    by_cluster: Dict[int, List[ReviewRecord]] = defaultdict(list)
    for r in records:
        if r.cluster_id is not None:
            by_cluster[r.cluster_id].append(r)

    max_count = max((len(v) for v in by_cluster.values()), default=1)
    candidates: List[Dict[str, Any]] = []

    for ci in cluster_insights:
        cid = ci["cluster_id"]
        reviews = by_cluster.get(cid, [])
        review_count = len(reviews) or ci.get("review_count") or 0
        opportunity_text = ci.get("product_opportunity") or ""
        pain_point = ci.get("pain_point") or ""

        if not _is_supported_opportunity(opportunity_text + " " + pain_point):
            logger.warning(
                "Skipping cluster %d — unsupported demographic opportunity language.",
                cid,
            )
            continue

        scores = compute_opportunity_score(
            review_count=review_count,
            max_count=max_count,
            severity=int(ci.get("severity") or 3),
            reviews=reviews,
        )

        candidates.append(
            {
                "opportunity_id": f"cluster_{cid}",
                "cluster_id": cid,
                "pain_point": pain_point,
                "product_opportunity": opportunity_text,
                "feature_request": ci.get("feature_request"),
                "themes": ci.get("themes") or _theme_breakdown(reviews),
                "review_count": review_count,
                "scores": scores,
                "evidence": {
                    "segment_breakdown": _segment_breakdown(reviews),
                    "theme_breakdown": _theme_breakdown(reviews),
                    "representative_quotes": (
                        ci.get("representative_user_quotes") or _pick_quotes(reviews)
                    )[:3],
                    "dominant_sentiment": ci.get("dominant_sentiment"),
                },
            }
        )

    candidates.sort(key=lambda x: -x["scores"]["composite"])
    for i, c in enumerate(candidates, start=1):
        c["rank"] = i
        c["tier"] = _assign_tier(c["scores"]["composite"], i)

    return candidates


def run_opportunity_scoring(filters: Optional[QueryFilters] = None) -> Dict[str, Any]:
    """Score and rank all cluster-seeded product opportunities."""
    records = load_filtered_reviews(filters)
    cluster_insights = load_cluster_insights()
    opportunities = build_opportunity_candidates(records, cluster_insights)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {
            k: v
            for k, v in (filters or QueryFilters()).__dict__.items()
            if v is not None
        },
        "total_reviews_analyzed": len(records),
        "scoring_formula": "Frequency × Severity × Segment Impact × Sentiment Intensity",
        "opportunities": opportunities,
        "top_opportunity": opportunities[0] if opportunities else None,
    }


def save_results(results: Dict[str, Any], output_path: str = DEFAULT_OUTPUT_FILE) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    logger.info("Saved opportunity scores to %s", output_path)
    return output_path


def _build_markdown_report(results: Dict[str, Any]) -> str:
    lines = [
        "# Opportunity Scoring Report (Phase 3.3)",
        "",
        f"Generated: {results.get('generated_at', '')}",
        f"Formula: {results.get('scoring_formula', '')}",
        "",
        "## Ranked Opportunities",
        "",
    ]
    for opp in results.get("opportunities", []):
        s = opp["scores"]
        lines.append(f"### #{opp['rank']} [{opp['tier']}] Cluster {opp['cluster_id']}")
        lines.append("")
        lines.append(f"**Score:** {s['composite']} (F={s['frequency']} × Sev={s['severity']} × Seg={s['segment_impact']} × Sent={s['sentiment_intensity']})")
        lines.append("")
        lines.append(f"**Pain point:** {opp['pain_point']}")
        lines.append("")
        lines.append(f"**Opportunity:** {opp['product_opportunity']}")
        lines.append("")
        lines.append(f"Reviews: {opp['review_count']:,}")
        lines.append("")
    return "\n".join(lines)


def _merge_top_themes(client: Any, key: str, payload: Dict[str, Any], md: str) -> bool:
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    existing = (
        client.table("weekly_insights")
        .select("id, top_themes, pulse_report_md")
        .eq("week_start", week_start.isoformat())
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        top_themes = row.get("top_themes") or {}
        if isinstance(top_themes, str):
            top_themes = json.loads(top_themes)
        if isinstance(top_themes, list):
            top_themes = {"legacy_top_themes": top_themes}
        if not isinstance(top_themes, dict):
            top_themes = {}
        top_themes[key] = payload
        combined_md = (row.get("pulse_report_md") or "") + "\n\n---\n\n" + md
        client.table("weekly_insights").update(
            {"top_themes": top_themes, "pulse_report_md": combined_md}
        ).eq("id", row["id"]).execute()
    else:
        client.table("weekly_insights").insert(
            {
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "top_themes": {key: payload},
                "pulse_report_md": md,
            }
        ).execute()
    return True


def save_to_weekly_insights(results: Dict[str, Any]) -> bool:
    client = get_supabase_client()
    if not client:
        return False
    try:
        _merge_top_themes(
            client,
            "opportunity_scores",
            results,
            _build_markdown_report(results),
        )
        logger.info("Saved opportunity scores to weekly_insights.")
        return True
    except Exception as exc:
        logger.error("Could not save to weekly_insights: %s", exc)
        return False


def run_opportunity_scoring_engine(
    filters: Optional[QueryFilters] = None,
    output_path: str = DEFAULT_OUTPUT_FILE,
    save_supabase: bool = True,
) -> Dict[str, Any]:
    """Phase 3.3 entry point."""
    results = run_opportunity_scoring(filters)
    save_results(results, output_path)
    if save_supabase:
        save_to_weekly_insights(results)
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.3 — Opportunity Scoring Engine")
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
    result = run_opportunity_scoring_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.3 Summary ---")
    print(f"  Reviews analyzed  : {result['total_reviews_analyzed']:,}")
    print(f"  Opportunities ranked: {len(result['opportunities'])}")
    for opp in result["opportunities"]:
        s = opp["scores"]
        print(
            f"\n  #{opp['rank']} [{opp['tier']}] Cluster {opp['cluster_id']} — "
            f"score {s['composite']}"
        )
        print(f"    {opp['product_opportunity'][:100]}…")
