"""Tests for Phase 5.2 pipeline orchestration."""

from unittest.mock import MagicMock, patch

import pytest

from src.phase5_orchestration.checkpoint import (
    init_checkpoint,
    is_stage_complete,
    mark_stage_complete,
    reset_checkpoint,
)
from src.phase5_orchestration.dashboard_snapshots import (
    build_dashboard_snapshot,
    validate_phase3_payloads,
)
from src.phase5_orchestration.pipeline import (
    PipelineConfig,
    STAGE_ORDER,
    _resolve_stage_window,
    run_pipeline,
)


def _sample_payloads():
    return {
        "problem_statement_insights": {"total_reviews_analyzed": 500, "answers": []},
        "segment_deep_dives": {"segments": [{"segment": "Casual Listener", "review_count": 100}]},
        "opportunity_scores": {"opportunities": [{"title": "Fix widgets"}, {"title": "Improve recs"}]},
        "insight_prioritization": {
            "total_reviews_analyzed": 500,
            "segment_friction_scores": [
                {"segment": "Casual Listener", "review_count": 100, "friction_score": 0.7, "negative_pct": 20}
            ],
            "top_pain_points": [{"pain_point": "Ads", "frequency": 50}],
        },
    }


def test_validate_phase3_payloads_detects_missing():
    missing = validate_phase3_payloads({"problem_statement_insights": {}})
    assert "segment_deep_dives" in missing
    assert "opportunity_scores" in missing


def test_build_dashboard_snapshot_includes_five_levels():
    snapshot = build_dashboard_snapshot(_sample_payloads())
    seg = snapshot["five_level_segmentation"]
    assert "business" in seg
    assert "engagement" in seg
    assert "behavior" in seg
    assert "context" in seg
    assert "pain" in seg
    assert snapshot["total_reviews_analyzed"] == 500


def test_checkpoint_tracks_completed_stages(tmp_path):
    path = str(tmp_path / "checkpoint.json")
    cp = init_checkpoint("incremental", path)
    mark_stage_complete(cp, "phase4_snapshots", {"ok": True}, path)
    from src.phase5_orchestration.checkpoint import load_checkpoint

    reloaded = load_checkpoint(path)
    assert is_stage_complete(reloaded, "phase4_snapshots")


def test_resolve_stage_window_from_and_to():
    config = PipelineConfig(from_stage="phase3_problem", to_stage="phase4_snapshots")
    window = _resolve_stage_window(config)
    assert window[0] == "phase3_problem"
    assert window[-1] == "phase4_snapshots"
    assert "phase2_embedding" not in window


@patch("src.phase5_orchestration.pipeline.run_dashboard_snapshots")
@patch("src.phase5_orchestration.pipeline.run_weekly_report_generator")
def test_run_pipeline_executes_tail_stages(mock_report, mock_snapshots, tmp_path):
    mock_snapshots.return_value = {"validation": {"status": "ok"}}
    mock_report.return_value = {"week_start": "2026-06-16", "sections": {}}

    checkpoint_path = str(tmp_path / "checkpoint.json")
    reset_checkpoint(checkpoint_path)

    config = PipelineConfig(
        mode="incremental",
        from_stage="phase4_snapshots",
        to_stage="phase5_weekly_report",
        save_supabase=False,
        use_checkpoint=True,
        checkpoint_path=checkpoint_path,
    )
    summary = run_pipeline(config)

    assert summary["success"] is True
    assert summary["stages_completed"] == ["phase4_snapshots", "phase5_weekly_report"]
    mock_snapshots.assert_called_once()
    mock_report.assert_called_once()


def test_run_pipeline_stops_on_failure(tmp_path):
    checkpoint_path = str(tmp_path / "checkpoint.json")
    reset_checkpoint(checkpoint_path)

    failing_runner = MagicMock(side_effect=RuntimeError("boom"))

    with patch.dict(
        "src.phase5_orchestration.pipeline.STAGE_REGISTRY",
        {
            "phase4_snapshots": MagicMock(
                stage_id="phase4_snapshots",
                label="Phase 4",
                runner=failing_runner,
            )
        },
        clear=False,
    ):
        config = PipelineConfig(
            from_stage="phase4_snapshots",
            to_stage="phase4_snapshots",
            save_supabase=False,
            use_checkpoint=True,
            checkpoint_path=checkpoint_path,
            max_retries=0,
        )
        summary = run_pipeline(config)

    assert summary["success"] is False
    assert summary["stages_failed"][0]["stage"] == "phase4_snapshots"


def test_stage_order_covers_all_phases():
    assert STAGE_ORDER[0].startswith("phase1")
    assert STAGE_ORDER[-1] == "phase5_weekly_report"
    assert len(STAGE_ORDER) == 15
