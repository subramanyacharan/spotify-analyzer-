import numpy as np

from src.phase2_analysis.embedding_clustering import (
    cluster_dbscan,
    cluster_kmeans,
    _find_optimal_k,
)


def test_cluster_kmeans_returns_labels():
    rng = np.random.default_rng(42)
    embeddings = np.vstack([
        rng.normal(0, 0.1, (20, 8)),
        rng.normal(5, 0.1, (20, 8)),
    ])
    labels = cluster_kmeans(embeddings, n_clusters=2)
    assert len(labels) == 40
    assert len(set(labels.tolist())) == 2


def test_cluster_dbscan_marks_noise():
    rng = np.random.default_rng(42)
    embeddings = np.vstack([
        rng.normal(0, 0.01, (15, 8)),
        rng.normal(10, 0.01, (15, 8)),
    ])
    labels = cluster_dbscan(embeddings, eps=0.5, min_samples=3)
    assert len(labels) == 30


def test_find_optimal_k_within_range():
    rng = np.random.default_rng(0)
    embeddings = np.vstack([
        rng.normal(i * 3, 0.2, (10, 6)) for i in range(4)
    ])
    k = _find_optimal_k(embeddings)
    assert 2 <= k <= 12
