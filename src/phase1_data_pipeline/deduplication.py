import hashlib
import json
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

import pandas as pd
from datasketch import MinHash, MinHashLSH

from src.phase1_data_pipeline.data_sanitization import (
    DEFAULT_SANITIZED_PATH,
    load_reviews_from_jsonl,
)
from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_DEDUPED_PATH = os.path.join(project_root, "data", "processed", "deduplicated_reviews.jsonl")
MIN_REVIEW_LENGTH = 10
FUZZY_JACCARD_THRESHOLD = 0.85
MINHASH_PERMUTATIONS = 128
SHINGLE_SIZE = 3
SUPABASE_BATCH_SIZE = 500


def normalize_for_hash(text: str) -> str:
    """Normalize text for exact-match hashing."""
    return re.sub(r"\s+", " ", text.lower()).strip()


def review_text_hash(text: str) -> str:
    """Generate a SHA-256 hash of normalized review text."""
    return hashlib.sha256(normalize_for_hash(text).encode("utf-8")).hexdigest()


def get_shingles(text: str, shingle_size: int = SHINGLE_SIZE) -> Set[str]:
    """Build word shingles for MinHash similarity."""
    normalized = normalize_for_hash(text)
    words = normalized.split()

    if len(words) < shingle_size:
        return {normalized} if normalized else set()

    return {" ".join(words[index : index + shingle_size]) for index in range(len(words) - shingle_size + 1)}


def build_minhash(text: str, num_perm: int = MINHASH_PERMUTATIONS) -> MinHash:
    """Create a MinHash signature for fuzzy duplicate detection."""
    signature = MinHash(num_perm=num_perm)
    for shingle in get_shingles(text):
        signature.update(shingle.encode("utf-8"))
    return signature


def _review_sort_key(review: Dict[str, Any]) -> Tuple[int, str]:
    """Prefer higher engagement, then earlier date when choosing duplicates."""
    thumbs_up = int(review.get("thumbs_up_count") or 0)
    date_value = review.get("date") or ""
    return (-thumbs_up, date_value)


def _get_dedup_text(review: Dict[str, Any]) -> str:
    return review.get("sanitized_text") or review.get("review_text") or ""


def exact_deduplicate(reviews: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """Remove exact duplicates using a hash of normalized review text."""
    seen_hashes: Dict[str, Dict[str, Any]] = {}
    removed = 0

    for review in reviews:
        text = _get_dedup_text(review)
        text_hash = review_text_hash(text)

        if text_hash in seen_hashes:
            removed += 1
            existing = seen_hashes[text_hash]
            if _review_sort_key(review) < _review_sort_key(existing):
                seen_hashes[text_hash] = review
        else:
            seen_hashes[text_hash] = review

    return list(seen_hashes.values()), removed


def fuzzy_deduplicate(
    reviews: List[Dict[str, Any]],
    threshold: float = FUZZY_JACCARD_THRESHOLD,
) -> Tuple[List[Dict[str, Any]], int]:
    """Remove near-duplicates using MinHash LSH and Jaccard similarity."""
    if not reviews:
        return [], 0

    lsh = MinHashLSH(threshold=threshold, num_perm=MINHASH_PERMUTATIONS)
    signatures: Dict[str, MinHash] = {}
    kept_reviews: List[Dict[str, Any]] = []
    removed = 0

    sorted_reviews = sorted(reviews, key=_review_sort_key)

    for review in sorted_reviews:
        review_key = review.get("review_id") or review.get("raw_review_id") or str(id(review))
        text = _get_dedup_text(review)

        if len(text) < MIN_REVIEW_LENGTH:
            removed += 1
            continue

        signature = build_minhash(text)
        matches = lsh.query(signature)

        if matches:
            removed += 1
            continue

        lsh.insert(review_key, signature)
        signatures[review_key] = signature
        kept_reviews.append(review)

    return kept_reviews, removed


def deduplicate_reviews(
    reviews: List[Dict[str, Any]],
    fuzzy_threshold: float = FUZZY_JACCARD_THRESHOLD,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Run exact then fuzzy deduplication."""
    exact_kept, exact_removed = exact_deduplicate(reviews)
    fuzzy_kept, fuzzy_removed = fuzzy_deduplicate(exact_kept, threshold=fuzzy_threshold)

    stats = {
        "input_count": len(reviews),
        "exact_duplicates_removed": exact_removed,
        "fuzzy_duplicates_removed": fuzzy_removed,
        "output_count": len(fuzzy_kept),
    }
    return fuzzy_kept, stats


def save_deduplicated_reviews(
    reviews: List[Dict[str, Any]], output_path: str = DEFAULT_DEDUPED_PATH
) -> str:
    """Persist deduplicated reviews to JSON Lines and CSV."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as file:
        for review in reviews:
            file.write(json.dumps(review, ensure_ascii=False) + "\n")

    csv_path = os.path.splitext(output_path)[0] + ".csv"
    pd.DataFrame(reviews).to_csv(csv_path, index=False)

    logger.info("Saved %s deduplicated reviews to %s and %s", len(reviews), output_path, csv_path)
    return output_path


def store_processed_reviews_in_supabase(
    reviews: List[Dict[str, Any]], batch_size: int = SUPABASE_BATCH_SIZE
) -> Tuple[int, int]:
    """Store deduplicated reviews in Supabase processed_reviews table."""
    if not reviews:
        logger.warning("No processed reviews to store.")
        return 0, 0

    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    records = []
    for review in reviews:
        text = _get_dedup_text(review)
        if len(text) < MIN_REVIEW_LENGTH:
            continue

        records.append(
            {
                "raw_review_id": review.get("raw_review_id"),
                "cleaned_text": text,
            }
        )

    logger.info("Storing %s processed reviews in Supabase...", len(records))

    success_count = 0
    error_count = 0
    use_upsert = True

    for index in range(0, len(records), batch_size):
        batch = records[index : index + batch_size]
        try:
            if use_upsert:
                client.table("processed_reviews").upsert(batch, on_conflict="raw_review_id").execute()
            else:
                client.table("processed_reviews").insert(batch).execute()
            success_count += len(batch)
            logger.info("Stored batch %s (%s reviews).", index // batch_size + 1, len(batch))
        except Exception as error:
            error_message = str(error)
            if use_upsert and "42P10" in error_message:
                use_upsert = False
                logger.warning(
                    "Unique constraint on raw_review_id not found. Falling back to insert. "
                    "Run the updated supabase_schema.sql migration for idempotent upserts."
                )
                try:
                    client.table("processed_reviews").insert(batch).execute()
                    success_count += len(batch)
                    logger.info("Stored batch %s (%s reviews) via insert.", index // batch_size + 1, len(batch))
                    continue
                except Exception as insert_error:
                    logger.error("Failed to insert batch %s: %s", index // batch_size + 1, insert_error)
                    error_count += len(batch)
                    continue

            logger.error("Failed to store batch %s: %s", index // batch_size + 1, error)
            error_count += len(batch)

    logger.info("Supabase storage complete. Success: %s, Errors: %s", success_count, error_count)
    return success_count, error_count


def run_deduplication(
    reviews: Optional[List[Dict[str, Any]]] = None,
    input_path: str = DEFAULT_SANITIZED_PATH,
    output_path: str = DEFAULT_DEDUPED_PATH,
    save_local: bool = True,
    store_in_supabase: bool = True,
    fuzzy_threshold: float = FUZZY_JACCARD_THRESHOLD,
) -> List[Dict[str, Any]]:
    """Main orchestration function for Phase 1.5: Deduplication."""
    logger.info("Starting Phase 1.5: Deduplication")

    if reviews is None:
        if not os.path.exists(input_path):
            raise FileNotFoundError(
                f"Sanitized reviews not found at {input_path}. Run Phase 1.4 first."
            )
        reviews = load_reviews_from_jsonl(input_path)

    if not reviews:
        logger.warning("No reviews to deduplicate.")
        return []

    deduped_reviews, stats = deduplicate_reviews(reviews, fuzzy_threshold=fuzzy_threshold)

    dedup_ratio = 0.0
    if stats["input_count"]:
        removed_total = stats["exact_duplicates_removed"] + stats["fuzzy_duplicates_removed"]
        dedup_ratio = removed_total / stats["input_count"]

    logger.info(
        "Deduplication complete. Input: %s, Exact removed: %s, Fuzzy removed: %s, "
        "Output: %s, Dedup ratio: %.2f%%",
        stats["input_count"],
        stats["exact_duplicates_removed"],
        stats["fuzzy_duplicates_removed"],
        stats["output_count"],
        dedup_ratio * 100,
    )

    if save_local:
        save_deduplicated_reviews(deduped_reviews, output_path)

    if store_in_supabase:
        store_processed_reviews_in_supabase(deduped_reviews)

    return deduped_reviews


if __name__ == "__main__":
    run_deduplication()
