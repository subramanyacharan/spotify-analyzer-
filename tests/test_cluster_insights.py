from src.phase2_analysis.cluster_insights import (
    _validate_insight,
    build_weekly_pulse_markdown,
    select_representative_samples,
)


def test_select_representative_samples_prioritises_negative():
    reviews = [
        {"cleaned_text": "Great app", "sentiment_score": 5},
        {"cleaned_text": "Terrible discovery algorithm", "sentiment_score": 1},
        {"cleaned_text": "It is okay", "sentiment_score": 3},
    ]
    samples = select_representative_samples(reviews, n=2)
    assert samples[0]["sentiment_score"] == 1


def test_validate_insight_clamps_severity_and_quotes():
    insight = _validate_insight(
        {
            "pain_point": "Recommendations repeat too often",
            "severity": 9,
            "feature_request": "Better discovery playlists",
            "representative_user_quotes": ["quote one"],
            "product_opportunity": "Improve personalization",
        },
        cluster_id=0,
    )
    assert insight["severity"] == 5
    assert len(insight["representative_user_quotes"]) == 3


def test_build_weekly_pulse_markdown_includes_clusters():
    clusters = [
        {
            "cluster_id": 0,
            "themes": ["Playlist Fatigue"],
            "review_count": 100,
            "severity": 4,
            "pain_point": "Same songs every week",
            "feature_request": "Fresh weekly mixes",
            "product_opportunity": "Revamp Discover Weekly",
            "representative_user_quotes": ["I hear the same songs"],
        }
    ]
    md = build_weekly_pulse_markdown(clusters)
    assert "Cluster 0" in md
    assert "Same songs every week" in md
