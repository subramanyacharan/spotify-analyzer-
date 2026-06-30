"""
Phase 5.3 scheduled pipeline entry point.

Used by GitHub Actions (and local cron) for the weekly Sunday run:
  ingest -> analyze -> insight -> dashboard snapshot -> weekly report -> health check
"""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase5_orchestration.notify import notify_pipeline_result
from src.phase5_orchestration.pipeline import PipelineConfig, reset_pipeline_checkpoint, run_pipeline
from src.phase5_orchestration.pipeline_health import (
    check_pipeline_health,
    format_health_summary,
    save_health_report,
)

PHASE3_STAGES = (
    "phase3_problem",
    "phase3_deep_dive",
    "phase3_opportunities",
    "phase3_prioritization",
)

BUNDLED_OUTPUT_FILES = (
    "weekly_report.json",
    "dashboard_snapshot.json",
    "insight_prioritization.json",
    "segment_deep_dives.json",
    "opportunity_scores.json",
    "problem_statement_insights.json",
)


def sync_frontend_bundled_outputs() -> None:
    """Copy Phase 3/5 JSON outputs into frontend/data/outputs for Vercel fallback."""
    import shutil

    src_dir = os.path.join(project_root, "data", "outputs")
    dst_dir = os.path.join(project_root, "frontend", "data", "outputs")
    os.makedirs(dst_dir, exist_ok=True)
    for name in BUNDLED_OUTPUT_FILES:
        source = os.path.join(src_dir, name)
        if os.path.isfile(source):
            shutil.copy2(source, os.path.join(dst_dir, name))

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 5.3 — Scheduled weekly pipeline")
    parser.add_argument(
        "--mode",
        choices=["full", "incremental"],
        default="incremental",
        help="incremental for weekly runs (7-day ingest); full for initial bulk",
    )
    parser.add_argument("--no-supabase", action="store_true")
    parser.add_argument("--skip-notify", action="store_true")
    parser.add_argument("--max-retries", type=int, default=2)
    args = parser.parse_args()

    reset_pipeline_checkpoint()

    config = PipelineConfig(
        mode=args.mode,
        save_supabase=not args.no_supabase,
        use_checkpoint=True,
        max_retries=args.max_retries,
        force_stages=PHASE3_STAGES,
    )

    summary = run_pipeline(config)
    pipeline_ok = summary.get("success", False)

    if pipeline_ok:
        sync_frontend_bundled_outputs()

    health = check_pipeline_health()
    health_path = save_health_report(health)
    overall_ok = pipeline_ok and health.get("healthy", False)

    print("\n--- Phase 5.3 Scheduled Run ---")
    print(format_health_summary(health))
    print(f"Health report: {health_path}")

    if not args.skip_notify:
        notify_pipeline_result(
            success=overall_ok,
            pipeline_summary=summary,
            health_report=health,
        )

    if not pipeline_ok:
        print("\nPipeline failed — see stage errors above.")
        sys.exit(1)
    if not health.get("healthy"):
        print("\nPipeline completed but health check failed.")
        sys.exit(1)

    print("\nStatus: SUCCESS")
