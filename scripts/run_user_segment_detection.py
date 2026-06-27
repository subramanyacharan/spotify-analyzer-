"""Run Phase 2.4: User Segment Detection."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase2_analysis.user_segment_detection import run_user_segment_detection

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.4 — User Segment Detection")
    parser.add_argument("--resegment-all", action="store_true")
    args = parser.parse_args()

    result = run_user_segment_detection(skip_segmented=not args.resegment_all)

    print("\n--- Phase 2.4 Summary ---")
    for key, value in result.items():
        print(f"  {key}: {value}")
