"""Tests for Phase 5.1 weekly report generator."""

from src.phase5_orchestration.weekly_report_generator import (
    build_confidence_summary,
    build_emerging_complaints,
    build_markdown_report,
    build_new_opportunities,
    build_problem_statement_summary,
    build_theme_shifts,
    generate_weekly_report,
)


def _sample_problem():
    return {
        "total_reviews_analyzed": 1000,
        "answers": [
            {
                "question_id": "recommendation_frustrations",
                "question": "What frustrates users about recommendations?",
                "finding_summary": "Repetitive playlists dominate complaints.",
                "supporting_metrics": {
                    "review_count": 800,
                    "sentiment_breakdown": {
                        "positive": 100,
                        "neutral": 200,
                        "negative": 500,
                        "negative_pct": 62.5,
                    },
                    "top_themes": [
                        {"theme": "Repetitive Recommendations", "count": 400},
                        {"theme": "Playlist Fatigue", "count": 200},
                    ],
                },
                "representative_quotes": ["Same songs every week", "Discover Weekly is broken"],
            }
        ],
    }


def _sample_prioritization():
    return {
        "total_reviews_analyzed": 1000,
        "tier_summary": {"Critical": 2, "High": 3},
        "top_pain_points": [
            {"pain_point": "Repetitive recommendations", "frequency": 400, "avg_severity": 5},
            {"pain_point": "Widget redesign", "frequency": 100, "avg_severity": 4},
        ],
        "segment_friction_scores": [
            {
                "segment": "Playlist Driven",
                "review_count": 500,
                "friction_score": 0.75,
                "negative_pct": 30,
                "avg_cluster_severity": 4.8,
            },
            {
                "segment": "Casual Listener",
                "review_count": 300,
                "friction_score": 0.55,
                "negative_pct": 20,
                "avg_cluster_severity": 4.0,
            },
        ],
        "prioritization_matrix": [
            {
                "rank": 1,
                "tier": "Critical",
                "type": "pain_point",
                "title": "Fix repetitive recommendations",
                "recommendation": "Refresh discovery algorithms weekly.",
                "evidence": {"frequency": 400, "avg_severity": 5, "quotes": ["Same songs"]},
            }
        ],
        "top_priority": {
            "rank": 1,
            "tier": "Critical",
            "title": "Fix repetitive recommendations",
            "recommendation": "Refresh discovery algorithms weekly.",
            "evidence": {"quotes": ["Same songs every week"], "frequency": 400},
        },
        "emerging_issues": [],
    }


def _sample_opportunities():
    return {
        "opportunities": [
            {
                "cluster_id": 1,
                "rank": 1,
                "tier": "Critical",
                "pain_point": "Repetitive recommendations",
                "product_opportunity": "Improve Discover Weekly",
                "review_count": 400,
                "scores": {"composite": 0.18, "severity": 1.0},
                "evidence": {"representative_quotes": ["Same songs"]},
            }
        ]
    }


def test_problem_statement_summary_includes_confidence():
    summary = build_problem_statement_summary(_sample_problem())
    assert len(summary["answers"]) == 1
    assert summary["answers"][0]["confidence"]["level"] in ("High", "Medium", "Low")


def test_theme_shifts_detects_spike():
    prior = {
        "answers": [
            {
                "supporting_metrics": {
                    "top_themes": [{"theme": "Playlist Fatigue", "count": 100}],
                }
            }
        ]
    }
    current = _sample_problem()
    shifts = build_theme_shifts(current, prior)
    assert any(s["theme"] == "Repetitive Recommendations" for s in shifts)


def test_emerging_complaints_from_pain_spike():
    current = _sample_prioritization()
    prior = {
        "top_pain_points": [
            {"pain_point": "Repetitive recommendations", "frequency": 200, "avg_severity": 5},
        ]
    }
    emerging = build_emerging_complaints(current, prior)
    assert len(emerging) >= 1
    assert emerging[0]["change_pct"] >= 15


def test_new_opportunities_flags_new_cluster():
    current = _sample_opportunities()
    prior = {"opportunities": []}
    new = build_new_opportunities(current, prior)
    assert len(new) == 1
    assert new[0]["status"] == "new"


def test_generate_weekly_report_structure():
    payloads = {
        "problem_statement_insights": _sample_problem(),
        "insight_prioritization": _sample_prioritization(),
        "opportunity_scores": _sample_opportunities(),
        "segment_deep_dives": {},
    }
    report = generate_weekly_report(
        payloads,
        prior_payloads={"insight_prioritization": _sample_prioritization()},
        week_start="2026-06-16",
        week_end="2026-06-22",
    )
    sections = report["sections"]
    assert "problem_statement_summary" in sections
    assert "emerging_complaints" in sections
    assert "theme_shifts" in sections
    assert "segment_changes" in sections
    assert "new_opportunities" in sections
    assert "prioritization_highlights" in sections
    assert "confidence_summary" in sections
    assert "executive_summary" in sections
    assert set(sections["segment_changes"].keys()) >= {"business", "behavior", "pain"}


def test_markdown_report_contains_sections():
    report = generate_weekly_report(
        {
            "problem_statement_insights": _sample_problem(),
            "insight_prioritization": _sample_prioritization(),
            "opportunity_scores": _sample_opportunities(),
            "segment_deep_dives": {},
        },
        week_start="2026-06-16",
        week_end="2026-06-22",
    )
    md = build_markdown_report(report)
    assert "Weekly Intelligence Report" in md
    assert "Executive Summary" in md
    assert "Segment Changes" in md


def test_confidence_summary_counts():
    sections = {
        "problem_statement_summary": {
            "answers": [{"confidence": {"level": "High"}, "question_id": "q1"}]
        },
        "new_opportunities": [{"confidence": {"level": "Medium"}}],
        "prioritization_highlights": {
            "highlights": [{"confidence": {"level": "Low"}, "rank": 1}]
        },
    }
    summary = build_confidence_summary(sections)
    assert summary["counts"]["High"] == 1
    assert summary["counts"]["Medium"] == 1
    assert summary["counts"]["Low"] == 1
