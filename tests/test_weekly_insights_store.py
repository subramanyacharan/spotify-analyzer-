from src.phase3_knowledge.problem_statement_engine import (
    QueryFilters,
    default_analysis_filters,
    resolve_query_filters,
)
from src.phase5_orchestration.weekly_insights_store import (
    looks_like_full_corpus_count,
    payload_review_count,
)


def test_resolve_query_filters_defaults_empty_to_90_day_window():
    resolved = resolve_query_filters(QueryFilters())
    default = default_analysis_filters()
    assert resolved.date_start == default.date_start
    assert resolved.date_end is None


def test_resolve_query_filters_preserves_explicit_dates():
    filt = QueryFilters(date_start="2026-01-01", date_end="2026-03-01")
    resolved = resolve_query_filters(filt)
    assert resolved.date_start == "2026-01-01"
    assert resolved.date_end == "2026-03-01"


def test_payload_review_count_reads_total():
    assert payload_review_count({"total_reviews_analyzed": 48730}) == 48730
    assert payload_review_count({}) == 0


def test_looks_like_full_corpus_count():
    class FakeClient:
        class table:
            @staticmethod
            def select(*args, **kwargs):
                return FakeClient

            @staticmethod
            def execute():
                class Result:
                    count = 152834

                return Result()

    assert looks_like_full_corpus_count(152834, FakeClient()) is True
    assert looks_like_full_corpus_count(48730, FakeClient()) is False
