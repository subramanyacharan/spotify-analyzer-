"""Run Phase 2.1: Embedding Generation & Clustering."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase2_analysis.embedding_clustering import run_embedding_clustering

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.1 — Embedding Generation & Clustering")
    parser.add_argument("--n-clusters", type=int, default=5, help="K-Means clusters (default: 5).")
    parser.add_argument("--method", choices=["kmeans", "dbscan"], default="kmeans")
    parser.add_argument("--no-skip", action="store_true", help="Re-embed all reviews.")
    parser.add_argument("--dbscan-eps", type=float, default=0.3)
    parser.add_argument("--dbscan-min-samples", type=int, default=10)
    args = parser.parse_args()

    result = run_embedding_clustering(
        n_clusters=args.n_clusters,
        clustering_method=args.method,
        skip_existing_embeddings=not args.no_skip,
        dbscan_eps=args.dbscan_eps,
        dbscan_min_samples=args.dbscan_min_samples,
    )

    print("\n--- Phase 2.1 Summary ---")
    for key, value in result.items():
        print(f"  {key}: {value}")
