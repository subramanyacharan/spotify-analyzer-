from src.phase3_knowledge.insight_prioritization import (
    _assign_action_tier,
    build_prioritization_matrix,
    compute_segment_friction_scores,
    compute_top_pain_points,
)
from src.phase3_knowledge.problem_statement_engine import ReviewRecord


def _review(segment="Playlist Driven", sentiment="negative", themes=None, cluster_id=0):
    return ReviewRecord(
        id="1",
        cleaned_text="Discover Weekly repeats",
        themes=themes or ["Repetitive Recommendations"],
        sentiment_label=sentiment,
        sentiment_score=1,
        user_segment="Casual Listener",
        behavioral_segment=segment,
        cluster_id=cluster_id,
        source="play_store",
        review_date="2026-06-15T00:00:00+00:00",
        rating=2,
        pain_points=[{"pain_point": "Repetitive recommendations"}],
    )


def test_segment_friction_scores_ordering():
    records = [
        _review("Playlist Driven", "negative"),
        _review("Playlist Driven", "negative"),
        _review("Casual Listener", "positive", ["General"], 1),
    ]
    cluster_insights = [{"cluster_id": 0, "severity": 5}]
    scores = compute_segment_friction_scores(records, cluster_insights)
    pd = next(s for s in scores if s["segment"] == "Playlist Driven")
    cl = next(s for s in scores if s["segment"] == "Casual Listener")
    assert pd["friction_score"] > cl["friction_score"]


def test_top_pain_points_ranked_by_impact():
    records = [_review()]
    cluster_insights = [
        {
            "cluster_id": 0,
            "pain_point": "Repetitive songs",
            "severity": 5,
            "review_count": 100,
        }
    ]
    pains = compute_top_pain_points(records, cluster_insights)
    assert pains[0]["pain_point"] == "Repetitive songs"
    assert pains[0]["impact_score"] > 0


def test_prioritization_matrix_has_tiers():
    matrix = build_prioritization_matrix(
        top_pain_points=[{"pain_point": "X", "impact_score": 100, "frequency": 10, "avg_severity": 5, "cluster_ids": [0]}],
        segment_friction=[{"segment": "Playlist Driven", "friction_score": 0.5, "review_count": 10, "negative_pct": 30, "discovery_theme_pct": 40}],
        opportunities=[{
            "product_opportunity": "Improve algo",
            "pain_point": "Bad recs",
            "tier": "Critical",
            "cluster_id": 0,
            "review_count": 100,
            "scores": {"composite": 0.15},
            "evidence": {"representative_quotes": ["quote"]},
        }],
        emerging=[],
    )
    assert matrix[0]["rank"] == 1
    assert _assign_action_tier(0.15) == "Critical"
