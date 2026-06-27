"""Run Phase 2.2: Cluster-Level Theme Classification."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase2_analysis.theme_classification import run_theme_classification_v2

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.2 — Theme Classification")
    parser.add_argument("--no-zero-shot", action="store_true")
    parser.add_argument("--clusters", nargs="+", type=int, default=None)
    args = parser.parse_args()

    result = run_theme_classification_v2(
        use_zero_shot_fallback=not args.no_zero_shot,
        cluster_ids=args.clusters,
    )

    print("\n--- Phase 2.2 Summary ---")
    for key, value in result.items():
        print(f"  {key}: {value}")
