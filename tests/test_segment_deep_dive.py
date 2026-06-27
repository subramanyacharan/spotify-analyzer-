from src.phase3_knowledge.problem_statement_engine import ReviewRecord
from src.phase3_knowledge.segment_deep_dive import (
    _listening_intent_signals,
    build_segment_comparison,
    build_segment_profile,
)


def _make_review(segment, text, themes=None, sentiment="neutral", cluster_id=0):
    return ReviewRecord(
        id="1",
        cleaned_text=text,
        themes=themes or ["General"],
        sentiment_label=sentiment,
        sentiment_score=3,
        user_segment="Casual Listener",
        behavioral_segment=segment,
        cluster_id=cluster_id,
        source="play_store",
        review_date="2026-06-01",
        rating=3,
        pain_points=[{"source": "cluster_llm", "pain_point": "Repetitive songs"}],
    )


def test_listening_intent_discovery_dominant():
    reviews = [
        _make_review("Discovery Seeker", "I want to explore and find new artists"),
        _make_review("Discovery Seeker", "The recommendation algorithm fails to suggest new music"),
    ]
    signals = _listening_intent_signals(reviews)
    assert signals["dominant_intent"] == "discovery"
    assert signals["discovery_pct"] == 100.0


def test_build_segment_profile_has_required_fields():
    reviews = [
        _make_review(
            "Playlist Driven",
            "My Discover Weekly playlist repeats the same songs",
            themes=["Playlist Fatigue", "Repetitive Recommendations"],
            sentiment="negative",
        )
    ]
    profile = build_segment_profile("Playlist Driven", reviews, [])
    assert profile["segment"] == "Playlist Driven"
    assert profile["review_count"] == 1
    assert "top_themes" in profile
    assert "listening_intent_signals" in profile
    assert "cluster_overlap" in profile
    assert profile["representative_quotes"]


def test_segment_comparison_ranks_friction():
    reviews = [
        _make_review(
            "Playlist Driven",
            "same song repeats on discover weekly every day",
            themes=["Repetitive Recommendations"],
            sentiment="negative",
        ),
        _make_review("Casual Listener", "great app love it", themes=["General"], sentiment="positive"),
    ]
    comp = build_segment_comparison(reviews)
    assert comp["repetitive_listening_ranking"][0]["segment"] == "Playlist Driven"
    assert comp["highest_friction_segment"] == "Playlist Driven"
