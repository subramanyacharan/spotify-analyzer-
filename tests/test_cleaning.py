from datetime import datetime, timezone

from src.phase1_data_pipeline.data_cleaning import (
    clean_review_text,
    clean_reviews,
    filter_short_reviews,
    normalize_date,
    normalize_rating,
    normalize_review_record,
)


def test_normalize_date_from_datetime():
    dt = datetime(2026, 3, 22, 17, 38, 15, tzinfo=timezone.utc)
    assert normalize_date(dt) == "2026-03-22T17:38:15+00:00"


def test_normalize_date_from_iso_string():
    assert normalize_date("2026-03-22T17:38:15+00:00") == "2026-03-22T17:38:15+00:00"
    assert normalize_date("2026-03-22T17:38:15Z") == "2026-03-22T17:38:15+00:00"


def test_clean_review_text_removes_html_and_whitespace():
    raw = "  Great&nbsp;app!!!   <b>Love</b> it  "
    assert clean_review_text(raw) == "Great app!!! Love it"


def test_clean_review_text_handles_encoding_artifacts():
    raw = "It" + "\u00e2\u20ac\u2122" + "s amazing"
    assert clean_review_text(raw) == "It's amazing"


def test_normalize_rating_clamps_invalid_values():
    assert normalize_rating(4) == 4
    assert normalize_rating(0) is None
    assert normalize_rating("bad") is None


def test_normalize_review_record_standardizes_columns():
    raw = {
        "id": "uuid-1",
        "source": "Play_Store",
        "review_id": "ps_123",
        "review_text": "  Love&nbsp;this  ",
        "rating": 5,
        "review_date": "2026-06-19T17:35:03+00:00",
        "version": "9.0.1",
        "thumbs_up_count": 3,
        "metadata": {"userName": "tester"},
    }

    cleaned = normalize_review_record(raw)

    assert cleaned["raw_review_id"] == "uuid-1"
    assert cleaned["source"] == "play_store"
    assert cleaned["review_text"] == "Love this"
    assert cleaned["rating"] == 5
    assert cleaned["date"] == "2026-06-19T17:35:03+00:00"


def test_filter_short_reviews():
    reviews = [
        {"review_text": "short"},
        {"review_text": "long enough review"},
    ]
    filtered = filter_short_reviews(reviews, min_length=10)
    assert len(filtered) == 1
    assert filtered[0]["review_text"] == "long enough review"


def test_clean_reviews_filters_short_entries():
    raw_reviews = [
        {
            "id": "1",
            "source": "play_store",
            "review_id": "ps_1",
            "review_text": "ok",
            "rating": 1,
            "review_date": "2026-06-01T00:00:00+00:00",
            "version": "1.0",
            "thumbs_up_count": 0,
            "metadata": {},
        },
        {
            "id": "2",
            "source": "app_store",
            "review_id": "as_2",
            "review_text": "This is a valid review",
            "rating": 5,
            "review_date": "2026-06-02T00:00:00+00:00",
            "version": "1.1",
            "thumbs_up_count": 1,
            "metadata": {},
        },
    ]

    cleaned = clean_reviews(raw_reviews)
    assert len(cleaned) == 1
    assert cleaned[0]["review_id"] == "as_2"
