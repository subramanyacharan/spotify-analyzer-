from src.phase3_knowledge.opportunity_scoring import (
    _assign_tier,
    _is_supported_opportunity,
    build_opportunity_candidates,
    compute_opportunity_score,
)
from src.phase3_knowledge.problem_statement_engine import ReviewRecord


def _review(segment="Playlist Driven", sentiment="negative", score=1, cluster_id=0):
    return ReviewRecord(
        id="1",
        cleaned_text="Discover Weekly repeats the same songs",
        themes=["Repetitive Recommendations"],
        sentiment_label=sentiment,
        sentiment_score=score,
        user_segment="Casual Listener",
        behavioral_segment=segment,
        cluster_id=cluster_id,
        source="play_store",
        review_date="2026-06-01",
        rating=2,
        pain_points=[{"pain_point": "Repetitive recommendations"}],
    )


def test_compute_opportunity_score_components():
    reviews = [_review(), _review("Habit Listener", "negative", 2)]
    scores = compute_opportunity_score(
        review_count=100,
        max_count=200,
        severity=5,
        reviews=reviews,
    )
    assert scores["frequency"] == 0.5
    assert scores["severity"] == 1.0
    assert scores["segment_impact"] == 1.0
    assert scores["composite"] > 0


def test_unsupported_opportunity_filtered():
    assert not _is_supported_opportunity("Personalize for age groups and students")
    assert _is_supported_opportunity("Improve Discover Weekly algorithm")


def test_build_opportunity_candidates_ranks_by_composite():
    records = [_review(cluster_id=0) for _ in range(10)] + [
        _review("Casual Listener", "positive", 5, cluster_id=1) for _ in range(5)
    ]
    cluster_insights = [
        {
            "cluster_id": 0,
            "themes": ["Repetitive Recommendations"],
            "pain_point": "Repetitive songs",
            "severity": 5,
            "product_opportunity": "Improve recommendation diversity",
            "review_count": 10,
            "representative_user_quotes": ["same songs every week"],
        },
        {
            "cluster_id": 1,
            "themes": ["General"],
            "pain_point": "Minor issue",
            "severity": 2,
            "product_opportunity": "Fix minor UI bug",
            "review_count": 5,
            "representative_user_quotes": ["ok app"],
        },
    ]
    opps = build_opportunity_candidates(records, cluster_insights)
    assert opps[0]["cluster_id"] == 0
    assert opps[0]["rank"] == 1
    assert _assign_tier(opps[0]["scores"]["composite"], 1) == "Critical"
