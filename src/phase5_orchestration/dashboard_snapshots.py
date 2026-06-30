"""
Phase 4 dashboard snapshot builder for Phase 5.2 orchestration.

Validates Phase 3 payloads and writes a consolidated snapshot with
five-level segmentation aggregates and confidence metadata for the Next.js dashboard.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase5_orchestration.weekly_insights_store import merge_top_themes_for_week
from src.phase5_orchestration.weekly_report_generator import (
    BUSINESS_MAP,
    ENGAGEMENT_TIERS,
    OUTPUT_DIR,
    load_phase3_payloads,
)

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "dashboard_snapshot.json")

REQUIRED_PAYLOAD_KEYS = (
    "problem_statement_insights",
    "segment_deep_dives",
    "opportunity_scores",
    "insight_prioritization",
)


def _segment_friction_rows(prioritization: Dict[str, Any]) -> List[Dict[str, Any]]:
    return list(prioritization.get("segment_friction_scores") or [])


def _business_lens(segment_scores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for biz_name, linked_segments in BUSINESS_MAP.items():
        matched = [s for s in segment_scores if s.get("segment") in linked_segments]
        if not matched:
            continue
        review_count = sum(int(s.get("review_count") or 0) for s in matched)
        friction = max(float(s.get("friction_score") or 0) for s in matched)
        rows.append(
            {
                "lens": "business",
                "name": biz_name,
                "review_count": review_count,
                "friction_score": round(friction, 3),
            }
        )
    return sorted(rows, key=lambda r: r["friction_score"], reverse=True)


def _engagement_lens(segment_scores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for tier in ENGAGEMENT_TIERS:
        matched = [s for s in segment_scores if s.get("segment") in tier["segments"]]
        if not matched:
            continue
        review_count = sum(int(s.get("review_count") or 0) for s in matched)
        friction = max(float(s.get("friction_score") or 0) for s in matched)
        rows.append(
            {
                "lens": "engagement",
                "name": tier["name"],
                "review_count": review_count,
                "friction_score": round(friction, 3),
            }
        )
    return sorted(rows, key=lambda r: r["friction_score"], reverse=True)


def _behavior_lens(segment_scores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "lens": "behavior",
            "name": row.get("segment"),
            "review_count": row.get("review_count"),
            "friction_score": row.get("friction_score"),
            "negative_pct": row.get("negative_pct"),
        }
        for row in sorted(
            segment_scores,
            key=lambda r: float(r.get("friction_score") or 0),
            reverse=True,
        )
    ]


def _pain_lens(prioritization: Dict[str, Any]) -> List[Dict[str, Any]]:
    return list(prioritization.get("top_pain_points") or [])[:10]


def _context_lens(deep_dives: Dict[str, Any]) -> List[Dict[str, Any]]:
    segments = deep_dives.get("segments") or []
    rows: List[Dict[str, Any]] = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        rows.append(
            {
                "lens": "context",
                "name": seg.get("segment"),
                "review_count": seg.get("review_count"),
                "negative_pct": seg.get("negative_pct"),
                "top_themes": seg.get("top_themes") or [],
            }
        )
    return rows


def build_dashboard_snapshot(payloads: Dict[str, Any]) -> Dict[str, Any]:
    """Build five-level segmentation snapshot from Phase 3 payloads."""
    prioritization = payloads.get("insight_prioritization") or {}
    deep_dives = payloads.get("segment_deep_dives") or {}
    problem = payloads.get("problem_statement_insights") or {}
    opportunities = payloads.get("opportunity_scores") or {}

    segment_scores = _segment_friction_rows(prioritization)
    review_count = int(
        prioritization.get("total_reviews_analyzed")
        or problem.get("total_reviews_analyzed")
        or 0
    )

    opp_count = len(opportunities.get("opportunities") or [])
    if review_count >= 1000 and opp_count >= 3:
        overall = "High"
    elif review_count >= 100:
        overall = "Medium"
    else:
        overall = "Low"
    confidence = {
        "overall": overall,
        "review_count": review_count,
        "opportunity_count": opp_count,
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_reviews_analyzed": review_count,
        "five_level_segmentation": {
            "business": _business_lens(segment_scores),
            "engagement": _engagement_lens(segment_scores),
            "behavior": _behavior_lens(segment_scores),
            "context": _context_lens(deep_dives),
            "pain": _pain_lens(prioritization),
        },
        "confidence_metadata": confidence,
        "payload_keys_present": [k for k in REQUIRED_PAYLOAD_KEYS if payloads.get(k)],
    }


def validate_phase3_payloads(payloads: Dict[str, Any]) -> List[str]:
    """Return list of missing required payload keys."""
    missing = []
    for key in REQUIRED_PAYLOAD_KEYS:
        value = payloads.get(key)
        if not value:
            missing.append(key)
    return missing


def save_snapshot_local(snapshot: Dict[str, Any], output_path: str = DEFAULT_OUTPUT_FILE) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2)
    logger.info("Saved dashboard snapshot to %s", output_path)
    return output_path


def run_dashboard_snapshots(
    save_supabase: bool = True,
    output_path: str = DEFAULT_OUTPUT_FILE,
) -> Dict[str, Any]:
    """Phase 4 entry point: validate payloads and build dashboard snapshot."""
    client = get_supabase_client() if save_supabase else None
    payloads = load_phase3_payloads(client=client)
    missing = validate_phase3_payloads(payloads)
    if missing:
        raise RuntimeError(
            f"Missing Phase 3 payloads required for dashboard: {', '.join(missing)}. "
            "Run Phase 3 engines first."
        )

    snapshot = build_dashboard_snapshot(payloads)
    snapshot["validation"] = {"status": "ok", "missing_keys": []}
    save_snapshot_local(snapshot, output_path)

    if save_supabase and client:
        md = (
            "## Dashboard Snapshot\n\n"
            f"- Reviews analyzed: {snapshot['total_reviews_analyzed']:,}\n"
            f"- Confidence: {snapshot['confidence_metadata'].get('overall')}\n"
        )
        merge_top_themes_for_week(client, "dashboard_snapshot", snapshot, md)
        logger.info("Merged dashboard snapshot into weekly_insights.top_themes.")

    return snapshot
