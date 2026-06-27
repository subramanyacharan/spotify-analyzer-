from datetime import datetime, timedelta, timezone

from src.phase3_knowledge.embedding_store import (
    build_chroma_metadata,
    build_embedding_chunk,
    compute_week_number,
    format_themes,
    is_within_rolling_window,
    primary_theme,
)


def test_build_embedding_chunk_includes_all_fields():
    review = {
        "cleaned_text": "Discover Weekly is repetitive.",
        "themes": ["Repetitive Recommendations", "Discover Weekly"],
        "sentiment_label": "negative",
        "sentiment_score": -0.42,
        "user_segment": "Premium User",
    }
    chunk = build_embedding_chunk(review)
    assert "Discover Weekly is repetitive." in chunk
    assert "Repetitive Recommendations" in chunk
    assert "negative" in chunk
    assert "Premium User" in chunk


def test_build_chroma_metadata_scalar_fields():
    review = {
        "review_date": "2026-06-05T21:22:19+00:00",
        "source": "play_store",
        "user_segment": "Casual Listener",
        "themes": ["Playlist Fatigue"],
        "sentiment_label": "positive",
        "cluster_id": 2,
    }
    meta = build_chroma_metadata(review)
    assert meta["date"] == "2026-06-05"
    assert meta["source"] == "play_store"
    assert meta["segment"] == "Casual Listener"
    assert meta["theme"] == "Playlist Fatigue"
    assert meta["week_number"] == compute_week_number(review["review_date"])
    assert meta["sentiment"] == "positive"
    assert meta["cluster_id"] == 2


def test_format_themes_and_primary_theme():
    assert format_themes([]) == "General"
    assert format_themes(["A", "B"]) == "A, B"
    assert primary_theme(["First", "Second"]) == "First"
    assert primary_theme(None) == "General"


def test_is_within_rolling_window():
    recent = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    old = (datetime.now(timezone.utc) - timedelta(days=120)).isoformat()
    assert is_within_rolling_window(recent, window_days=90) is True
    assert is_within_rolling_window(old, window_days=90) is False
    assert is_within_rolling_window("", window_days=90) is False
