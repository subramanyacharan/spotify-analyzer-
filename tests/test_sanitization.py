from src.phase1_data_pipeline.data_sanitization import (
    REDACTION_TOKEN,
    audit_pii_leakage,
    sanitize_metadata,
    sanitize_review_record,
    sanitize_text,
)
from src.phase1_data_pipeline.deduplication import (
    deduplicate_reviews,
    exact_deduplicate,
    fuzzy_deduplicate,
    review_text_hash,
)


def test_sanitize_text_redacts_email_url_and_phone():
    raw = "Contact me at user@example.com or visit https://example.com or call 555-123-4567"
    sanitized = sanitize_text(raw, use_ner=False)

    assert "user@example.com" not in sanitized
    assert "https://example.com" not in sanitized
    assert "555-123-4567" not in sanitized
    assert sanitized.count(REDACTION_TOKEN) >= 3
    assert audit_pii_leakage(sanitized) == []


def test_sanitize_text_redacts_obfuscated_email():
    raw = "Reach me at john [at] gmail [dot] com for support"
    sanitized = sanitize_text(raw, use_ner=False)

    assert "gmail" not in sanitized.lower() or REDACTION_TOKEN in sanitized
    assert audit_pii_leakage(sanitized) == []


def test_sanitize_metadata_redacts_username():
    metadata = {"userName": "Jane Doe", "title": "Great app"}
    sanitized = sanitize_metadata(metadata)

    assert sanitized["userName"] == REDACTION_TOKEN
    assert sanitized["title"] == REDACTION_TOKEN


def test_sanitize_review_record_adds_sanitized_text():
    review = {
        "review_id": "ps_1",
        "review_text": "Email me at test@mail.com please",
        "metadata": {"userName": "Alice"},
    }

    sanitized = sanitize_review_record(review, use_ner=False)

    assert "test@mail.com" not in sanitized["sanitized_text"]
    assert sanitized["metadata"]["userName"] == REDACTION_TOKEN


def test_exact_deduplicate_removes_identical_reviews():
    reviews = [
        {"review_id": "1", "sanitized_text": "Same review text here", "thumbs_up_count": 1, "date": "2026-06-02"},
        {"review_id": "2", "sanitized_text": "Same review text here", "thumbs_up_count": 5, "date": "2026-06-01"},
    ]

    kept, removed = exact_deduplicate(reviews)

    assert removed == 1
    assert len(kept) == 1
    assert kept[0]["review_id"] == "2"


def test_review_text_hash_is_case_and_whitespace_insensitive():
    assert review_text_hash("Hello   World") == review_text_hash("hello world")


def test_fuzzy_deduplicate_removes_near_duplicates():
    reviews = [
        {
            "review_id": "1",
            "sanitized_text": "Spotify keeps playing the same songs every single day",
            "thumbs_up_count": 1,
            "date": "2026-06-01",
        },
        {
            "review_id": "2",
            "sanitized_text": "Spotify keeps playing the same songs every single day!",
            "thumbs_up_count": 3,
            "date": "2026-06-02",
        },
        {
            "review_id": "3",
            "sanitized_text": "Completely different review about podcast features",
            "thumbs_up_count": 0,
            "date": "2026-06-03",
        },
    ]

    kept, removed = fuzzy_deduplicate(reviews, threshold=0.8)

    assert removed == 1
    assert len(kept) == 2
    kept_ids = {review["review_id"] for review in kept}
    assert kept_ids == {"2", "3"}


def test_deduplicate_reviews_reports_stats():
    reviews = [
        {"review_id": "1", "sanitized_text": "Exact duplicate review text", "thumbs_up_count": 1, "date": "2026-06-01"},
        {"review_id": "2", "sanitized_text": "Exact duplicate review text", "thumbs_up_count": 2, "date": "2026-06-02"},
        {"review_id": "3", "sanitized_text": "Unique review about discovery playlists", "thumbs_up_count": 0, "date": "2026-06-03"},
    ]

    kept, stats = deduplicate_reviews(reviews, fuzzy_threshold=0.95)

    assert stats["input_count"] == 3
    assert stats["exact_duplicates_removed"] == 1
    assert stats["output_count"] == len(kept)
