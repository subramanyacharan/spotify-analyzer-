"""
Phase 5.1: Automated Weekly Report Generation

Consolidates Phase 3 insight engine outputs into a structured weekly report
(JSON + Markdown) stored in Supabase `weekly_insights`.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = os.path.join(project_root, "data", "outputs")
DEFAULT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "weekly_report.json")

SPIKE_THRESHOLD_PCT = 15.0

BUSINESS_MAP = {
    "New User": ["Discovery Seeker"],
    "Casual Listener": ["Casual Listener"],
    "Premium User": ["Playlist Driven"],
    "Heavy Listener": ["Heavy Listener"],
    "Niche Music Listener": ["Niche Listener"],
}

ENGAGEMENT_TIERS = [
    {"id": "heavy_new", "name": "Heavy / New Users", "segments": ["Heavy Listener", "New User"]},
    {"id": "casual", "name": "Casual / Medium", "segments": ["Casual Listener"]},
    {"id": "premium", "name": "Premium Active", "segments": ["Premium User", "Playlist Driven"]},
    {"id": "niche", "name": "Niche Listeners", "segments": ["Niche Listener", "Niche Music Listener"]},
]

CONTEXT_LENSES = [
    {"id": "play_store", "name": "Play Store reviews"},
    {"id": "app_store", "name": "App Store reviews"},
    {"id": "multi_source", "name": "Cross-platform themes"},
]


def _week_bounds(reference: Optional[datetime] = None) -> Tuple[str, str]:
    today = (reference or datetime.now(timezone.utc)).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start.isoformat(), week_end.isoformat()


def _normalize_top_themes(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if isinstance(raw, list):
        return {"legacy_top_themes": raw}
    if isinstance(raw, dict):
        return dict(raw)
    return {}


def _load_local_json(filename: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_phase3_payloads(
    client: Optional[Any] = None,
    top_themes: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Load Phase 3 snapshots from Supabase row or local JSON files."""
    if top_themes is not None:
        themes = _normalize_top_themes(top_themes)
    elif client:
        week_start, _ = _week_bounds()
        row = (
            client.table("weekly_insights")
            .select("top_themes")
            .eq("week_start", week_start)
            .limit(1)
            .execute()
        )
        if row.data:
            themes = _normalize_top_themes(row.data[0].get("top_themes"))
        else:
            latest = (
                client.table("weekly_insights")
                .select("top_themes")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            themes = _normalize_top_themes(latest.data[0].get("top_themes")) if latest.data else {}
    else:
        themes = {}

    def pick(key: str, filename: str) -> Dict[str, Any]:
        if key in themes and themes[key]:
            return themes[key]
        local = _load_local_json(filename)
        return local or {}

    return {
        "problem_statement_insights": pick("problem_statement_insights", "problem_statement_insights.json"),
        "segment_deep_dives": pick("segment_deep_dives", "segment_deep_dives.json"),
        "opportunity_scores": pick("opportunity_scores", "opportunity_scores.json"),
        "insight_prioritization": pick("insight_prioritization", "insight_prioritization.json"),
    }


def load_prior_week_payloads(client: Any, week_start: str) -> Dict[str, Any]:
    """Load the most recent weekly_insights row before the current week."""
    try:
        prior = (
            client.table("weekly_insights")
            .select("top_themes, week_start")
            .lt("week_start", week_start)
            .order("week_start", desc=True)
            .limit(1)
            .execute()
        )
        if not prior.data:
            return {}
        themes = _normalize_top_themes(prior.data[0].get("top_themes"))
        return {
            "week_start": prior.data[0].get("week_start"),
            "problem_statement_insights": themes.get("problem_statement_insights") or {},
            "segment_deep_dives": themes.get("segment_deep_dives") or {},
            "opportunity_scores": themes.get("opportunity_scores") or {},
            "insight_prioritization": themes.get("insight_prioritization") or {},
        }
    except Exception as exc:
        logger.warning("Could not load prior week: %s", exc)
        return {}


def compute_confidence(
    review_count: int,
    *,
    avg_severity: Optional[float] = None,
    negative_pct: Optional[float] = None,
    quote_count: int = 0,
    has_cluster_insight: bool = False,
) -> Dict[str, Any]:
    factors: List[str] = []
    score = 0

    if review_count >= 1000:
        score += 2
        factors.append(f"Large sample ({review_count:,} reviews)")
    elif review_count >= 100:
        score += 1
        factors.append(f"Moderate sample ({review_count:,} reviews)")
    else:
        factors.append(f"Limited sample ({review_count} reviews)")

    if avg_severity is not None and avg_severity >= 4:
        score += 1
        factors.append(f"High issue severity ({avg_severity:.1f}/5)")

    if negative_pct is not None and negative_pct > 20:
        score += 1
        factors.append(f"Consistent negative feedback ({negative_pct:.1f}%)")

    if quote_count >= 2 and has_cluster_insight:
        score += 1
        factors.append("Multiple quotes and supporting evidence")
    elif quote_count >= 2:
        factors.append("Representative user quotes included")

    level = "High" if score >= 4 else "Medium" if score >= 2 else "Low"
    return {"level": level, "factors": factors}


def build_problem_statement_summary(problem: Dict[str, Any]) -> Dict[str, Any]:
    answers = []
    for ans in problem.get("answers", []):
        metrics = ans.get("supporting_metrics") or {}
        sb = metrics.get("sentiment_breakdown") or {}
        conf = compute_confidence(
            metrics.get("review_count") or 0,
            negative_pct=sb.get("negative_pct"),
            quote_count=len(ans.get("representative_quotes") or []),
        )
        answers.append(
            {
                "question_id": ans.get("question_id"),
                "question": ans.get("question"),
                "finding_summary": ans.get("finding_summary"),
                "review_count": metrics.get("review_count", 0),
                "negative_pct": sb.get("negative_pct", 0),
                "top_themes": (metrics.get("top_themes") or [])[:5],
                "quotes": (ans.get("representative_quotes") or [])[:2],
                "confidence": conf,
            }
        )
    return {
        "total_reviews_analyzed": problem.get("total_reviews_analyzed", 0),
        "answers": answers,
    }


def build_emerging_complaints(
    current: Dict[str, Any],
    prior: Dict[str, Any],
) -> List[Dict[str, Any]]:
    emerging = list(current.get("emerging_issues") or [])
    if emerging:
        return emerging

    current_pains = {
        (p.get("pain_point") or "")[:80]: p for p in (current.get("top_pain_points") or [])
    }
    prior_pains = {
        (p.get("pain_point") or "")[:80]: p for p in (prior.get("top_pain_points") or [])
    }

    complaints: List[Dict[str, Any]] = []
    for key, curr in current_pains.items():
        prev = prior_pains.get(key)
        curr_freq = curr.get("frequency") or 0
        prev_freq = (prev or {}).get("frequency") or 0
        if prev_freq == 0 and curr_freq >= 50:
            complaints.append(
                {
                    "type": "new_pain_point",
                    "pain_point": curr.get("pain_point"),
                    "current_count": curr_freq,
                    "previous_count": 0,
                    "change_pct": 100.0,
                    "source": "phase5.1",
                }
            )
            continue
        if prev_freq > 0:
            change = 100 * (curr_freq - prev_freq) / prev_freq
            if change >= SPIKE_THRESHOLD_PCT:
                complaints.append(
                    {
                        "type": "pain_spike",
                        "pain_point": curr.get("pain_point"),
                        "current_count": curr_freq,
                        "previous_count": prev_freq,
                        "change_pct": round(change, 1),
                        "source": "phase5.1",
                    }
                )
    complaints.sort(key=lambda x: -x["change_pct"])
    return complaints[:10]


def build_theme_shifts(
    current_problem: Dict[str, Any],
    prior_problem: Dict[str, Any],
) -> List[Dict[str, Any]]:
    def theme_counts(problem: Dict[str, Any]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for ans in problem.get("answers", []):
            metrics = ans.get("supporting_metrics") or {}
            for t in metrics.get("top_themes") or []:
                name = t.get("theme") if isinstance(t, dict) else str(t)
                count = t.get("count", 0) if isinstance(t, dict) else 0
                counts[name] = counts.get(name, 0) + count
        return counts

    curr = theme_counts(current_problem)
    prior = theme_counts(prior_problem)
    all_themes = set(curr) | set(prior)
    shifts: List[Dict[str, Any]] = []

    for theme in all_themes:
        c = curr.get(theme, 0)
        p = prior.get(theme, 0)
        if p == 0 and c == 0:
            continue
        if p == 0:
            change_pct = 100.0 if c > 0 else 0.0
        else:
            change_pct = round(100 * (c - p) / p, 1)
        if abs(change_pct) >= SPIKE_THRESHOLD_PCT or (p == 0 and c >= 20):
            shifts.append(
                {
                    "theme": theme,
                    "previous_count": p,
                    "current_count": c,
                    "change_pct": change_pct,
                    "direction": "up" if change_pct > 0 else "down",
                }
            )

    shifts.sort(key=lambda x: -abs(x["change_pct"]))
    return shifts[:12]


def _friction_lookup(scores: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {s["segment"]: s for s in scores if s.get("segment")}


def _segment_delta(
    name: str,
    current: Optional[Dict[str, Any]],
    prior: Optional[Dict[str, Any]],
    lens: str,
) -> Dict[str, Any]:
    curr_score = (current or {}).get("friction_score", 0)
    prev_score = (prior or {}).get("friction_score", 0)
    delta = round(curr_score - prev_score, 4)
    return {
        "segment": name,
        "lens": lens,
        "current_friction": curr_score,
        "previous_friction": prev_score,
        "friction_delta": delta,
        "direction": "up" if delta > 0.01 else "down" if delta < -0.01 else "stable",
        "review_count": (current or {}).get("review_count", 0),
        "negative_pct": (current or {}).get("negative_pct", 0),
    }


def build_segment_changes(
    current_prior: Dict[str, Any],
    prior_prior: Dict[str, Any],
) -> Dict[str, List[Dict[str, Any]]]:
    curr_scores = current_prior.get("segment_friction_scores") or []
    prev_scores = prior_prior.get("segment_friction_scores") or []
    curr_map = _friction_lookup(curr_scores)
    prev_map = _friction_lookup(prev_scores)

    behavior = [
        _segment_delta(seg, curr_map.get(seg), prev_map.get(seg), "behavior")
        for seg in sorted(set(curr_map) | set(prev_map))
    ]
    behavior.sort(key=lambda x: -abs(x["friction_delta"]))

    pain_curr = {
        (p.get("pain_point") or "")[:60]: p for p in (current_prior.get("top_pain_points") or [])
    }
    pain_prev = {
        (p.get("pain_point") or "")[:60]: p for p in (prior_prior.get("top_pain_points") or [])
    }
    pain = []
    for key in set(pain_curr) | set(pain_prev):
        c = pain_curr.get(key, {})
        p = pain_prev.get(key, {})
        c_sev = (c.get("avg_severity") or 0) / 5
        p_sev = (p.get("avg_severity") or 0) / 5
        pain.append(
            {
                "segment": (c.get("pain_point") or p.get("pain_point") or key)[:56] + "…",
                "lens": "pain",
                "current_friction": round(c_sev, 4),
                "previous_friction": round(p_sev, 4),
                "friction_delta": round(c_sev - p_sev, 4),
                "direction": "up" if c_sev > p_sev else "down" if c_sev < p_sev else "stable",
                "review_count": c.get("frequency", 0),
                "negative_pct": 0,
            }
        )
    pain.sort(key=lambda x: -abs(x["friction_delta"]))

    business = []
    for biz_name, linked in BUSINESS_MAP.items():
        match_curr = next((curr_map[s] for s in linked if s in curr_map), None)
        match_prev = next((prev_map[s] for s in linked if s in prev_map), None)
        business.append(_segment_delta(biz_name, match_curr, match_prev, "business"))

    engagement = []
    for tier in ENGAGEMENT_TIERS:
        curr_matches = [curr_map[s] for s in tier["segments"] if s in curr_map]
        prev_matches = [prev_map[s] for s in tier["segments"] if s in prev_map]
        curr_agg = {
            "friction_score": sum(m["friction_score"] for m in curr_matches) / max(len(curr_matches), 1),
            "review_count": sum(m.get("review_count", 0) for m in curr_matches),
            "negative_pct": sum(m.get("negative_pct", 0) for m in curr_matches) / max(len(curr_matches), 1),
        } if curr_matches else None
        prev_agg = {
            "friction_score": sum(m["friction_score"] for m in prev_matches) / max(len(prev_matches), 1),
            "review_count": sum(m.get("review_count", 0) for m in prev_matches),
            "negative_pct": sum(m.get("negative_pct", 0) for m in prev_matches) / max(len(prev_matches), 1),
        } if prev_matches else None
        engagement.append(_segment_delta(tier["name"], curr_agg, prev_agg, "engagement"))

    theme_shifts = build_theme_shifts(
        current_prior.get("_problem") or {},
        prior_prior.get("_problem") or {},
    )
    context = [
        {
            "segment": ctx["name"],
            "lens": "context",
            "current_friction": 0,
            "previous_friction": 0,
            "friction_delta": 0,
            "direction": "stable",
            "review_count": 0,
            "negative_pct": 0,
            "note": "Theme volume proxy — see theme_shifts section",
        }
        for ctx in CONTEXT_LENSES
    ]

    return {
        "business": business,
        "engagement": engagement,
        "behavior": behavior[:8],
        "context": context,
        "pain": pain[:8],
        "theme_shifts_for_context": theme_shifts[:5],
    }


def build_new_opportunities(
    current: Dict[str, Any],
    prior: Dict[str, Any],
) -> List[Dict[str, Any]]:
    curr_opps = {o.get("cluster_id"): o for o in (current.get("opportunities") or [])}
    prior_opps = {o.get("cluster_id"): o for o in (prior.get("opportunities") or [])}
    new_or_upgraded: List[Dict[str, Any]] = []

    tier_rank = {"Critical": 4, "High": 3, "Medium": 2, "Monitor": 1, "Low": 0}

    for cid, opp in curr_opps.items():
        prev = prior_opps.get(cid)
        tier = opp.get("tier", "Monitor")
        prev_tier = (prev or {}).get("tier", "Low")
        is_new = prev is None
        upgraded = tier_rank.get(tier, 0) > tier_rank.get(prev_tier, 0)
        if is_new or upgraded:
            conf = compute_confidence(
                opp.get("review_count") or 0,
                avg_severity=(opp.get("scores") or {}).get("severity", 0) * 5,
                quote_count=len((opp.get("evidence") or {}).get("representative_quotes") or []),
                has_cluster_insight=True,
            )
            new_or_upgraded.append(
                {
                    "cluster_id": cid,
                    "rank": opp.get("rank"),
                    "tier": tier,
                    "previous_tier": prev_tier if prev else None,
                    "pain_point": opp.get("pain_point"),
                    "product_opportunity": opp.get("product_opportunity"),
                    "composite_score": (opp.get("scores") or {}).get("composite"),
                    "review_count": opp.get("review_count"),
                    "status": "new" if is_new else "upgraded",
                    "confidence": conf,
                }
            )

    new_or_upgraded.sort(key=lambda x: x.get("rank") or 999)
    return new_or_upgraded[:10]


def build_prioritization_highlights(prioritization: Dict[str, Any]) -> Dict[str, Any]:
    matrix = prioritization.get("prioritization_matrix") or []
    critical_high = [
        a for a in matrix if a.get("tier") in ("Critical", "High")
    ][:8]
    highlights = []
    for action in critical_high:
        evidence = action.get("evidence") or {}
        conf = compute_confidence(
            evidence.get("frequency") or action.get("review_count") or 0,
            avg_severity=evidence.get("avg_severity"),
            quote_count=len(evidence.get("quotes") or []),
            has_cluster_insight=bool(evidence.get("cluster_ids")),
        )
        highlights.append(
            {
                "rank": action.get("rank"),
                "tier": action.get("tier"),
                "type": action.get("type"),
                "title": action.get("title"),
                "recommendation": action.get("recommendation"),
                "confidence": conf,
            }
        )
    return {
        "tier_summary": prioritization.get("tier_summary") or {},
        "top_priority": prioritization.get("top_priority"),
        "highlights": highlights,
    }


def build_confidence_summary(sections: Dict[str, Any]) -> Dict[str, Any]:
    counts = {"High": 0, "Medium": 0, "Low": 0}
    by_section: Dict[str, str] = {}

    for ans in sections.get("problem_statement_summary", {}).get("answers", []):
        level = ans.get("confidence", {}).get("level", "Low")
        counts[level] = counts.get(level, 0) + 1
        by_section[f"problem_{ans.get('question_id')}"] = level

    for opp in sections.get("new_opportunities") or []:
        level = opp.get("confidence", {}).get("level", "Low")
        counts[level] = counts.get(level, 0) + 1

    for hl in sections.get("prioritization_highlights", {}).get("highlights") or []:
        level = hl.get("confidence", {}).get("level", "Low")
        counts[level] = counts.get(level, 0) + 1
        by_section[f"action_{hl.get('rank')}"] = level

    overall = "High" if counts["High"] >= counts["Medium"] else "Medium" if counts["Medium"] > 0 else "Low"
    return {"overall": overall, "counts": counts, "by_section": by_section}


def build_executive_summary(
    problem: Dict[str, Any],
    prioritization: Dict[str, Any],
    emerging: List[Dict[str, Any]],
    theme_shifts: List[Dict[str, Any]],
    new_opportunities: List[Dict[str, Any]],
) -> Dict[str, Any]:
    top_priority = prioritization.get("top_priority") or {}
    total = problem.get("total_reviews_analyzed") or prioritization.get("total_reviews_analyzed") or 0

    answers = problem.get("answers") or []
    rec_answer = next((a for a in answers if a.get("question_id") == "recommendation_frustrations"), answers[0] if answers else {})
    sb = (rec_answer.get("supporting_metrics") or {}).get("sentiment_breakdown") or {}

    narrative_parts = [
        f"This week analyzed **{total:,}** user reviews.",
    ]
    if top_priority.get("title"):
        narrative_parts.append(
            f"Top priority: **{top_priority.get('tier', 'Critical')}** — {top_priority.get('title')}."
        )
    if emerging:
        narrative_parts.append(
            f"**{len(emerging)}** emerging complaint(s) flagged vs. the prior period."
        )
    if theme_shifts:
        top_shift = theme_shifts[0]
        narrative_parts.append(
            f"Largest theme shift: **{top_shift['theme']}** ({top_shift['change_pct']:+.1f}%)."
        )
    if new_opportunities:
        narrative_parts.append(
            f"**{len(new_opportunities)}** new or upgraded product opportunity(ies) identified."
        )
    if sb.get("negative_pct") is not None:
        narrative_parts.append(f"Overall negative sentiment: **{sb['negative_pct']}%**.")

    quotes: List[str] = []
    if top_priority.get("evidence", {}).get("quotes"):
        quotes.extend(top_priority["evidence"]["quotes"][:2])
    for ans in answers:
        quotes.extend(ans.get("representative_quotes") or [])
        if len(quotes) >= 3:
            break

    return {
        "narrative": " ".join(narrative_parts),
        "quotes": quotes[:3],
        "review_count": total,
        "negative_pct": sb.get("negative_pct", 0),
    }


def generate_weekly_report(
    payloads: Dict[str, Any],
    prior_payloads: Optional[Dict[str, Any]] = None,
    week_start: Optional[str] = None,
    week_end: Optional[str] = None,
) -> Dict[str, Any]:
    """Build structured Phase 5.1 weekly report from Phase 3 payloads."""
    if not week_start or not week_end:
        week_start, week_end = _week_bounds()

    problem = payloads.get("problem_statement_insights") or {}
    prioritization = payloads.get("insight_prioritization") or {}
    opportunities = payloads.get("opportunity_scores") or {}
    prior = prior_payloads or {}

    prior_prior = dict(prior.get("insight_prioritization") or {})
    prior_prior["_problem"] = prior.get("problem_statement_insights") or {}

    curr_prior = dict(prioritization)
    curr_prior["_problem"] = problem

    theme_shifts = build_theme_shifts(problem, prior.get("problem_statement_insights") or {})
    emerging = build_emerging_complaints(prioritization, prior.get("insight_prioritization") or {})
    segment_changes = build_segment_changes(curr_prior, prior_prior)
    new_opportunities = build_new_opportunities(opportunities, prior.get("opportunity_scores") or {})

    sections = {
        "problem_statement_summary": build_problem_statement_summary(problem),
        "emerging_complaints": emerging,
        "theme_shifts": theme_shifts,
        "segment_changes": segment_changes,
        "new_opportunities": new_opportunities,
        "prioritization_highlights": build_prioritization_highlights(prioritization),
    }
    sections["confidence_summary"] = build_confidence_summary(sections)
    sections["executive_summary"] = build_executive_summary(
        problem, prioritization, emerging, theme_shifts, new_opportunities
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "week_start": week_start,
        "week_end": week_end,
        "prior_week_start": prior.get("week_start"),
        "total_reviews_analyzed": problem.get("total_reviews_analyzed")
        or prioritization.get("total_reviews_analyzed")
        or 0,
        "sections": sections,
    }


def build_markdown_report(report: Dict[str, Any]) -> str:
    s = report.get("sections") or {}
    conf = s.get("confidence_summary") or {}
    exec_sum = s.get("executive_summary") or {}
    lines = [
        "# Weekly Intelligence Report (Phase 5.1)",
        "",
        f"**Week:** {report.get('week_start')} → {report.get('week_end')}",
        f"**Generated:** {report.get('generated_at', '')}",
        f"**Reviews analyzed:** {report.get('total_reviews_analyzed', 0):,}",
        f"**Overall confidence:** {conf.get('overall', 'Medium')} "
        f"(High: {conf.get('counts', {}).get('High', 0)}, "
        f"Medium: {conf.get('counts', {}).get('Medium', 0)}, "
        f"Low: {conf.get('counts', {}).get('Low', 0)})",
        "",
        "## Executive Summary",
        "",
        exec_sum.get("narrative", ""),
        "",
    ]
    for q in exec_sum.get("quotes") or []:
        lines.append(f'> "{q}"')
        lines.append("")

    lines.extend(["## Problem Statement Highlights", ""])
    for ans in (s.get("problem_statement_summary") or {}).get("answers", [])[:6]:
        lines.append(f"### {ans.get('question', 'Insight')}")
        lines.append("")
        lines.append(ans.get("finding_summary", ""))
        lines.append("")
        lines.append(f"*Confidence: {ans.get('confidence', {}).get('level', 'Medium')}*")
        lines.append("")

    lines.extend(["## Emerging Complaints", ""])
    emerging = s.get("emerging_complaints") or []
    if not emerging:
        lines.append("_No significant emerging complaints vs. prior week._")
    else:
        for item in emerging[:8]:
            label = item.get("pain_point") or item.get("theme") or "Issue"
            lines.append(
                f"- **{label[:80]}** — {item.get('change_pct', 0):+.1f}% "
                f"({item.get('previous_count', 0)} → {item.get('current_count', 0)})"
            )
    lines.append("")

    lines.extend(["## Theme Shifts", ""])
    for shift in (s.get("theme_shifts") or [])[:8]:
        arrow = "↑" if shift.get("direction") == "up" else "↓"
        lines.append(
            f"- {arrow} **{shift['theme']}** — {shift['change_pct']:+.1f}% "
            f"({shift.get('previous_count', 0)} → {shift.get('current_count', 0)})"
        )
    lines.append("")

    lines.extend(["## Segment Changes (Five Lenses)", ""])
    seg = s.get("segment_changes") or {}
    for lens in ("business", "engagement", "behavior", "context", "pain"):
        lines.append(f"### {lens.title()}")
        for row in (seg.get(lens) or [])[:5]:
            delta = row.get("friction_delta", 0)
            lines.append(
                f"- **{row['segment']}** — friction {row.get('current_friction', 0):.3f} "
                f"({delta:+.3f} vs prior)"
            )
        lines.append("")

    lines.extend(["## New & Upgraded Opportunities", ""])
    for opp in (s.get("new_opportunities") or [])[:6]:
        lines.append(
            f"- **[{opp.get('tier')}]** {opp.get('pain_point', '')[:100]}… "
            f"({opp.get('status')})"
        )
    lines.append("")

    lines.extend(["## Prioritization Highlights", ""])
    for hl in (s.get("prioritization_highlights") or {}).get("highlights") or []:
        lines.append(f"- **[{hl.get('tier')}]** {hl.get('title', '')[:120]}")
    lines.append("")

    return "\n".join(lines)


def save_results(report: Dict[str, Any], output_path: str = DEFAULT_OUTPUT_FILE) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    logger.info("Saved weekly report to %s", output_path)
    return output_path


def save_to_weekly_insights(report: Dict[str, Any], markdown: str) -> bool:
    client = get_supabase_client()
    if not client:
        return False

    week_start = report.get("week_start")
    week_end = report.get("week_end")

    try:
        existing = (
            client.table("weekly_insights")
            .select("id, top_themes")
            .eq("week_start", week_start)
            .limit(1)
            .execute()
        )
        top_themes = _normalize_top_themes(existing.data[0].get("top_themes")) if existing.data else {}
        top_themes["weekly_report"] = report

        if existing.data:
            client.table("weekly_insights").update(
                {"top_themes": top_themes, "pulse_report_md": markdown}
            ).eq("id", existing.data[0]["id"]).execute()
        else:
            client.table("weekly_insights").insert(
                {
                    "week_start": week_start,
                    "week_end": week_end,
                    "top_themes": top_themes,
                    "pulse_report_md": markdown,
                }
            ).execute()
        logger.info("Saved Phase 5.1 weekly report to weekly_insights.")
        return True
    except Exception as exc:
        logger.error("Could not save weekly report to Supabase: %s", exc)
        return False


def run_weekly_report_generator(
    save_supabase: bool = True,
    output_path: str = DEFAULT_OUTPUT_FILE,
) -> Dict[str, Any]:
    """Phase 5.1 entry point."""
    client = get_supabase_client() if save_supabase else None
    week_start, week_end = _week_bounds()

    payloads = load_phase3_payloads(client=client)
    if not any(payloads.values()):
        logger.error("No Phase 3 payloads found. Run Phase 3 engines first.")
        return {}

    prior = load_prior_week_payloads(client, week_start) if client else {}
    report = generate_weekly_report(payloads, prior, week_start, week_end)
    markdown = build_markdown_report(report)

    save_results(report, output_path)
    if save_supabase and client:
        save_to_weekly_insights(report, markdown)

    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 5.1 — Weekly Report Generator")
    parser.add_argument("--no-supabase", action="store_true")
    parser.add_argument("--output", type=str, default=DEFAULT_OUTPUT_FILE)
    args = parser.parse_args()

    result = run_weekly_report_generator(
        save_supabase=not args.no_supabase,
        output_path=args.output,
    )
    if result:
        s = result.get("sections") or {}
        print("\n--- Phase 5.1 Summary ---")
        print(f"  Week              : {result.get('week_start')} to {result.get('week_end')}")
        print(f"  Reviews analyzed  : {result.get('total_reviews_analyzed', 0):,}")
        print(f"  Emerging issues   : {len(s.get('emerging_complaints') or [])}")
        print(f"  Theme shifts      : {len(s.get('theme_shifts') or [])}")
        print(f"  New opportunities : {len(s.get('new_opportunities') or [])}")
        print(f"  Confidence        : {s.get('confidence_summary', {}).get('overall')}")
