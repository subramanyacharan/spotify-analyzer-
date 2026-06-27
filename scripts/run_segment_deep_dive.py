"""Run Phase 3.2: Segment Deep-Dive Engine."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase3_knowledge.problem_statement_engine import QueryFilters
from src.phase3_knowledge.segment_deep_dive import run_segment_deep_dive_engine

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.2 — Segment Deep-Dive Engine")
    parser.add_argument("--source", type=str, default=None)
    parser.add_argument("--date-start", type=str, default=None)
    parser.add_argument("--date-end", type=str, default=None)
    parser.add_argument("--no-supabase", action="store_true")
    args = parser.parse_args()

    filt = QueryFilters(
        date_start=args.date_start,
        date_end=args.date_end,
        source=args.source,
    )
    result = run_segment_deep_dive_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.2 Summary ---")
    print(f"  Reviews analyzed : {result['total_reviews_analyzed']:,}")
    print(f"  Segments profiled: {len(result['segment_profiles'])}")
    comp = result["segment_comparison"]
    print(f"  Highest friction : {comp.get('highest_friction_segment')}")
    for profile in result["segment_profiles"]:
        if profile["review_count"] == 0:
            continue
        sb = profile["sentiment_breakdown"]
        print(
            f"\n  {profile['segment']}: {profile['review_count']:,} reviews | "
            f"{sb['negative_pct']}% negative | severity {profile.get('avg_cluster_severity')}"
        )
