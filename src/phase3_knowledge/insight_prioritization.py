"""
Phase 3.4: Insight Prioritization Engine

Combines pain points, segment friction, and opportunity scores from Phases 3.1–3.3
into a single tiered action list for product teams.

Outputs
-------
  - Segment friction scores (per behavioral segment)
  - Top pain points (frequency × severity)
  - Opportunity rankings (from Phase 3.3)
  - Product recommendations (evidence-backed)
  - Emerging issue flags (week-over-week theme/sentiment spikes)
  - Unified prioritization matrix (Critical / High / Monitor)
"""

from __future__ import annotations

import json
import logging
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase3_knowledge.opportunity_scoring import (
    TIER_CRITICAL,
    TIER_HIGH,
    TIER_MONITOR,
    build_opportunity_candidates,
)
from src.phase3_knowledge.problem_statement_engine import (
    BEHAVIORAL_SEGMENTS,
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
DEFAULT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "insight_prioritization.json")

DISCOVERY_THEME_KEYWORDS = {
    "discover", "repetitive", "recommendation", "playlist fatigue",
    "algorithm", "search", "niche", "explore",
}

SPIKE_THRESHOLD_PCT = 25.0  # flag themes growing >25% week-over-week


def _parse_review_date(review_date: str) -> datetime:
    normalized = review_date.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def _is_discovery_theme(theme: str) -> bool:
    t = theme.lower()
    return any(kw in t for kw in DISCOVERY_THEME_KEYWORDS)


def _extract_pain_point(pain_points: List[Any]) -> Optional[str]:
    for item in pain_points or []:
        if isinstance(item, dict) and item.get("pain_point"):
            return str(item["pain_point"])
        if isinstance(item, str):
            return item
    return None


def compute_segment_friction_scores(
    records: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Friction score per behavioral segment:
      composite of negative sentiment, pain-point density, discovery-theme prevalence.
    """
    severity_by_cluster = {
        ci["cluster_id"]: int(ci.get("severity") or 3) for ci in cluster_insights
    }
    by_segment: Dict[str, List[ReviewRecord]] = defaultdict(list)
    for r in records:
        by_segment[r.behavioral_segment].append(r)

    scores: List[Dict[str, Any]] = []
    for segment in BEHAVIORAL_SEGMENTS:
        reviews = by_segment.get(segment, [])
        n = len(reviews)
        if n == 0:
            scores.append(
                {
                    "segment": segment,
                    "review_count": 0,
                    "friction_score": 0.0,
                    "negative_pct": 0.0,
                    "pain_point_density": 0.0,
                    "discovery_theme_pct": 0.0,
                    "avg_cluster_severity": None,
                }
            )
            continue

        negative = sum(1 for r in reviews if r.sentiment_label == "negative")
        negative_pct = 100 * negative / n

        with_pain = sum(1 for r in reviews if _extract_pain_point(r.pain_points))
        pain_density = with_pain / n

        discovery_hits = sum(
            1 for r in reviews if any(_is_discovery_theme(t) for t in r.themes)
        )
        discovery_pct = 100 * discovery_hits / n

        severities = [
            severity_by_cluster[r.cluster_id]
            for r in reviews
            if r.cluster_id is not None and r.cluster_id in severity_by_cluster
        ]
        avg_severity = round(sum(severities) / len(severities), 2) if severities else None

        friction = round(
            0.35 * (negative_pct / 100)
            + 0.30 * pain_density
            + 0.35 * (discovery_pct / 100),
            4,
        )
        if avg_severity:
            friction = round(min(1.0, friction * (avg_severity / 5.0)), 4)

        scores.append(
            {
                "segment": segment,
                "review_count": n,
                "friction_score": friction,
                "negative_pct": round(negative_pct, 1),
                "pain_point_density": round(pain_density, 3),
                "discovery_theme_pct": round(discovery_pct, 1),
                "avg_cluster_severity": avg_severity,
            }
        )

    scores.sort(key=lambda x: -x["friction_score"])
    return scores


def compute_top_pain_points(
    records: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Rank pain points by frequency × cluster severity."""
    pain_counter: Counter = Counter()
    pain_severity: Dict[str, List[int]] = defaultdict(list)
    pain_clusters: Dict[str, List[int]] = defaultdict(list)

    for ci in cluster_insights:
        pp = ci.get("pain_point")
        if not pp:
            continue
        count = ci.get("review_count") or 0
        sev = int(ci.get("severity") or 3)
        pain_counter[pp] += count
        pain_severity[pp].append(sev)
        pain_clusters[pp].append(ci["cluster_id"])

    for r in records:
        pp = _extract_pain_point(r.pain_points)
        if pp and pp not in pain_counter:
            pain_counter[pp] += 1

    ranked: List[Dict[str, Any]] = []
    for pp, freq in pain_counter.most_common(10):
        avg_sev = sum(pain_severity[pp]) / len(pain_severity[pp]) if pain_severity[pp] else 3
        impact = round(freq * (avg_sev / 5.0), 2)
        ranked.append(
            {
                "pain_point": pp,
                "frequency": freq,
                "avg_severity": round(avg_sev, 2),
                "impact_score": impact,
                "cluster_ids": sorted(set(pain_clusters.get(pp, []))),
            }
        )

    ranked.sort(key=lambda x: -x["impact_score"])
    return ranked


def _week_key(review_date: str) -> Optional[str]:
    if not review_date:
        return None
    try:
        dt = _parse_review_date(review_date)
        iso = dt.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    except Exception:
        return None


def detect_emerging_issues(
    records: List[ReviewRecord],
    client: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """
    Flag week-over-week theme/sentiment spikes.
    Uses historical_trends when available; otherwise computes from review dates.
    """
    if client is None:
        client = get_supabase_client()

    if client:
        try:
            response = client.table("historical_trends").select("*").execute()
            rows = response.data or []
            if rows:
                return _emerging_from_historical_trends(rows)
        except Exception as exc:
            logger.warning("Could not load historical_trends: %s", exc)

    return _emerging_from_reviews(records)


def _emerging_from_historical_trends(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_theme: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_theme[row["theme"]].append(row)

    emerging: List[Dict[str, Any]] = []
    for theme, entries in by_theme.items():
        entries.sort(key=lambda x: x.get("week_start") or "")
        if len(entries) < 2:
            continue
        prev, curr = entries[-2], entries[-1]
        prev_count = prev.get("mention_count") or 0
        curr_count = curr.get("mention_count") or 0
        if prev_count == 0:
            continue
        change_pct = 100 * (curr_count - prev_count) / prev_count
        if change_pct >= SPIKE_THRESHOLD_PCT:
            emerging.append(
                {
                    "theme": theme,
                    "type": "theme_spike",
                    "previous_count": prev_count,
                    "current_count": curr_count,
                    "change_pct": round(change_pct, 1),
                    "source": "historical_trends",
                }
            )
    emerging.sort(key=lambda x: -x["change_pct"])
    return emerging


def _emerging_from_reviews(records: List[ReviewRecord]) -> List[Dict[str, Any]]:
    """Compare last 7 days vs prior 7 days theme volume."""
    now = datetime.now(timezone.utc)
    recent_cutoff = now - timedelta(days=7)
    prior_cutoff = now - timedelta(days=14)

    recent_themes: Counter = Counter()
    prior_themes: Counter = Counter()

    for r in records:
        if not r.review_date:
            continue
        try:
            dt = _parse_review_date(r.review_date)
        except Exception:
            continue
        for theme in r.themes:
            if dt >= recent_cutoff:
                recent_themes[theme] += 1
            elif dt >= prior_cutoff:
                prior_themes[theme] += 1

    emerging: List[Dict[str, Any]] = []
    all_themes = set(recent_themes) | set(prior_themes)
    for theme in all_themes:
        prev = prior_themes.get(theme, 0)
        curr = recent_themes.get(theme, 0)
        if prev == 0 or curr <= prev:
            continue
        change_pct = 100 * (curr - prev) / prev
        if change_pct >= SPIKE_THRESHOLD_PCT:
            emerging.append(
                {
                    "theme": theme,
                    "type": "theme_spike",
                    "previous_count": prev,
                    "current_count": curr,
                    "change_pct": round(change_pct, 1),
                    "source": "computed_weekly_delta",
                }
            )

    emerging.sort(key=lambda x: -x["change_pct"])
    return emerging[:10]


def _assign_action_tier(score: float) -> str:
    if score >= 0.12:
        return TIER_CRITICAL
    if score >= 0.05:
        return TIER_HIGH
    return TIER_MONITOR


def build_prioritization_matrix(
    top_pain_points: List[Dict[str, Any]],
    segment_friction: List[Dict[str, Any]],
    opportunities: List[Dict[str, Any]],
    emerging: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge all insight streams into a unified ranked action list."""
    actions: List[Dict[str, Any]] = []

    max_pain_impact = max((p["impact_score"] for p in top_pain_points), default=1) or 1

    for pp in top_pain_points[:5]:
        norm = pp["impact_score"] / max_pain_impact
        actions.append(
            {
                "type": "pain_point",
                "title": pp["pain_point"],
                "priority_score": round(norm, 4),
                "tier": _assign_action_tier(norm * 0.15),
                "evidence": {
                    "frequency": pp["frequency"],
                    "avg_severity": pp["avg_severity"],
                    "cluster_ids": pp["cluster_ids"],
                },
                "recommendation": f"Address: {pp['pain_point']}",
            }
        )

    for opp in opportunities[:5]:
        actions.append(
            {
                "type": "opportunity",
                "title": opp["product_opportunity"],
                "priority_score": opp["scores"]["composite"],
                "tier": opp["tier"],
                "evidence": {
                    "pain_point": opp["pain_point"],
                    "cluster_id": opp["cluster_id"],
                    "review_count": opp["review_count"],
                    "quotes": opp["evidence"].get("representative_quotes", [])[:2],
                },
                "recommendation": opp["product_opportunity"],
            }
        )

    for seg in segment_friction[:3]:
        if seg["friction_score"] <= 0:
            continue
        actions.append(
            {
                "type": "segment_friction",
                "title": f"{seg['segment']} — elevated discovery friction",
                "priority_score": seg["friction_score"],
                "tier": _assign_action_tier(seg["friction_score"]),
                "evidence": {
                    "review_count": seg["review_count"],
                    "negative_pct": seg["negative_pct"],
                    "discovery_theme_pct": seg["discovery_theme_pct"],
                },
                "recommendation": (
                    f"Prioritize discovery improvements for {seg['segment']} users "
                    f"({seg['negative_pct']}% negative, friction {seg['friction_score']})"
                ),
            }
        )

    for issue in emerging[:3]:
        norm = min(1.0, issue["change_pct"] / 100)
        actions.append(
            {
                "type": "emerging_issue",
                "title": f"Emerging spike: {issue['theme']}",
                "priority_score": round(norm, 4),
                "tier": TIER_HIGH if issue["change_pct"] >= 50 else TIER_MONITOR,
                "evidence": issue,
                "recommendation": (
                    f"Investigate rising volume in '{issue['theme']}' "
                    f"(+{issue['change_pct']}% week-over-week)"
                ),
            }
        )

    actions.sort(key=lambda x: -x["priority_score"])
    for i, action in enumerate(actions, start=1):
        action["rank"] = i

    return actions


def build_product_recommendations(
    opportunities: List[Dict[str, Any]],
    prioritization_matrix: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Actionable recommendations tied to evidence, deduplicated."""
    seen: set = set()
    recs: List[Dict[str, Any]] = []

    for opp in opportunities:
        text = opp["product_opportunity"]
        if text in seen:
            continue
        seen.add(text)
        recs.append(
            {
                "recommendation": text,
                "tier": opp["tier"],
                "cluster_id": opp["cluster_id"],
                "pain_point": opp["pain_point"],
                "review_count": opp["review_count"],
                "opportunity_score": opp["scores"]["composite"],
            }
        )

    for action in prioritization_matrix:
        if action["type"] != "segment_friction":
            continue
        rec = action["recommendation"]
        if rec in seen:
            continue
        seen.add(rec)
        recs.append(
            {
                "recommendation": rec,
                "tier": action["tier"],
                "segment": action["evidence"].get("segment")
                or action["title"].split(" — ")[0],
                "friction_score": action["priority_score"],
            }
        )

    return recs[:10]


def run_insight_prioritization(filters: Optional[QueryFilters] = None) -> Dict[str, Any]:
    """Build the full Phase 3.4 prioritization bundle."""
    records = load_filtered_reviews(filters)
    cluster_insights = load_cluster_insights()

    segment_friction = compute_segment_friction_scores(records, cluster_insights)
    top_pain_points = compute_top_pain_points(records, cluster_insights)
    opportunities = build_opportunity_candidates(records, cluster_insights)
    emerging = detect_emerging_issues(records)

    matrix = build_prioritization_matrix(
        top_pain_points, segment_friction, opportunities, emerging
    )
    recommendations = build_product_recommendations(opportunities, matrix)

    by_tier = Counter(a["tier"] for a in matrix)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {
            k: v
            for k, v in (filters or QueryFilters()).__dict__.items()
            if v is not None
        },
        "total_reviews_analyzed": len(records),
        "segment_friction_scores": segment_friction,
        "top_pain_points": top_pain_points,
        "opportunity_rankings": opportunities,
        "emerging_issues": emerging,
        "product_recommendations": recommendations,
        "prioritization_matrix": matrix,
        "tier_summary": dict(by_tier),
        "top_priority": matrix[0] if matrix else None,
    }


def save_results(results: Dict[str, Any], output_path: str = DEFAULT_OUTPUT_FILE) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    logger.info("Saved insight prioritization to %s", output_path)
    return output_path


def _build_markdown_report(results: Dict[str, Any]) -> str:
    lines = [
        "# Insight Prioritization Report (Phase 3.4)",
        "",
        f"Generated: {results.get('generated_at', '')}",
        f"Reviews analyzed: {results.get('total_reviews_analyzed', 0):,}",
        "",
        f"**Tier summary:** {results.get('tier_summary', {})}",
        "",
        "## Top Priorities",
        "",
    ]
    for action in results.get("prioritization_matrix", [])[:8]:
        lines.append(
            f"### #{action['rank']} [{action['tier']}] {action['type'].replace('_', ' ').title()}"
        )
        lines.append("")
        lines.append(action["title"])
        lines.append("")
        lines.append(f"**Recommendation:** {action['recommendation']}")
        lines.append("")

    lines.append("## Segment Friction Scores")
    lines.append("")
    for seg in results.get("segment_friction_scores", [])[:6]:
        if seg["review_count"] == 0:
            continue
        lines.append(
            f"- **{seg['segment']}** — friction {seg['friction_score']} "
            f"({seg['review_count']:,} reviews, {seg['negative_pct']}% negative)"
        )
    lines.append("")
    return "\n".join(lines)


def save_to_weekly_insights(results: Dict[str, Any]) -> bool:
    from src.phase3_knowledge.opportunity_scoring import _merge_top_themes

    client = get_supabase_client()
    if not client:
        return False
    try:
        _merge_top_themes(
            client,
            "insight_prioritization",
            results,
            _build_markdown_report(results),
        )
        logger.info("Saved insight prioritization to weekly_insights.")
        return True
    except Exception as exc:
        logger.error("Could not save to weekly_insights: %s", exc)
        return False


def run_insight_prioritization_engine(
    filters: Optional[QueryFilters] = None,
    output_path: str = DEFAULT_OUTPUT_FILE,
    save_supabase: bool = True,
) -> Dict[str, Any]:
    """Phase 3.4 entry point."""
    results = run_insight_prioritization(filters)
    save_results(results, output_path)
    if save_supabase:
        save_to_weekly_insights(results)
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.4 — Insight Prioritization Engine")
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
    result = run_insight_prioritization_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.4 Summary ---")
    print(f"  Reviews analyzed : {result['total_reviews_analyzed']:,}")
    print(f"  Tier summary     : {result['tier_summary']}")
    print(f"  Emerging issues  : {len(result['emerging_issues'])}")
    if result.get("top_priority"):
        tp = result["top_priority"]
        print(f"\n  Top priority [#{tp['rank']} {tp['tier']}]")
        print(f"    {tp['title'][:120]}")
