"""Run Phase 2.5: Cluster-Level LLM Insight Generation."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase2_analysis.cluster_insights import run_cluster_insight_generation

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.5 — Cluster Insights")
    parser.add_argument("--clusters", nargs="+", type=int, default=None)
    parser.add_argument("--delay", type=float, default=2.0)
    args = parser.parse_args()

    result = run_cluster_insight_generation(
        cluster_ids=args.clusters,
        inter_cluster_delay=args.delay,
    )

    print("\n--- Phase 2.5 Summary ---")
    print(f"  Clusters processed        : {result['clusters_processed']}")
    print(f"  Saved to cluster_insights : {result['clusters_saved_to_supabase']}")
    print(f"  weekly_insights saved     : {result.get('weekly_insights_saved')}")
    print(f"  Total reviews processed   : {result['total_reviews_processed']}")
    print(f"  pain_points propagated    : {result['pain_points_propagated']}")
    for cluster in result.get("cluster_summaries", []):
        print(f"\n  Cluster {cluster['cluster_id']} (severity {cluster['severity']}/5)")
        print(f"    Themes     : {', '.join(cluster['themes'])}")
        print(f"    Pain point : {cluster['pain_point']}")
        print(f"    Opportunity: {cluster['product_opportunity']}")
