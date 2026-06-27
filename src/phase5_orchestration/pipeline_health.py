"""
Phase 5.3: Pipeline health monitoring.

Checks Supabase row counts, insight freshness, and latest report status.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase5_orchestration.checkpoint import DEFAULT_CHECKPOINT_PATH, load_checkpoint
from src.phase5_orchestration.weekly_report_generator import (
    OUTPUT_DIR,
    _normalize_top_themes,
    _week_bounds,
    load_phase3_payloads,
)

logger = logging.getLogger(__name__)

DEFAULT_MAX_INSIGHT_AGE_DAYS = 8
REQUIRED_TOP_THEME_KEYS = (
    "problem_statement_insights",
    "segment_deep_dives",
    "opportunity_scores",
    "insight_prioritization",
)
POST_PIPELINE_KEYS = ("dashboard_snapshot", "weekly_report")


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def _table_count(client: Any, table: str) -> Optional[int]:
    try:
        response = client.table(table).select("id", count="exact").limit(1).execute()
        return int(response.count or 0)
    except Exception as exc:
        logger.warning("Could not count %s: %s", table, exc)
        return None


def _latest_weekly_insights_row(client: Any) -> Optional[Dict[str, Any]]:
    try:
        response = (
            client.table("weekly_insights")
            .select("id, week_start, week_end, created_at, top_themes")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as exc:
        logger.warning("Could not load weekly_insights: %s", exc)
        return None


def check_pipeline_health(
    *,
    max_insight_age_days: int = DEFAULT_MAX_INSIGHT_AGE_DAYS,
    checkpoint_path: str = DEFAULT_CHECKPOINT_PATH,
    client: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Return structured health report for the pipeline and dashboard data layer.
    """
    client = client or get_supabase_client()
    now = datetime.now(timezone.utc)
    week_start, week_end = _week_bounds()

    report: Dict[str, Any] = {
        "checked_at": now.isoformat(),
        "current_week": {"start": week_start, "end": week_end},
        "healthy": True,
        "issues": [],
        "metrics": {},
        "checkpoint": {},
    }

    checkpoint = load_checkpoint(checkpoint_path)
    if checkpoint:
        report["checkpoint"] = {
            "run_id": checkpoint.get("run_id"),
            "mode": checkpoint.get("mode"),
            "last_completed": checkpoint.get("last_completed"),
            "completed_stages": checkpoint.get("completed_stages") or [],
            "updated_at": checkpoint.get("updated_at"),
        }
    else:
        report["issues"].append("No pipeline checkpoint file found.")

    if not client:
        report["healthy"] = False
        report["issues"].append("Supabase client unavailable — set SUPABASE_URL and SUPABASE_KEY.")
        return report

    raw_count = _table_count(client, "raw_reviews")
    processed_count = _table_count(client, "processed_reviews")
    insights_count = _table_count(client, "weekly_insights")

    report["metrics"] = {
        "raw_reviews": raw_count,
        "processed_reviews": processed_count,
        "weekly_insights_rows": insights_count,
    }

    if raw_count == 0:
        report["healthy"] = False
        report["issues"].append("raw_reviews table is empty.")
    if processed_count == 0:
        report["healthy"] = False
        report["issues"].append("processed_reviews table is empty.")

    latest = _latest_weekly_insights_row(client)
    if not latest:
        report["healthy"] = False
        report["issues"].append("No weekly_insights rows found.")
        return report

    created_at = _parse_timestamp(latest.get("created_at"))
    age_days: Optional[float] = None
    if created_at:
        age_days = (now - created_at).total_seconds() / 86400

    top_themes = _normalize_top_themes(latest.get("top_themes"))
    payloads = load_phase3_payloads(client=client, top_themes=top_themes)
    missing_phase3 = [key for key in REQUIRED_TOP_THEME_KEYS if not payloads.get(key)]
    missing_post = [key for key in POST_PIPELINE_KEYS if not top_themes.get(key)]

    report["metrics"]["latest_weekly_insights"] = {
        "id": latest.get("id"),
        "week_start": latest.get("week_start"),
        "week_end": latest.get("week_end"),
        "created_at": latest.get("created_at"),
        "age_days": round(age_days, 2) if age_days is not None else None,
        "top_theme_keys": sorted(top_themes.keys()),
        "missing_phase3_keys": missing_phase3,
        "missing_post_pipeline_keys": missing_post,
    }

    if missing_phase3:
        report["healthy"] = False
        report["issues"].append(f"Missing Phase 3 payloads: {', '.join(missing_phase3)}")

    if missing_post:
        report["issues"].append(
            f"Latest row missing post-pipeline keys (non-fatal if prior run): {', '.join(missing_post)}"
        )

    if age_days is not None and age_days > max_insight_age_days:
        report["healthy"] = False
        report["issues"].append(
            f"Latest weekly_insights row is {age_days:.1f} days old "
            f"(max allowed: {max_insight_age_days})."
        )

    weekly_report = top_themes.get("weekly_report") or {}
    weekly_report_path = os.path.join(OUTPUT_DIR, "weekly_report.json")
    if not weekly_report and os.path.isfile(weekly_report_path):
        try:
            with open(weekly_report_path, encoding="utf-8") as handle:
                weekly_report = json.load(handle)
        except (OSError, json.JSONDecodeError):
            weekly_report = {}
    if isinstance(weekly_report, dict):
        report["metrics"]["weekly_report"] = {
            "total_reviews_analyzed": weekly_report.get("total_reviews_analyzed"),
            "week_start": weekly_report.get("week_start"),
            "week_end": weekly_report.get("week_end"),
        }

    return report


def format_health_summary(report: Dict[str, Any]) -> str:
    """Human-readable health summary for logs and notifications."""
    lines = [
        f"Pipeline health: {'OK' if report.get('healthy') else 'UNHEALTHY'}",
        f"Checked at: {report.get('checked_at')}",
    ]
    metrics = report.get("metrics") or {}
    lines.append(
        "Counts: raw_reviews={raw}, processed_reviews={proc}, weekly_insights={wi}".format(
            raw=metrics.get("raw_reviews", "n/a"),
            proc=metrics.get("processed_reviews", "n/a"),
            wi=metrics.get("weekly_insights_rows", "n/a"),
        )
    )

    latest = metrics.get("latest_weekly_insights") or {}
    if latest:
        lines.append(
            "Latest insight: week {start} to {end}, age {age} days".format(
                start=latest.get("week_start", "?"),
                end=latest.get("week_end", "?"),
                age=latest.get("age_days", "?"),
            )
        )

    checkpoint = report.get("checkpoint") or {}
    if checkpoint.get("last_completed"):
        lines.append(f"Last pipeline stage: {checkpoint['last_completed']}")

    for issue in report.get("issues") or []:
        lines.append(f"Issue: {issue}")

    return "\n".join(lines)


def save_health_report(report: Dict[str, Any], output_path: Optional[str] = None) -> str:
    path = output_path or os.path.join(project_root, "data", "outputs", "pipeline_health.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    return path
