"""Run Phase 2.3: Sentiment Analysis."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase2_analysis.sentiment_analysis import run_sentiment_analysis

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.3 — Sentiment Analysis")
    parser.add_argument("--rescore-all", action="store_true")
    args = parser.parse_args()

    result = run_sentiment_analysis(skip_scored=not args.rescore_all)

    print("\n--- Phase 2.3 Summary ---")
    for key, value in result.items():
        print(f"  {key}: {value}")
