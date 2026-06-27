"""
Phase 3.1: ChromaDB Setup & Embedding Generation

Builds the knowledge-layer vector store for RAG and semantic search:
  - Combined embedding chunks: review text + themes + sentiment + segment
  - Rich metadata filters: date, source, segment, theme, week_number
  - Rolling 90-day window (only recent reviews are embedded)

Embedding backend
-----------------
Primary  : OpenAI text-embedding-3-small (plan default when EMBEDDING_BACKEND=openai)
Fallback : sentence-transformers all-MiniLM-L6-v2 (EMBEDDING_BACKEND=local, free)
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

import chromadb

from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

EMBEDDING_BACKEND = os.environ.get("EMBEDDING_BACKEND", "local").lower()
LOCAL_MODEL_NAME = "all-MiniLM-L6-v2"
OPENAI_MODEL_NAME = "text-embedding-3-small"

CHROMA_PERSIST_DIR = os.environ.get(
    "CHROMA_PERSIST_DIR",
    os.path.join(project_root, "data", "chroma_db"),
)
CHROMA_KNOWLEDGE_COLLECTION = os.environ.get("CHROMA_KNOWLEDGE_COLLECTION", "review_knowledge")

ROLLING_WINDOW_DAYS = int(os.environ.get("ROLLING_WINDOW_DAYS", "90"))
FETCH_BATCH_SIZE = 1000
EMBED_BATCH_SIZE = 256

_local_model = None


# ---------------------------------------------------------------------------
# Chunk & metadata builders
# ---------------------------------------------------------------------------


def parse_review_date(review_date: str) -> datetime:
    """Parse an ISO review_date string to a timezone-aware datetime."""
    normalized = review_date.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def compute_week_number(review_date: str) -> int:
    """Return ISO week number for a review date string."""
    return parse_review_date(review_date).isocalendar()[1]


def format_themes(themes: Any) -> str:
    """Normalize themes (list or JSON) to a comma-separated string."""
    if not themes:
        return "General"
    if isinstance(themes, list):
        cleaned = [str(t).strip() for t in themes if str(t).strip()]
        return ", ".join(cleaned) if cleaned else "General"
    return str(themes).strip() or "General"


def primary_theme(themes: Any) -> str:
    """Return the primary theme for metadata filtering."""
    if isinstance(themes, list) and themes:
        return str(themes[0]).strip() or "General"
    if themes and not isinstance(themes, list):
        return str(themes).strip() or "General"
    return "General"


def build_embedding_chunk(review: Dict[str, Any]) -> str:
    """
    Build the combined text chunk for embedding.

    Format: review text + themes + sentiment + segment (per implementation plan).
    """
    text = (review.get("cleaned_text") or "").strip()
    themes_str = format_themes(review.get("themes"))
    sentiment_label = review.get("sentiment_label") or "unknown"
    sentiment_score = review.get("sentiment_score")
    segment = review.get("user_segment") or "Unknown"

    if sentiment_score is not None:
        sentiment_part = f"{sentiment_label} (score: {float(sentiment_score):.2f})"
    else:
        sentiment_part = sentiment_label

    return (
        f"Review: {text}\n"
        f"Themes: {themes_str}\n"
        f"Sentiment: {sentiment_part}\n"
        f"Segment: {segment}"
    )


def build_chroma_metadata(review: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build ChromaDB metadata dict (scalar values only).

    Fields: date, source, segment, theme, week_number (+ sentiment for filtering).
    """
    review_date = review.get("review_date") or ""
    parsed = parse_review_date(review_date) if review_date else datetime.now(timezone.utc)

    return {
        "date": parsed.date().isoformat(),
        "source": review.get("source") or "unknown",
        "segment": review.get("user_segment") or "Unknown",
        "theme": primary_theme(review.get("themes")),
        "week_number": compute_week_number(review_date) if review_date else parsed.isocalendar()[1],
        "sentiment": review.get("sentiment_label") or "unknown",
        "cluster_id": int(review["cluster_id"]) if review.get("cluster_id") is not None else -1,
    }


def is_within_rolling_window(review_date: str, window_days: int = ROLLING_WINDOW_DAYS) -> bool:
    """Return True if review_date falls within the rolling window."""
    if not review_date:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    return parse_review_date(review_date) >= cutoff


# ---------------------------------------------------------------------------
# Supabase fetch
# ---------------------------------------------------------------------------


def _rolling_window_cutoff(window_days: int = ROLLING_WINDOW_DAYS) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=window_days)


def preload_raw_metadata_in_window(
    window_days: int = ROLLING_WINDOW_DAYS,
    batch_size: int = FETCH_BATCH_SIZE,
) -> Dict[str, Dict[str, Any]]:
    """
    Preload raw_reviews source/date for the rolling window into a lookup dict.

    One paginated scan avoids per-batch IN queries against raw_reviews.
    """
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    cutoff_iso = _rolling_window_cutoff(window_days).isoformat()
    metadata: Dict[str, Dict[str, Any]] = {}
    offset = 0

    logger.info("Preloading raw review metadata since %s…", cutoff_iso[:10])

    while True:
        response = (
            client.table("raw_reviews")
            .select("id, source, review_date")
            .gte("review_date", cutoff_iso)
            .order("review_date", desc=False)
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break

        for row in batch:
            metadata[row["id"]] = row

        if len(batch) < batch_size:
            break
        offset += batch_size

    logger.info("Preloaded metadata for %d raw reviews in window.", len(metadata))
    return metadata


def enrich_review_with_raw(
    review: Dict[str, Any],
    raw_metadata: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Attach source/review_date from preloaded raw metadata; None if outside window."""
    raw = raw_metadata.get(review.get("raw_review_id"))
    if not raw:
        return None
    review = dict(review)
    review["source"] = raw.get("source")
    review["review_date"] = raw.get("review_date")
    return review


def iter_reviews_in_window(
    window_days: int = ROLLING_WINDOW_DAYS,
    batch_size: int = FETCH_BATCH_SIZE,
):
    """
    Yield batches of processed reviews enriched with raw metadata (window only).
    """
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    raw_metadata = preload_raw_metadata_in_window(window_days=window_days, batch_size=batch_size)
    offset = 0
    total_in_window = 0

    logger.info("Streaming processed reviews for %d-day rolling window…", window_days)

    while True:
        response = (
            client.table("processed_reviews")
            .select(
                "id, raw_review_id, cleaned_text, themes, "
                "sentiment_label, sentiment_score, user_segment, cluster_id"
            )
            .order("processed_at", desc=False)
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break

        enriched_batch: List[Dict[str, Any]] = []
        for review in batch:
            enriched = enrich_review_with_raw(review, raw_metadata)
            if enriched:
                enriched_batch.append(enriched)

        if enriched_batch:
            total_in_window += len(enriched_batch)
            yield enriched_batch

        logger.info(
            "Processed offset %d — %d reviews in window so far…",
            offset,
            total_in_window,
        )

        if len(batch) < batch_size:
            break
        offset += batch_size

    logger.info("Total reviews in %d-day window: %d", window_days, total_in_window)


def fetch_reviews_in_window(
    window_days: int = ROLLING_WINDOW_DAYS,
    batch_size: int = FETCH_BATCH_SIZE,
) -> List[Dict[str, Any]]:
    """Fetch all windowed reviews (materialized list). Prefer iter_reviews_in_window for large runs."""
    all_reviews: List[Dict[str, Any]] = []
    for batch in iter_reviews_in_window(window_days=window_days, batch_size=batch_size):
        all_reviews.extend(batch)
    return all_reviews


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------


def _get_local_model():
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading sentence-transformers model '%s'…", LOCAL_MODEL_NAME)
        _local_model = SentenceTransformer(LOCAL_MODEL_NAME)
    return _local_model


def generate_knowledge_embeddings(
    reviews: List[Dict[str, Any]],
) -> Tuple[List[List[float]], List[Dict[str, Any]], List[str]]:
    """
    Generate embeddings for combined knowledge chunks.

    Returns (embeddings, matched_reviews, documents).
    """
    if EMBEDDING_BACKEND == "openai":
        return _generate_openai_knowledge_embeddings(reviews)
    return _generate_local_knowledge_embeddings(reviews)


def _generate_local_knowledge_embeddings(
    reviews: List[Dict[str, Any]],
) -> Tuple[List[List[float]], List[Dict[str, Any]], List[str]]:
    model = _get_local_model()
    all_embeddings: List[List[float]] = []
    matched_reviews: List[Dict[str, Any]] = []
    documents: List[str] = []
    total_batches = max(1, (len(reviews) - 1) // EMBED_BATCH_SIZE + 1)

    for i in range(0, len(reviews), EMBED_BATCH_SIZE):
        batch = reviews[i : i + EMBED_BATCH_SIZE]
        texts = [build_embedding_chunk(r) for r in batch]

        logger.info(
            "Embedding batch %d/%d (%d reviews)…",
            i // EMBED_BATCH_SIZE + 1,
            total_batches,
            len(texts),
        )

        try:
            vecs = model.encode(
                texts,
                batch_size=64,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
            all_embeddings.extend(vecs.tolist())
            matched_reviews.extend(batch)
            documents.extend(texts)
        except Exception as exc:
            logger.error(
                "Local embedding batch %d failed: %s — skipping batch.",
                i // EMBED_BATCH_SIZE + 1,
                exc,
            )

    logger.info(
        "Local embedding complete: %d/%d reviews embedded.",
        len(all_embeddings),
        len(reviews),
    )
    return all_embeddings, matched_reviews, documents


def _generate_openai_knowledge_embeddings(
    reviews: List[Dict[str, Any]],
) -> Tuple[List[List[float]], List[Dict[str, Any]], List[str]]:
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY missing. Set it or use EMBEDDING_BACKEND=local."
        )

    client = OpenAI(api_key=api_key)
    all_embeddings: List[List[float]] = []
    matched_reviews: List[Dict[str, Any]] = []
    documents: List[str] = []
    total_batches = max(1, (len(reviews) - 1) // EMBED_BATCH_SIZE + 1)

    for i in range(0, len(reviews), EMBED_BATCH_SIZE):
        batch = reviews[i : i + EMBED_BATCH_SIZE]
        texts = [build_embedding_chunk(r) for r in batch]

        logger.info(
            "OpenAI embedding batch %d/%d (%d reviews)…",
            i // EMBED_BATCH_SIZE + 1,
            total_batches,
            len(texts),
        )

        try:
            response = client.embeddings.create(model=OPENAI_MODEL_NAME, input=texts)
            all_embeddings.extend([item.embedding for item in response.data])
            matched_reviews.extend(batch)
            documents.extend(texts)
        except Exception as exc:
            logger.error(
                "OpenAI embedding batch %d failed: %s — skipping batch.",
                i // EMBED_BATCH_SIZE + 1,
                exc,
            )

    logger.info(
        "OpenAI embedding complete: %d/%d reviews embedded.",
        len(all_embeddings),
        len(reviews),
    )
    return all_embeddings, matched_reviews, documents


# ---------------------------------------------------------------------------
# ChromaDB
# ---------------------------------------------------------------------------


def setup_knowledge_collection(reset: bool = False) -> chromadb.Collection:
    """Get or create the Phase 3.1 knowledge-layer ChromaDB collection."""
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

    if reset:
        try:
            client.delete_collection(name=CHROMA_KNOWLEDGE_COLLECTION)
            logger.info("Deleted existing collection '%s' (reset).", CHROMA_KNOWLEDGE_COLLECTION)
        except Exception:
            pass

    try:
        collection = client.get_collection(name=CHROMA_KNOWLEDGE_COLLECTION)
        logger.info("Using existing ChromaDB collection '%s'.", CHROMA_KNOWLEDGE_COLLECTION)
    except Exception:
        collection = client.create_collection(
            name=CHROMA_KNOWLEDGE_COLLECTION,
            metadata={"hnsw:space": "cosine", "phase": "3.1"},
        )
        logger.info("Created new ChromaDB collection '%s'.", CHROMA_KNOWLEDGE_COLLECTION)

    return collection


def upsert_knowledge_embeddings(
    reviews: List[Dict[str, Any]],
    embeddings: List[List[float]],
    documents: List[str],
    collection: chromadb.Collection,
) -> int:
    """Upsert knowledge embeddings with metadata into ChromaDB."""
    if not reviews or not embeddings:
        logger.warning("Nothing to upsert into ChromaDB.")
        return 0

    ids = [str(r["id"]) for r in reviews]
    metadatas = [build_chroma_metadata(r) for r in reviews]
    upserted = 0

    for i in range(0, len(ids), EMBED_BATCH_SIZE):
        batch_ids = ids[i : i + EMBED_BATCH_SIZE]
        batch_docs = documents[i : i + EMBED_BATCH_SIZE]
        batch_embs = embeddings[i : i + EMBED_BATCH_SIZE]
        batch_meta = metadatas[i : i + EMBED_BATCH_SIZE]

        try:
            collection.upsert(
                ids=batch_ids,
                documents=batch_docs,
                embeddings=batch_embs,
                metadatas=batch_meta,
            )
            upserted += len(batch_ids)
            logger.info(
                "ChromaDB upsert — batch %d (%d vectors).",
                i // EMBED_BATCH_SIZE + 1,
                len(batch_ids),
            )
        except Exception as exc:
            logger.error(
                "ChromaDB upsert batch %d failed: %s",
                i // EMBED_BATCH_SIZE + 1,
                exc,
            )

    logger.info("Upserted %d knowledge embeddings into ChromaDB.", upserted)
    return upserted


def evict_outside_window(
    collection: chromadb.Collection,
    window_days: int = ROLLING_WINDOW_DAYS,
) -> int:
    """
    Remove embeddings older than the rolling window from ChromaDB.

    Returns the number of evicted vectors.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).date().isoformat()

    try:
        result = collection.get(include=["metadatas"])
    except Exception as exc:
        logger.warning("Could not scan collection for eviction: %s", exc)
        return 0

    stale_ids = [
        doc_id
        for doc_id, meta in zip(result["ids"], result["metadatas"])
        if meta and meta.get("date", "") < cutoff
    ]

    if not stale_ids:
        return 0

    for i in range(0, len(stale_ids), EMBED_BATCH_SIZE):
        batch = stale_ids[i : i + EMBED_BATCH_SIZE]
        try:
            collection.delete(ids=batch)
        except Exception as exc:
            logger.error("Failed to evict batch: %s", exc)

    logger.info("Evicted %d embeddings older than %d days.", len(stale_ids), window_days)
    return len(stale_ids)


# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------


def run_embedding_store(
    window_days: int = ROLLING_WINDOW_DAYS,
    skip_embed: bool = False,
    reset: bool = False,
) -> Dict[str, Any]:
    """
    Phase 3.1 pipeline: stream windowed reviews, embed combined chunks, upsert to ChromaDB.

    Returns a summary dict with counts and collection info.
    """
    collection = setup_knowledge_collection(reset=reset)
    evicted = evict_outside_window(collection, window_days)

    reviews_fetched = 0
    upserted = 0

    for batch in iter_reviews_in_window(window_days=window_days):
        reviews_fetched += len(batch)
        if skip_embed:
            continue

        embeddings, matched, documents = generate_knowledge_embeddings(batch)
        upserted += upsert_knowledge_embeddings(matched, embeddings, documents, collection)

    return {
        "window_days": window_days,
        "reviews_fetched": reviews_fetched,
        "embeddings_upserted": upserted,
        "evicted": evicted,
        "collection_count": collection.count(),
        "collection_name": CHROMA_KNOWLEDGE_COLLECTION,
        "embedding_backend": EMBEDDING_BACKEND,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.1 — Knowledge Layer Embeddings")
    parser.add_argument(
        "--window-days",
        type=int,
        default=ROLLING_WINDOW_DAYS,
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
