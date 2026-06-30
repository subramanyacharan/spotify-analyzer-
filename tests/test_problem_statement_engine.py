from src.phase3_knowledge.problem_statement_engine import (
    QueryFilters,
    _select_relevant_reviews,
    _theme_matches,
    default_analysis_filters,
    normalize_behavioral_segment,
    resolve_query_filters,
    CORE_QUESTIONS,
    ReviewRecord,
)


def test_normalize_behavioral_segment_maps_phase2_labels():
    assert normalize_behavioral_segment("Heavy Listener", "", []) == "Heavy Listener"
    assert normalize_behavioral_segment("New User", "", []) == "Discovery Seeker"
    assert normalize_behavioral_segment("Premium User", "", []) == "Habit Listener"


def test_normalize_playlist_driven_from_text():
    text = "I only use my Discover Weekly playlist every day"
    assert normalize_behavioral_segment("Casual Listener", text, []) == "Playlist Driven"


def test_normalize_discovery_seeker_from_text():
    text = "I want to explore and find new artists"
    assert normalize_behavioral_segment("Casual Listener", text, []) == "Discovery Seeker"


def test_theme_matches_keywords():
    assert _theme_matches(["repetitive"], ["Repetitive Recommendations"], "")
    assert not _theme_matches(["discover"], ["Billing Issues"], "great app")


def test_resolve_query_filters_defaults_empty_to_90_day_window():
    resolved = resolve_query_filters(QueryFilters())
    default = default_analysis_filters()
    assert resolved.date_start == default.date_start


def test_select_relevant_reviews_for_repetitive_question():
    records = [
        ReviewRecord(
            id="1", cleaned_text="same songs repeat", themes=["Repetitive Recommendations"],
            sentiment_label="negative", sentiment_score=1, user_segment="Casual Listener",
            behavioral_segment="Casual Listener", cluster_id=0,
            source="play_store", review_date="2026-06-01", rating=2,
        ),
        ReviewRecord(
            id="2", cleaned_text="love the ui", themes=["General"],
            sentiment_label="positive", sentiment_score=5, user_segment="Casual Listener",
            behavioral_segment="Casual Listener", cluster_id=1,
            source="play_store", review_date="2026-06-01", rating=5,
        ),
    ]
    q = next(q for q in CORE_QUESTIONS if q["id"] == "repetitive_listening")
    relevant = _select_relevant_reviews(records, q)
    assert len(relevant) == 1
    assert relevant[0].id == "1"
