"""Run Phase 5.1: Automated Weekly Report Generation."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase5_orchestration.weekly_report_generator import run_weekly_report_generator

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 5.1 — Weekly Report Generator")
    parser.add_argument("--no-supabase", action="store_true")
    parser.add_argument(
        "--output",
        type=str,
        default=os.path.join(project_root, "data", "outputs", "weekly_report.json"),
    )
    args = parser.parse_args()

    result = run_weekly_report_generator(
        save_supabase=not args.no_supabase,
        output_path=args.output,
    )

    if result:
        sections = result.get("sections") or {}
        print("\n--- Phase 5.1 Summary ---")
        print(f"  Week              : {result.get('week_start')} to {result.get('week_end')}")
        print(f"  Reviews analyzed  : {result.get('total_reviews_analyzed', 0):,}")
        print(f"  Emerging issues   : {len(sections.get('emerging_complaints') or [])}")
        print(f"  Theme shifts      : {len(sections.get('theme_shifts') or [])}")
        print(f"  New opportunities : {len(sections.get('new_opportunities') or [])}")
        conf = sections.get("confidence_summary") or {}
        print(f"  Confidence        : {conf.get('overall')} {conf.get('counts')}")
