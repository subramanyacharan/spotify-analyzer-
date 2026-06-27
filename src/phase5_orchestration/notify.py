"""Optional pipeline notifications (Slack webhook)."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def post_slack_message(webhook_url: str, text: str, blocks: Optional[list] = None) -> bool:
    payload: Dict[str, Any] = {"text": text}
    if blocks:
        payload["blocks"] = blocks

    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return 200 <= response.status < 300
    except urllib.error.URLError as exc:
        logger.error("Slack notification failed: %s", exc)
        return False


def notify_pipeline_result(
    *,
    success: bool,
    pipeline_summary: Dict[str, Any],
    health_report: Dict[str, Any],
    webhook_url: Optional[str] = None,
    dashboard_url: Optional[str] = None,
) -> bool:
    webhook_url = webhook_url or os.environ.get("SLACK_WEBHOOK_URL")
    dashboard_url = dashboard_url or os.environ.get("VERCEL_DASHBOARD_URL")

    status = "SUCCESS" if success and health_report.get("healthy") else "FAILED"
    lines = [
        f"*Weekly pipeline {status}*",
        f"Mode: {pipeline_summary.get('mode', 'n/a')}",
        f"Completed stages: {len(pipeline_summary.get('stages_completed') or [])}",
    ]
    if pipeline_summary.get("stages_failed"):
        lines.append(f"Failed: {pipeline_summary['stages_failed'][0].get('stage')}")
    metrics = health_report.get("metrics") or {}
    lines.append(
        "Reviews: raw={raw:,}, processed={proc:,}".format(
            raw=metrics.get("raw_reviews") or 0,
            proc=metrics.get("processed_reviews") or 0,
        )
    )
    latest = metrics.get("latest_weekly_insights") or {}
    if latest.get("week_start"):
        lines.append(f"Week: {latest['week_start']} to {latest.get('week_end', '?')}")
    if dashboard_url:
        lines.append(f"Dashboard: {dashboard_url}")
    for issue in health_report.get("issues") or []:
        lines.append(f"Issue: {issue}")

    text = "\n".join(lines)
    if not webhook_url:
        logger.info("No SLACK_WEBHOOK_URL — notification skipped.\n%s", text)
        return False

    return post_slack_message(webhook_url, text)
