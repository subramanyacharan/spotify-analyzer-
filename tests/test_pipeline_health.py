"""Tests for Phase 5.3 pipeline health monitoring."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from src.phase5_orchestration.pipeline_health import (
    check_pipeline_health,
    format_health_summary,
)


def _mock_client(*, raw=100, processed=90, insights=3, latest_row=None):
    client = MagicMock()

    def table_side_effect(name):
        table = MagicMock()
        if name == "raw_reviews":
            table.select.return_value.limit.return_value.execute.return_value = MagicMock(count=raw)
        elif name == "processed_reviews":
            table.select.return_value.limit.return_value.execute.return_value = MagicMock(count=processed)
        elif name == "weekly_insights" and latest_row is None:
            table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                count=insights, data=[]
            )
        elif name == "weekly_insights":
            table.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
                count=insights, data=[latest_row]
            )
        else:
            table.select.return_value.limit.return_value.execute.return_value = MagicMock(count=0)
        return table

    client.table.side_effect = table_side_effect
    return client


def test_health_unhealthy_without_weekly_insights(tmp_path):
    checkpoint = tmp_path / "checkpoint.json"
    report = check_pipeline_health(
        client=_mock_client(),
        checkpoint_path=str(checkpoint),
    )
    assert report["healthy"] is False
    assert any("weekly_insights" in issue for issue in report["issues"])


def test_health_ok_with_fresh_insights(tmp_path):
    now = datetime.now(timezone.utc)
    latest = {
        "id": 1,
        "week_start": "2026-06-16",
        "week_end": "2026-06-22",
        "created_at": now.isoformat(),
        "top_themes": {
            "dashboard_snapshot": {"total_reviews_analyzed": 100},
            "weekly_report": {"total_reviews_analyzed": 100, "week_start": "2026-06-16"},
        },
    }
    payloads = {
        "problem_statement_insights": {"total_reviews_analyzed": 100},
        "segment_deep_dives": {"segments": []},
        "opportunity_scores": {"opportunities": []},
        "insight_prioritization": {"total_reviews_analyzed": 100},
    }
    with patch(
        "src.phase5_orchestration.pipeline_health.load_phase3_payloads",
        return_value=payloads,
    ):
        report = check_pipeline_health(
            client=_mock_client(latest_row=latest),
            checkpoint_path=str(tmp_path / "missing.json"),
            max_insight_age_days=8,
        )
    assert report["healthy"] is True
    assert report["metrics"]["raw_reviews"] == 100


def test_health_fails_on_stale_insights(tmp_path):
    stale = datetime.now(timezone.utc) - timedelta(days=10)
    latest = {
        "id": 1,
        "week_start": "2026-06-01",
        "week_end": "2026-06-07",
        "created_at": stale.isoformat(),
        "top_themes": {"weekly_report": {}},
    }
    payloads = {
        "problem_statement_insights": {"total_reviews_analyzed": 100},
        "segment_deep_dives": {"segments": []},
        "opportunity_scores": {"opportunities": []},
        "insight_prioritization": {"total_reviews_analyzed": 100},
    }
    with patch(
        "src.phase5_orchestration.pipeline_health.load_phase3_payloads",
        return_value=payloads,
    ):
        report = check_pipeline_health(
            client=_mock_client(latest_row=latest),
            checkpoint_path=str(tmp_path / "missing.json"),
            max_insight_age_days=8,
        )
    assert report["healthy"] is False
    assert any("days old" in issue for issue in report["issues"])


def test_format_health_summary_includes_status():
    text = format_health_summary({"healthy": True, "checked_at": "2026-06-27", "metrics": {}, "issues": []})
    assert "Pipeline health: OK" in text
