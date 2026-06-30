"""Shared helpers for merging Phase 3/4/5 payloads into weekly_insights."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

FULL_CORPUS_RATIO = 0.95


def payload_review_count(payload: Dict[str, Any]) -> int:
    value = payload.get("total_reviews_analyzed")
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    return 0


def looks_like_full_corpus_count(count: int, client: Any) -> bool:
    """True when a payload count matches the entire processed_reviews table."""
    if count <= 0:
        return False
    try:
        response = (
            client.table("processed_reviews")
            .select("id", count="exact", head=True)
            .execute()
        )
        total = response.count or 0
        return total > 0 and count >= total * FULL_CORPUS_RATIO
    except Exception as exc:
        logger.warning("Could not validate corpus count against Supabase: %s", exc)
        return count >= 120_000


def current_week_bounds(reference: Optional[datetime] = None) -> tuple[str, str]:
    today = (reference or datetime.now(timezone.utc)).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start.isoformat(), week_end.isoformat()


def normalize_top_themes(raw: Any) -> Dict[str, Any]:
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


def merge_top_themes_for_week(
    client: Any,
    key: str,
    payload: Dict[str, Any],
    md: str,
    *,
    allow_full_corpus: bool = False,
) -> bool:
    """
    Upsert one Phase 3/4/5 payload into the current week's weekly_insights row.

    Rejects payloads whose total_reviews_analyzed equals the full DB corpus
    unless allow_full_corpus=True (never for routine weekly writes).
    """
    count = payload_review_count(payload)
    if count > 0 and not allow_full_corpus and looks_like_full_corpus_count(count, client):
        logger.error(
            "Refusing to save %s with full-corpus review count %s — "
            "Phase 3 must use the 90-day analysis window (default_analysis_filters).",
            key,
            f"{count:,}",
        )
        return False

    week_start, week_end = current_week_bounds()

    existing = (
        client.table("weekly_insights")
        .select("id, top_themes, pulse_report_md")
        .eq("week_start", week_start)
        .limit(1)
        .execute()
    )

    if existing.data:
        row = existing.data[0]
        top_themes = normalize_top_themes(row.get("top_themes"))
        top_themes[key] = payload
        combined_md = (row.get("pulse_report_md") or "") + "\n\n---\n\n" + md
        client.table("weekly_insights").update(
            {"top_themes": top_themes, "pulse_report_md": combined_md}
        ).eq("id", row["id"]).execute()
    else:
        client.table("weekly_insights").insert(
            {
                "week_start": week_start,
                "week_end": week_end,
                "top_themes": {key: payload},
                "pulse_report_md": md,
            }
        ).execute()
    return True
