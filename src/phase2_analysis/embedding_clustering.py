"""
Phase 2.1: Embedding Generation & Clustering

Generates embeddings for all processed reviews using sentence-transformers
(all-MiniLM-L6-v2, free / local — no API quota required), stores them in
ChromaDB (upsert-safe / idempotent), then clusters with K-Means (optimal k via
elbow + silhouette) or DBSCAN, and writes cluster_id back to Supabase
processed_reviews in batched upserts.

Embedding backend
-----------------
Primary  : sentence-transformers all-MiniLM-L6-v2  (local, free, 384-dim)
Fallback : OpenAI text-embedding-3-small (set OPENAI_API_KEY + EMBEDDING_BACKEND=openai)
"""

import logging
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

import chromadb
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics import silhouette_score

from src.phase1_data_pipeline.supabase_client import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Switch to "openai" only if OPENAI_API_KEY has quota
EMBEDDING_BACKEND = os.environ.get("EMBEDDING_BACKEND", "local").lower()

# Local model: sentence-transformers all-MiniLM-L6-v2 (384-dim, fast, free)
LOCAL_MODEL_NAME = "all-MiniLM-L6-v2"
LOCAL_EMBEDDING_DIMENSION = 384

# OpenAI fallback
OPENAI_MODEL_NAME = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSION = 1536

CHROMA_PERSIST_DIR = os.environ.get(
    "CHROMA_PERSIST_DIR",
    os.path.join(project_root, "data", "chroma_db"),
)
CHROMA_COLLECTION_NAME = "reviews"

FETCH_BATCH_SIZE = 1000    # rows per Supabase page
EMBED_BATCH_SIZE = 256     # texts per local model forward pass (tune to VRAM/RAM)
SUPABASE_BATCH_SIZE = 500  # rows per upsert call

# K-Means search range when n_clusters is not provided
K_MIN = 2
K_MAX = 12


# ---------------------------------------------------------------------------
# Embedding generation — local (sentence-transformers)
# ---------------------------------------------------------------------------

_local_model = None  # module-level singleton to avoid reloading on each call


def _get_local_model():
    """Lazy-load the sentence-transformers model (downloads once, cached locally)."""
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformers model '%s'…", LOCAL_MODEL_NAME)
        _local_model = SentenceTransformer(LOCAL_MODEL_NAME)
        logger.info("Model loaded. Embedding dimension: %d", LOCAL_EMBEDDING_DIMENSION)
    return _local_model


def generate_all_embeddings(
    reviews: List[Dict[str, Any]],
    _client=None,  # kept for API compatibility — unused in local mode
) -> Tuple[List[List[float]], List[Dict[str, Any]]]:
    """
    Generate embeddings for *reviews* in batches.

    Uses the local sentence-transformers model by default (EMBEDDING_BACKEND=local).
    Falls back to OpenAI if EMBEDDING_BACKEND=openai.

    Returns (embeddings, matched_reviews) — both lists share the same index.
    Reviews that fail to embed are dropped with a warning.
    """
    if EMBEDDING_BACKEND == "openai":
        return _generate_openai_embeddings(reviews)
    return _generate_local_embeddings(reviews)


def _generate_local_embeddings(
    reviews: List[Dict[str, Any]],
) -> Tuple[List[List[float]], List[Dict[str, Any]]]:
    """Embed all reviews with the local sentence-transformers model."""
    model = _get_local_model()
    all_embeddings: List[List[float]] = []
    matched_reviews: List[Dict[str, Any]] = []
    total_batches = (len(reviews) - 1) // EMBED_BATCH_SIZE + 1

    for i in range(0, len(reviews), EMBED_BATCH_SIZE):
        batch = reviews[i : i + EMBED_BATCH_SIZE]
        texts = [r["cleaned_text"] for r in batch]

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
        except Exception as exc:
            logger.error("Local embedding batch %d failed: %s — skipping batch.", i // EMBED_BATCH_SIZE + 1, exc)

    logger.info("Local embedding complete: %d/%d reviews embedded.", len(all_embeddings), len(reviews))
    return all_embeddings, matched_reviews


def _generate_openai_embeddings(
    reviews: List[Dict[str, Any]],
) -> Tuple[List[List[float]], List[Dict[str, Any]]]:
    """Embed all reviews via the OpenAI Embeddings API (requires quota)."""
    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY missing. Set it or use EMBEDDING_BACKEND=local.")
    client = OpenAI(api_key=api_key)

    all_embeddings: List[List[float]] = []
    matched_reviews: List[Dict[str, Any]] = []
    total_batches = (len(reviews) - 1) // EMBED_BATCH_SIZE + 1

    for i in range(0, len(reviews), EMBED_BATCH_SIZE):
        batch = reviews[i : i + EMBED_BATCH_SIZE]
        texts = [r["cleaned_text"] for r in batch]

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
        except Exception as exc:
            logger.error("OpenAI embedding batch %d failed: %s — skipping batch.", i // EMBED_BATCH_SIZE + 1, exc)

    logger.info("OpenAI embedding complete: %d/%d reviews embedded.", len(all_embeddings), len(reviews))
    return all_embeddings, matched_reviews


# ---------------------------------------------------------------------------
# ChromaDB
# ---------------------------------------------------------------------------

def setup_chromadb() -> chromadb.Collection:
    """Initialise ChromaDB persistent client and get-or-create the reviews collection."""
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

    try:
        collection = client.get_collection(name=CHROMA_COLLECTION_NAME)
        logger.info("Using existing ChromaDB collection '%s'.", CHROMA_COLLECTION_NAME)
    except Exception:
        collection = client.create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("Created new ChromaDB collection '%s'.", CHROMA_COLLECTION_NAME)

    return collection


def _load_all_embeddings_from_chromadb(
    all_reviews: List[Dict[str, Any]],
    collection: chromadb.Collection,
    page_size: int = 5000,
) -> Dict[str, List[float]]:
    """
    Load embeddings for *all_reviews* from ChromaDB in pages to avoid the
    SQLite 'too many SQL variables' limit when fetching by ID list.
    """
    id_to_embedding: Dict[str, List[float]] = {}
    all_ids = [str(r["id"]) for r in all_reviews]

    for i in range(0, len(all_ids), page_size):
        page_ids = all_ids[i : i + page_size]
        try:
            result = collection.get(ids=page_ids, include=["embeddings"])
            for chroma_id, emb in zip(result["ids"], result["embeddings"]):
                id_to_embedding[chroma_id] = emb
            logger.info(
                "Loaded embeddings page %d/%d (%d vectors so far).",
                i // page_size + 1,
                (len(all_ids) - 1) // page_size + 1,
                len(id_to_embedding),
            )
        except Exception as exc:
            logger.error("Failed to load ChromaDB page %d: %s", i // page_size + 1, exc)

    return id_to_embedding


def get_already_embedded_ids(collection: chromadb.Collection) -> set:
    """Return the set of review IDs already present in ChromaDB."""
    try:
        result = collection.get(include=[])   # only IDs, no data
        return set(result["ids"])
    except Exception as exc:
        logger.warning("Could not fetch existing ChromaDB IDs: %s", exc)
        return set()


def upsert_embeddings_in_chromadb(
    reviews: List[Dict[str, Any]],
    embeddings: List[List[float]],
    collection: chromadb.Collection,
) -> None:
    """
    Upsert embeddings into ChromaDB.

    Using `upsert` (not `add`) makes this idempotent — re-running the pipeline
    will update existing vectors rather than raising a duplicate-ID error.
    """
    if not reviews or not embeddings:
        logger.warning("Nothing to upsert into ChromaDB.")
        return

    # Drop duplicate review IDs (can occur when incremental ingest overlaps).
    seen: set[str] = set()
    deduped_reviews: List[Dict[str, Any]] = []
    deduped_embeddings: List[List[float]] = []
    for review, embedding in zip(reviews, embeddings):
        review_id = str(review["id"])
        if review_id in seen:
            continue
        seen.add(review_id)
        deduped_reviews.append(review)
        deduped_embeddings.append(embedding)

    dropped = len(reviews) - len(deduped_reviews)
    if dropped:
        logger.warning(
            "Dropped %d duplicate review IDs before ChromaDB upsert.", dropped
        )

    ids = [str(r["id"]) for r in deduped_reviews]
    documents = [r["cleaned_text"] for r in deduped_reviews]

    for i in range(0, len(ids), EMBED_BATCH_SIZE):
        batch_ids = ids[i : i + EMBED_BATCH_SIZE]
        batch_docs = documents[i : i + EMBED_BATCH_SIZE]
        batch_embs = deduped_embeddings[i : i + EMBED_BATCH_SIZE]

        # Chroma rejects duplicate IDs within a single upsert call.
        unique: Dict[str, Tuple[str, List[float]]] = {}
        for review_id, doc, emb in zip(batch_ids, batch_docs, batch_embs):
            unique[review_id] = (doc, emb)
        batch_ids = list(unique.keys())
        batch_docs = [unique[rid][0] for rid in batch_ids]
        batch_embs = [unique[rid][1] for rid in batch_ids]

        try:
            collection.upsert(ids=batch_ids, documents=batch_docs, embeddings=batch_embs)
            logger.info(
                "ChromaDB upsert — batch %d (%d vectors).",
                i // EMBED_BATCH_SIZE + 1,
                len(batch_ids),
            )
        except Exception as exc:
            logger.error("ChromaDB upsert batch %d failed: %s", i // EMBED_BATCH_SIZE + 1, exc)

    logger.info("Upserted %d embeddings into ChromaDB.", len(ids))


# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def _find_optimal_k(embeddings_array: np.ndarray) -> int:
    """
    Select optimal number of clusters using the elbow method (inertia drop-off)
    combined with the silhouette score for the candidate range [K_MIN, K_MAX].
    """
    k_range = range(K_MIN, min(K_MAX + 1, len(embeddings_array)))
    inertias: List[float] = []
    silhouettes: List[float] = []

    logger.info("Searching for optimal k in [%d, %d]…", K_MIN, min(K_MAX, len(embeddings_array) - 1))

    for k in k_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(embeddings_array)
        inertias.append(km.inertia_)
        sil = silhouette_score(embeddings_array, labels)
        silhouettes.append(sil)
        logger.info("  k=%d  inertia=%.1f  silhouette=%.4f", k, km.inertia_, sil)

    # Elbow: largest second-derivative of inertia curve
    if len(inertias) >= 3:
        diffs = np.diff(inertias)
        second_diffs = np.diff(diffs)
        elbow_k = list(k_range)[np.argmax(second_diffs) + 1]
    else:
        elbow_k = list(k_range)[np.argmax(silhouettes)]

    # Silhouette vote
    sil_k = list(k_range)[np.argmax(silhouettes)]

    # Prefer the k with the highest silhouette; use elbow as tiebreaker
    optimal_k = sil_k if silhouettes[list(k_range).index(sil_k)] >= silhouettes[list(k_range).index(elbow_k)] else elbow_k
    logger.info("Optimal k selected: %d (elbow=%d, best-silhouette=%d)", optimal_k, elbow_k, sil_k)
    return optimal_k


def cluster_kmeans(
    embeddings_array: np.ndarray,
    n_clusters: Optional[int] = None,
) -> np.ndarray:
    """
    Cluster embeddings with K-Means.

    If *n_clusters* is None the optimal k is found automatically via elbow +
    silhouette analysis over [K_MIN, K_MAX].
    """
    if n_clusters is None:
        n_clusters = _find_optimal_k(embeddings_array)

    logger.info("Running K-Means with k=%d…", n_clusters)
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = km.fit_predict(embeddings_array)

    if len(set(labels)) > 1:
        sil = silhouette_score(embeddings_array, labels)
        logger.info("K-Means silhouette score: %.4f", sil)

    unique, counts = np.unique(labels, return_counts=True)
    dist = dict(zip(unique.tolist(), counts.tolist()))
    logger.info("K-Means cluster distribution: %s", dist)
    return labels


def cluster_dbscan(
    embeddings_array: np.ndarray,
    eps: float = 0.3,
    min_samples: int = 10,
) -> np.ndarray:
    """Cluster embeddings with DBSCAN (cosine distance)."""
    logger.info("Running DBSCAN with eps=%.2f, min_samples=%d…", eps, min_samples)
    db = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
    labels = db.fit_predict(embeddings_array)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)
    logger.info("DBSCAN: %d clusters, %d noise points.", n_clusters, n_noise)

    unique, counts = np.unique(labels, return_counts=True)
    logger.info("DBSCAN cluster distribution: %s", dict(zip(unique.tolist(), counts.tolist())))
    return labels


# ---------------------------------------------------------------------------
# Supabase write-back
# ---------------------------------------------------------------------------

def fetch_processed_reviews(batch_size: int = FETCH_BATCH_SIZE) -> List[Dict[str, Any]]:
    """Fetch all processed reviews from Supabase (id + cleaned_text only)."""
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    all_reviews: List[Dict[str, Any]] = []
    offset = 0

    logger.info("Fetching processed reviews from Supabase…")

    while True:
        response = (
            client.table("processed_reviews")
            .select("id, raw_review_id, cleaned_text")
            .order("processed_at", desc=False)
            .range(offset, offset + batch_size - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break

        all_reviews.extend(batch)
        logger.info("Fetched %d processed reviews so far…", len(all_reviews))

        if len(batch) < batch_size:
            break

        offset += batch_size

    logger.info("Total processed reviews fetched: %d", len(all_reviews))
    return all_reviews


MIGRATION_SQL = (
    "ALTER TABLE public.processed_reviews "
    "ADD COLUMN IF NOT EXISTS cluster_id INTEGER;"
)


def check_cluster_id_column_exists() -> bool:
    """Return True if the cluster_id column already exists in processed_reviews."""
    client = get_supabase_client()
    if not client:
        return False
    try:
        client.table("processed_reviews").select("cluster_id").limit(1).execute()
        return True
    except Exception:
        return False


def assign_cluster_ids_to_supabase(
    reviews: List[Dict[str, Any]],
    cluster_labels: np.ndarray,
    batch_size: int = SUPABASE_BATCH_SIZE,
) -> Tuple[int, int]:
    """
    Write cluster_id back to Supabase processed_reviews in batched upserts.

    Uses upsert on 'id' so this is idempotent — re-running overwrites existing
    cluster assignments rather than inserting duplicates.

    Raises RuntimeError with actionable instructions if the cluster_id column
    does not yet exist (migration not yet applied).

    Returns (success_count, error_count).
    """
    if len(reviews) != len(cluster_labels):
        raise ValueError(
            f"Length mismatch: {len(reviews)} reviews vs {len(cluster_labels)} labels."
        )

    # Guard: confirm the column exists before attempting writes
    if not check_cluster_id_column_exists():
        raise RuntimeError(
            "\n"
            "╔══════════════════════════════════════════════════════════════╗\n"
            "║  MIGRATION REQUIRED — cluster_id column does not exist yet  ║\n"
            "╠══════════════════════════════════════════════════════════════╣\n"
            "║  Run this one-line SQL in your Supabase SQL Editor:         ║\n"
            "║                                                              ║\n"
            f"║  {MIGRATION_SQL:<60}║\n"
            "║                                                              ║\n"
            "║  Then re-run this script.                                   ║\n"
            "╚══════════════════════════════════════════════════════════════╝"
        )

    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    success_count = 0
    error_count = 0

    for i in range(0, len(reviews), batch_size):
        batch_reviews = reviews[i : i + batch_size]
        batch_labels = cluster_labels[i : i + batch_size]

        payload = [
            {
                "id": review["id"],
                "raw_review_id": review["raw_review_id"],
                "cleaned_text": review["cleaned_text"],
                "cluster_id": int(label),
            }
            for review, label in zip(batch_reviews, batch_labels)
        ]

        try:
            client.table("processed_reviews").upsert(payload, on_conflict="id").execute()
            success_count += len(payload)
            logger.info(
                "Supabase cluster_id upsert — batch %d/%d (%d rows).",
                i // batch_size + 1,
                (len(reviews) - 1) // batch_size + 1,
                len(payload),
            )
        except Exception as exc:
            logger.error("Supabase upsert batch %d failed: %s", i // batch_size + 1, exc)
            error_count += len(payload)

    logger.info(
        "cluster_id write-back complete. Success: %d, Errors: %d.", success_count, error_count
    )
    return success_count, error_count


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def run_embedding_clustering(
    n_clusters: Optional[int] = None,
    clustering_method: str = "kmeans",
    skip_existing_embeddings: bool = True,
    dbscan_eps: float = 0.3,
    dbscan_min_samples: int = 10,
) -> Dict[str, Any]:
    """
    Phase 2.1 orchestration: Embedding Generation & Clustering.

    Steps
    -----
    1. Fetch processed reviews from Supabase.
    2. (Optionally) skip reviews already embedded in ChromaDB.
    3. Generate OpenAI text-embedding-3-small embeddings in batches.
    4. Upsert embeddings into ChromaDB (idempotent).
    5. Cluster all embeddings with K-Means or DBSCAN.
    6. Write cluster_id back to Supabase in batched upserts.

    Parameters
    ----------
    n_clusters:
        Number of K-Means clusters. If None, optimal k is found automatically.
    clustering_method:
        'kmeans' (default) or 'dbscan'.
    skip_existing_embeddings:
        When True, reviews already in ChromaDB are not re-embedded (saves API cost).
        They are still re-clustered along with newly embedded reviews.
    dbscan_eps, dbscan_min_samples:
        DBSCAN hyper-parameters (only used when clustering_method='dbscan').
    """
    logger.info("=" * 60)
    logger.info("Phase 2.1: Embedding Generation & Clustering — START")
    logger.info("=" * 60)

    # 0. Pre-flight: confirm cluster_id column exists before spending API budget
    if not check_cluster_id_column_exists():
        msg = (
            "\n"
            "╔══════════════════════════════════════════════════════════════╗\n"
            "║  MIGRATION REQUIRED before Phase 2.1 can run               ║\n"
            "╠══════════════════════════════════════════════════════════════╣\n"
            "║  Open your Supabase project → SQL Editor and run:          ║\n"
            "║                                                              ║\n"
            f"║  {MIGRATION_SQL:<60}║\n"
            "║                                                              ║\n"
            "║  Then re-run this script.                                   ║\n"
            "╚══════════════════════════════════════════════════════════════╝"
        )
        logger.error(msg)
        return {"error": "migration_required", "sql": MIGRATION_SQL}

    logger.info("Pre-flight OK — cluster_id column exists.")

    # 1. Fetch reviews
    all_reviews = fetch_processed_reviews()
    if not all_reviews:
        logger.warning("No processed reviews found in Supabase. Aborting.")
        return {}

    # 2. Determine which reviews need new embeddings
    collection = setup_chromadb()

    if skip_existing_embeddings:
        existing_ids = get_already_embedded_ids(collection)
        new_reviews = [r for r in all_reviews if str(r["id"]) not in existing_ids]
        logger.info(
            "%d reviews already in ChromaDB; %d need new embeddings.",
            len(existing_ids),
            len(new_reviews),
        )
    else:
        new_reviews = all_reviews
        logger.info("skip_existing_embeddings=False — re-embedding all %d reviews.", len(new_reviews))

    # 3. Generate embeddings for new reviews
    if new_reviews:
        new_embeddings, new_reviews = generate_all_embeddings(new_reviews)
        logger.info("Generated %d new embeddings.", len(new_embeddings))

        # 4. Upsert into ChromaDB
        upsert_embeddings_in_chromadb(new_reviews, new_embeddings, collection)
    else:
        logger.info("All reviews already embedded — skipping embedding step.")

    # Load ALL embeddings from ChromaDB for clustering (paginated to avoid SQLite variable limit)
    logger.info("Loading all embeddings from ChromaDB for clustering…")
    id_to_embedding = _load_all_embeddings_from_chromadb(all_reviews, collection)

    aligned_reviews: List[Dict[str, Any]] = []
    aligned_embeddings: List[List[float]] = []

    for review in all_reviews:
        emb = id_to_embedding.get(str(review["id"]))
        if emb is not None:
            aligned_reviews.append(review)
            aligned_embeddings.append(emb)
        else:
            logger.warning("No embedding found for review %s — excluded from clustering.", review["id"])

    if not aligned_embeddings:
        logger.error("No embeddings available for clustering. Aborting.")
        return {}

    embeddings_array = np.array(aligned_embeddings, dtype=np.float32)
    logger.info("Clustering %d reviews…", len(aligned_reviews))

    # 5. Cluster
    if clustering_method == "kmeans":
        labels = cluster_kmeans(embeddings_array, n_clusters=n_clusters)
    elif clustering_method == "dbscan":
        labels = cluster_dbscan(embeddings_array, eps=dbscan_eps, min_samples=dbscan_min_samples)
    else:
        raise ValueError(f"Unknown clustering_method: '{clustering_method}'. Use 'kmeans' or 'dbscan'.")

    # 6. Write cluster_id back to Supabase
    success_count, error_count = assign_cluster_ids_to_supabase(aligned_reviews, labels)

    n_unique_clusters = len(set(labels.tolist()))
    result: Dict[str, Any] = {
        "total_reviews_in_supabase": len(all_reviews),
        "new_embeddings_generated": len(new_reviews) if new_reviews else 0,
        "reviews_clustered": len(aligned_reviews),
        "clusters_found": n_unique_clusters,
        "clustering_method": clustering_method,
        "cluster_ids_written_to_supabase": success_count,
        "supabase_errors": error_count,
    }

    logger.info("=" * 60)
    logger.info("Phase 2.1 complete: %s", result)
    logger.info("=" * 60)
    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 2.1 — Embedding Generation & Clustering")
    parser.add_argument(
        "--n-clusters",
        type=int,
        default=None,
        help="Number of K-Means clusters. Omit to auto-select via elbow + silhouette.",
    )
    parser.add_argument(
        "--method",
        choices=["kmeans", "dbscan"],
        default="kmeans",
        help="Clustering algorithm (default: kmeans).",
    )
    parser.add_argument(
        "--no-skip",
        action="store_true",
        help="Re-embed all reviews even if already in ChromaDB.",
    )
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
    print(f"\nPhase 2.1 Results:\n{result}")
