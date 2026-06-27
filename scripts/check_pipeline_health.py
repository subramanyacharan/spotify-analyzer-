"""Run Phase 5.3 pipeline health check."""

import json
import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase5_orchestration.pipeline_health import (
    check_pipeline_health,
    format_health_summary,
    save_health_report,
)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 5.3 — Pipeline health check")
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=8,
        help="Fail if latest weekly_insights is older than this many days",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join(project_root, "data", "outputs", "pipeline_health.json"),
    )
    parser.add_argument("--json", action="store_true", help="Print full JSON report")
    args = parser.parse_args()

    report = check_pipeline_health(max_insight_age_days=args.max_age_days)
    save_health_report(report, args.output)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(format_health_summary(report))
        print(f"\nSaved: {args.output}")

    sys.exit(0 if report.get("healthy") else 1)
