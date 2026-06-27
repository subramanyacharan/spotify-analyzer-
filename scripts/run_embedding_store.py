"""Run Phase 3.1: ChromaDB Knowledge Layer Embedding Generation."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase3_knowledge.embedding_store import run_embedding_store

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.1 — Knowledge Layer Embeddings")
    parser.add_argument(
        "--window-days",
        type=int,
        default=90,
        help="Rolling window size in days (default: 90)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete and recreate the knowledge collection before embedding",
    )
    args = parser.parse_args()

    result = run_embedding_store(window_days=args.window_days, reset=args.reset)

    print("\n--- Phase 3.1 Summary ---")
    print(f"  Embedding backend     : {result['embedding_backend']}")
    print(f"  Rolling window (days) : {result['window_days']}")
    print(f"  Reviews in window     : {result['reviews_fetched']}")
    print(f"  Embeddings upserted   : {result['embeddings_upserted']}")
    print(f"  Evicted (stale)       : {result['evicted']}")
    print(f"  Collection            : {result['collection_name']}")
    print(f"  Collection count      : {result['collection_count']}")
