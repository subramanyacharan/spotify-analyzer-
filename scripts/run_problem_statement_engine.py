"""Run Phase 3.1: Problem Statement Query Engine."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase3_knowledge.problem_statement_engine import (
    QueryFilters,
    run_problem_statement_engine,
)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.1 — Problem Statement Query Engine")
    parser.add_argument("--source", type=str, default=None)
    parser.add_argument("--theme", type=str, default=None)
    parser.add_argument("--sentiment", type=str, default=None)
    parser.add_argument("--segment", type=str, default=None)
    parser.add_argument("--cluster", type=int, default=None)
    parser.add_argument("--date-start", type=str, default=None)
    parser.add_argument("--date-end", type=str, default=None)
    parser.add_argument("--no-supabase", action="store_true")
    args = parser.parse_args()

    filt = QueryFilters(
        date_start=args.date_start,
        date_end=args.date_end,
        source=args.source,
        theme=args.theme,
        sentiment=args.sentiment,
        behavioral_segment=args.segment,
        cluster_id=args.cluster,
    )

    result = run_problem_statement_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.1 Summary ---")
    print(f"  Reviews analyzed : {result['total_reviews_analyzed']:,}")
    print(f"  Questions answered: {len(result['answers'])}")
    for ans in result["answers"]:
        m = ans["supporting_metrics"]
        print(f"\n  [{ans['question_id']}]")
        print(f"    {ans['question']}")
        print(f"    Reviews: {m['review_count']:,} | Negative: {m['sentiment_breakdown']['negative_pct']}%")
        summary = ans["finding_summary"]
        print(f"    Summary: {summary[:140]}{'…' if len(summary) > 140 else ''}")
