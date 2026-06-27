import html
import json
import logging
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Add project root to path for absolute imports if run directly
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

import pandas as pd

from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MIN_REVIEW_LENGTH = 10
FETCH_BATCH_SIZE = 1000
DEFAULT_OUTPUT_PATH = os.path.join(project_root, "data", "processed", "cleaned_reviews.jsonl")

_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
_WHITESPACE_PATTERN = re.compile(r"\s+")

_ENCODING_ARTIFACTS = {
    "\xa0": " ",
    "\u200b": "",
    "\u200c": "",
    "\u200d": "",
    "\ufeff": "",
    "â€™": "'",
    "â€œ": '"',
    "â€": '"',
    "â€”": "-",
    "â€“": "-",
}


def normalize_date(date_value: Any) -> Optional[str]:
    """Normalize a review date to ISO 8601 UTC."""
    if date_value is None:
        return None

    if isinstance(date_value, datetime):
        dt = date_value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()

    if not isinstance(date_value, str):
        date_value = str(date_value)

    date_value = date_value.strip()
    if not date_value:
        return None

    normalized = date_value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(date_value, fmt).replace(tzinfo=timezone.utc)
                return dt.isoformat()
            except ValueError:
                continue

    logger.warning("Could not parse date value: %s", date_value)
    return None


def clean_review_text(text: Any) -> str:
    """Remove HTML entities, encoding artifacts, and excessive whitespace."""
    if text is None:
        return ""

    if not isinstance(text, str):
        text = str(text)

    text = text.encode("utf-8", errors="ignore").decode("utf-8")

    for artifact, replacement in _ENCODING_ARTIFACTS.items():
        text = text.replace(artifact, replacement)

    text = unicodedata.normalize("NFKC", text)

    text = html.unescape(text)
    text = _HTML_TAG_PATTERN.sub(" ", text)
    text = _WHITESPACE_PATTERN.sub(" ", text).strip()

    return text


def normalize_rating(rating: Any) -> Optional[int]:
    """Normalize rating to an integer between 1 and 5, if present."""
    if rating is None:
        return None

    try:
        value = int(rating)
    except (TypeError, ValueError):
        return None

    if value < 1 or value > 5:
        return None

    return value


def normalize_review_record(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Standardize a raw Supabase review into a unified schema."""
    return {
        "raw_review_id": raw.get("id"),
        "source": (raw.get("source") or "").strip().lower(),
        "review_id": raw.get("review_id"),
        "review_text": clean_review_text(raw.get("review_text")),
        "rating": normalize_rating(raw.get("rating")),
        "date": normalize_date(raw.get("review_date")),
        "version": (raw.get("version") or "Unknown").strip(),
        "thumbs_up_count": int(raw.get("thumbs_up_count") or 0),
        "metadata": raw.get("metadata") or {},
    }


def filter_short_reviews(
    reviews: List[Dict[str, Any]], min_length: int = MIN_REVIEW_LENGTH
) -> List[Dict[str, Any]]:
    """Drop empty or extremely short reviews."""
    return [review for review in reviews if len(review.get("review_text", "")) >= min_length]


def fetch_raw_reviews_from_supabase(batch_size: int = FETCH_BATCH_SIZE) -> List[Dict[str, Any]]:
    """Fetch all raw reviews from Supabase using paginated requests."""
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    all_reviews: List[Dict[str, Any]] = []
    offset = 0

    logger.info("Fetching raw reviews from Supabase...")

    while True:
        response = (
            client.table("raw_reviews")
            .select("*")
            .order("review_date", desc=True)
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = response.data or []

        if not batch:
            break

        all_reviews.extend(batch)
        logger.info("Fetched %s raw reviews so far...", len(all_reviews))

        if len(batch) < batch_size:
            break

        offset += batch_size

    logger.info("Fetched %s total raw reviews from Supabase.", len(all_reviews))
    return all_reviews


def clean_reviews(raw_reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize and filter a list of raw reviews."""
    normalized = [normalize_review_record(raw) for raw in raw_reviews]
    return filter_short_reviews(normalized)


def save_cleaned_reviews(
    reviews: List[Dict[str, Any]], output_path: str = DEFAULT_OUTPUT_PATH
) -> str:
    """Persist cleaned reviews to JSON Lines for downstream pipeline stages."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as file:
        for review in reviews:
            file.write(json.dumps(review, ensure_ascii=False) + "\n")

    csv_path = os.path.splitext(output_path)[0] + ".csv"
    pd.DataFrame(reviews).to_csv(csv_path, index=False)

    logger.info("Saved %s cleaned reviews to %s and %s", len(reviews), output_path, csv_path)
    return output_path


def run_cleaning(save_local: bool = True, output_path: str = DEFAULT_OUTPUT_PATH) -> List[Dict[str, Any]]:
    """Main orchestration function for Phase 1.3: Data Cleaning & Normalization."""
    logger.info("Starting Phase 1.3: Data Cleaning & Normalization")

    raw_reviews = fetch_raw_reviews_from_supabase()
    if not raw_reviews:
        logger.warning("No raw reviews found in Supabase.")
        return []

    cleaned_reviews = clean_reviews(raw_reviews)
    removed_count = len(raw_reviews) - len(cleaned_reviews)

    logger.info(
        "Cleaning complete. Input: %s, Output: %s, Removed (short/empty): %s",
        len(raw_reviews),
        len(cleaned_reviews),
        removed_count,
    )

    if save_local:
        save_cleaned_reviews(cleaned_reviews, output_path)

    return cleaned_reviews


if __name__ == "__main__":
    run_cleaning()
