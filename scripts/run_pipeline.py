"""Run Phase 5.2: Master Pipeline Orchestration."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase5_orchestration.pipeline import (
    PipelineConfig,
    list_stages,
    reset_pipeline_checkpoint,
    run_pipeline,
)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Phase 5.2 — Master pipeline: ingest -> analyze -> insight -> report"
    )
    parser.add_argument(
        "--mode",
        choices=["full", "incremental"],
        default="incremental",
        help="full: 90-day ingest + reprocess; incremental: 7-day ingest + skip existing",
    )
    parser.add_argument(
        "--from-stage",
        type=str,
        default=None,
        help=f"Resume from stage. Options: {', '.join(list_stages())}",
    )
    parser.add_argument(
        "--to-stage",
        type=str,
        default=None,
        help="Stop after this stage",
    )
    parser.add_argument("--skip-ingest", action="store_true", help="Skip Phase 1.2 ingestion")
    parser.add_argument("--skip-phase1", action="store_true", help="Skip all Phase 1 stages")
    parser.add_argument("--skip-phase2", action="store_true", help="Skip all Phase 2 stages")
    parser.add_argument("--skip-phase3", action="store_true", help="Skip all Phase 3 stages")
    parser.add_argument("--no-supabase", action="store_true", help="Do not write to Supabase")
    parser.add_argument("--no-checkpoint", action="store_true", help="Disable checkpoint/resume")
    parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Clear checkpoint file before running",
    )
    parser.add_argument(
        "--force-stage",
        action="append",
        default=[],
        help="Re-run these stages even if checkpoint marks them complete",
    )
    parser.add_argument("--max-retries", type=int, default=2)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned stages without executing",
    )
    args = parser.parse_args()

    if args.reset_checkpoint:
        reset_pipeline_checkpoint()

    config = PipelineConfig(
        mode=args.mode,
        from_stage=args.from_stage,
        to_stage=args.to_stage,
        skip_phase1=args.skip_phase1,
        skip_phase2=args.skip_phase2,
        skip_phase3=args.skip_phase3,
        skip_ingest=args.skip_ingest,
        save_supabase=not args.no_supabase,
        use_checkpoint=not args.no_checkpoint,
        force_stages=args.force_stage,
        max_retries=args.max_retries,
    )

    if args.dry_run:
        from src.phase5_orchestration.pipeline import _resolve_stage_window, STAGE_REGISTRY

        planned = _resolve_stage_window(config)
        print("\n--- Phase 5.2 Dry Run ---")
        print(f"  Mode     : {config.mode}")
        print(f"  Supabase : {'yes' if config.save_supabase else 'no'}")
        print(f"  Stages   :")
        for stage_id in planned:
            skip = ""
            if stage_id in (args.force_stage or []):
                skip = " (forced)"
            print(f"    - {STAGE_REGISTRY[stage_id].label} [{stage_id}]{skip}")
        sys.exit(0)

    summary = run_pipeline(config)

    print("\n--- Phase 5.2 Pipeline Summary ---")
    print(f"  Mode              : {summary['mode']}")
    print(f"  Run ID            : {summary.get('run_id', 'n/a')}")
    print(f"  Completed         : {len(summary['stages_completed'])} stage(s)")
    for stage_id in summary["stages_completed"]:
        print(f"    + {stage_id}")
    if summary["stages_skipped"]:
        print(f"  Skipped           : {len(summary['stages_skipped'])} stage(s)")
        for stage_id in summary["stages_skipped"]:
            print(f"    - {stage_id}")
    if summary["stages_failed"]:
        print(f"  Failed            : {len(summary['stages_failed'])} stage(s)")
        for failure in summary["stages_failed"]:
            print(f"    ! {failure['stage']}: {failure['error']}")
        sys.exit(1)

    print("  Status            : SUCCESS")
