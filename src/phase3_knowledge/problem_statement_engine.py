"""
Phase 3.1: Problem Statement Query Engine

Answers the six core product-discovery questions using Supabase aggregates
and Phase 2 cluster-level insights — no per-review LLM calls.

Data sources
------------
  processed_reviews  — themes, sentiment, segments, clusters, cleaned_text
  cluster_insights   — pain points, severity, quotes, opportunities
  raw_reviews        — date, source, rating (for filtering)
  review_knowledge   — optional ChromaDB collection for quote retrieval
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.supabase_client import get_supabase_client
from src.phase2_analysis.prompts import ANALYSIS_WINDOW_DAYS, rank_themes_by_count

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Behavioral segment taxonomy (Phase 3 decision-facing)
# ---------------------------------------------------------------------------

BEHAVIORAL_SEGMENTS = [
    "Discovery Seeker",
    "Habit Listener",
    "Heavy Listener",
    "Playlist Driven",
    "Niche Listener",
    "Casual Listener",
]

PHASE2_SEGMENT_MAP = {
    "New User": "Discovery Seeker",
    "Premium User": "Habit Listener",
    "Heavy Listener": "Heavy Listener",
    "Niche Music Listener": "Niche Listener",
    "Casual Listener": "Casual Listener",
}

PLAYLIST_PATTERN = re.compile(
    r"\b(playlist|discover weekly|daily mix|release radar|my mix|liked songs)\b",
    re.I,
)
DISCOVERY_PATTERN = re.compile(
    r"\b(discover|explore|find new|recommendation|suggest|algorithm)\b",
    re.I,
)

FETCH_BATCH_SIZE = 1000
OUTPUT_DIR = os.path.join(project_root, "data", "outputs")
DEFAULT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "problem_statement_insights.json")

# ---------------------------------------------------------------------------
# Core questions & theme relevance
# ---------------------------------------------------------------------------

CORE_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "discovery_struggle",
        "question": "Why do users struggle to discover new music?",
        "theme_keywords": [
            "discover", "discovery", "explore", "find new", "recommendation quality",
            "niche", "algorithm",
        ],
        "text_keywords": ["discover", "explore", "find new", "can't find", "hard to find"],
    },
    {
        "id": "recommendation_frustrations",
        "question": "What are the most common frustrations with recommendations?",
        "theme_keywords": [
            "repetitive", "recommendation", "playlist fatigue", "algorithm", "quality",
        ],
        "text_keywords": ["recommend", "suggest", "same songs", "repeat", "algorithm"],
    },
    {
        "id": "listening_behaviors",
        "question": "What listening behaviors are users trying to achieve?",
        "theme_keywords": ["playlist", "mood", "comfort", "background", "workout", "sleep"],
        "text_keywords": [
            "listen while", "background", "mood", "workout", "sleep", "study",
            "comfort", "relax", "party", "commute",
        ],
    },
    {
        "id": "repetitive_listening",
        "question": "What causes repetitive listening behavior?",
        "theme_keywords": ["repetitive", "playlist fatigue", "same", "repeat"],
        "text_keywords": [
            "same song", "same artist", "repeat", "over and over", "again and again",
            "playlist fatigue", "hear the same",
        ],
    },
    {
        "id": "segment_discovery_challenges",
        "question": "Which behavioral user segments face the biggest discovery challenges?",
        "theme_keywords": [
            "discover", "repetitive", "recommendation", "playlist fatigue", "niche",
        ],
        "text_keywords": ["discover", "recommend", "repeat", "explore"],
    },
    {
        "id": "unmet_needs",
        "question": "What unmet needs emerge consistently across reviews?",
        "theme_keywords": [],  # use all cluster insights
        "text_keywords": ["wish", "need", "want", "should", "missing", "lack"],
    },
]


@dataclass
class QueryFilters:
    """Optional filters for problem-statement queries."""

    date_start: Optional[str] = None
    date_end: Optional[str] = None
    source: Optional[str] = None
    theme: Optional[str] = None
    sentiment: Optional[str] = None
    behavioral_segment: Optional[str] = None
    cluster_id: Optional[int] = None


def default_analysis_filters() -> QueryFilters:
    """Rolling analysis window aligned with project spec (90 days)."""
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=ANALYSIS_WINDOW_DAYS)
    ).date().isoformat()
    return QueryFilters(date_start=cutoff)


def resolve_query_filters(filters: Optional[QueryFilters] = None) -> QueryFilters:
    """
    Always scope Phase 3 analysis to the 90-day window unless explicit dates are set.

    Empty QueryFilters() from CLI reruns must not load the full processed_reviews corpus.
    """
    if filters is None:
        return default_analysis_filters()
    if filters.date_start is None and filters.date_end is None:
        return default_analysis_filters()
    return filters


@dataclass
class ReviewRecord:
    id: str
    cleaned_text: str
    themes: List[str]
    sentiment_label: str
    sentiment_score: Optional[float]
    user_segment: str
    behavioral_segment: str
    cluster_id: Optional[int]
    source: str
    review_date: str
    rating: Optional[int]
    pain_points: List[Any] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Segment normalization
# ---------------------------------------------------------------------------


def normalize_behavioral_segment(
    user_segment: str,
    cleaned_text: str = "",
    themes: Optional[List[str]] = None,
) -> str:
    """
    Map Phase 2 user_segment labels to the Phase 3 behavioral taxonomy.
    Refine with text/theme signals for Playlist Driven and Discovery Seeker.
    """
    text = (cleaned_text or "").lower()
    theme_str = " ".join(themes or []).lower()

    if PLAYLIST_PATTERN.search(text) or "playlist" in theme_str:
        return "Playlist Driven"
    if DISCOVERY_PATTERN.search(text) or "discover" in theme_str:
        return "Discovery Seeker"

    return PHASE2_SEGMENT_MAP.get(user_segment or "", "Casual Listener")


def _parse_themes(themes: Any) -> List[str]:
    if not themes:
        return []
    if isinstance(themes, list):
        return [str(t) for t in themes if t]
    return [str(themes)]


def _theme_matches(keywords: List[str], themes: List[str], text: str = "") -> bool:
    if not keywords:
        return True
    haystack = " ".join(themes).lower() + " " + (text or "").lower()
    return any(kw.lower() in haystack for kw in keywords)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def _parse_cutoff(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    normalized = date_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _load_raw_metadata(
    client: Any,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    metadata: Dict[str, Dict[str, Any]] = {}
    offset = 0

    while True:
        query = client.table("raw_reviews").select(
            "id, source, review_date, rating"
        )
        if date_start:
            query = query.gte("review_date", date_start)
        if date_end:
            query = query.lte("review_date", date_end)

        response = (
            query.order("review_date", desc=False)
            .range(offset, offset + FETCH_BATCH_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break
        for row in batch:
            metadata[row["id"]] = row
        if len(batch) < FETCH_BATCH_SIZE:
            break
        offset += FETCH_BATCH_SIZE

    return metadata


def _processed_row_rank(row: Dict[str, Any]) -> tuple:
    """Prefer rows with Phase 2 enrichment when deduplicating by raw_review_id."""
    themes = row.get("themes")
    theme_count = len(themes) if isinstance(themes, list) else 0
    return (
        1 if row.get("sentiment_label") else 0,
        1 if row.get("cluster_id") is not None else 0,
        theme_count,
        len(row.get("cleaned_text") or ""),
    )


def _row_to_review_record(row: Dict[str, Any], raw: Dict[str, Any]) -> ReviewRecord:
    themes = _parse_themes(row.get("themes"))
    behavioral = normalize_behavioral_segment(
        row.get("user_segment") or "",
        row.get("cleaned_text") or "",
        themes,
    )
    return ReviewRecord(
        id=row["id"],
        cleaned_text=row.get("cleaned_text") or "",
        themes=themes,
        sentiment_label=row.get("sentiment_label") or "unknown",
        sentiment_score=row.get("sentiment_score"),
        user_segment=row.get("user_segment") or "Unknown",
        behavioral_segment=behavioral,
        cluster_id=row.get("cluster_id"),
        source=raw.get("source") or "unknown",
        review_date=raw.get("review_date") or "",
        rating=raw.get("rating"),
        pain_points=row.get("pain_points") or [],
    )


def load_filtered_reviews(filters: Optional[QueryFilters] = None) -> List[ReviewRecord]:
    """Load processed reviews enriched with raw metadata, applying filters."""
    filters = resolve_query_filters(filters)
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")

    raw_meta = _load_raw_metadata(client, filters.date_start, filters.date_end)
    best_by_raw: Dict[str, tuple[tuple, ReviewRecord]] = {}
    rows_scanned = 0
    offset = 0

    logger.info(
        "Loading processed reviews for problem-statement analysis "
        "(window %s to %s)…",
        filters.date_start or "—",
        filters.date_end or "—",
    )

    while True:
        response = (
            client.table("processed_reviews")
            .select(
                "id, raw_review_id, cleaned_text, themes, sentiment_label, "
                "sentiment_score, user_segment, cluster_id, pain_points"
            )
            .order("processed_at", desc=False)
            .range(offset, offset + FETCH_BATCH_SIZE - 1)
            .execute()
        )
        batch = response.data or []
        if not batch:
            break

        for row in batch:
            rows_scanned += 1
            raw_id = row.get("raw_review_id")
            if not raw_id:
                continue
            raw = raw_meta.get(raw_id)
            if not raw:
                continue

            themes = _parse_themes(row.get("themes"))
            behavioral = normalize_behavioral_segment(
                row.get("user_segment") or "",
                row.get("cleaned_text") or "",
                themes,
            )

            if filters.source and raw.get("source") != filters.source:
                continue
            if filters.theme and not any(
                filters.theme.lower() in t.lower() for t in themes
            ):
                continue
            if filters.sentiment and row.get("sentiment_label") != filters.sentiment:
                continue
            if filters.behavioral_segment and behavioral != filters.behavioral_segment:
                continue
            if filters.cluster_id is not None and row.get("cluster_id") != filters.cluster_id:
                continue

            rank = _processed_row_rank(row)
            record = _row_to_review_record(row, raw)
            existing = best_by_raw.get(raw_id)
            if existing is None or rank > existing[0]:
                best_by_raw[raw_id] = (rank, record)

        if len(batch) < FETCH_BATCH_SIZE:
            break
        offset += FETCH_BATCH_SIZE

    records = [pair[1] for pair in best_by_raw.values()]
    dupes = rows_scanned - len(records)
    if dupes > 0:
        logger.warning(
            "Deduplicated %d duplicate processed_reviews rows — "
            "keeping one row per raw_review_id (%d unique reviews).",
            dupes,
            len(records),
        )
    logger.info("Loaded %d unique reviews in analysis window.", len(records))
    return records


def load_cluster_insights() -> List[Dict[str, Any]]:
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Could not connect to Supabase.")
    response = client.table("cluster_insights").select("*").execute()
    return response.data or []


# ---------------------------------------------------------------------------
# Query engine
# ---------------------------------------------------------------------------


def _select_relevant_reviews(
    records: List[ReviewRecord],
    question: Dict[str, Any],
) -> List[ReviewRecord]:
    theme_kw = question.get("theme_keywords") or []
    text_kw = question.get("text_keywords") or []

    if question["id"] == "unmet_needs":
        return records

    relevant = []
    for r in records:
        if _theme_matches(theme_kw + text_kw, r.themes, r.cleaned_text):
            relevant.append(r)
    return relevant


def _top_themes(reviews: List[ReviewRecord], limit: int = 5) -> List[Dict[str, Any]]:
    counter: Counter = Counter()
    for r in reviews:
        for t in r.themes:
            counter[t] += 1
    return [
        {"theme": theme, "count": count}
        for theme, count in rank_themes_by_count(counter, limit)
    ]


def _sentiment_breakdown(reviews: List[ReviewRecord]) -> Dict[str, Any]:
    counts = Counter(r.sentiment_label for r in reviews)
    total = len(reviews) or 1
    negative = counts.get("negative", 0)
    return {
        "positive": counts.get("positive", 0),
        "neutral": counts.get("neutral", 0),
        "negative": negative,
        "negative_pct": round(100 * negative / total, 1),
    }


def _segment_breakdown(reviews: List[ReviewRecord]) -> List[Dict[str, Any]]:
    counter: Counter = Counter(r.behavioral_segment for r in reviews)
    total = len(reviews) or 1
    return [
        {
            "segment": seg,
            "count": cnt,
            "pct": round(100 * cnt / total, 1),
        }
        for seg, cnt in counter.most_common()
    ]


def _pick_quotes(
    reviews: List[ReviewRecord],
    question: Dict[str, Any],
    cluster_insights: List[Dict[str, Any]],
    limit: int = 5,
) -> List[str]:
    quotes: List[str] = []

    # Cluster-level quotes first (Phase 2.5)
    relevant_cluster_ids = {r.cluster_id for r in reviews if r.cluster_id is not None}
    for ci in cluster_insights:
        if ci["cluster_id"] in relevant_cluster_ids:
            for q in ci.get("representative_user_quotes") or []:
                if q and q not in quotes:
                    quotes.append(str(q)[:200])

    # Review text samples (negative first)
    sorted_reviews = sorted(
        reviews,
        key=lambda r: (
            0 if r.sentiment_label == "negative" else 1,
            -(r.sentiment_score or 0),
        ),
    )
    text_kw = [k.lower() for k in (question.get("text_keywords") or [])]
    for r in sorted_reviews:
        text = r.cleaned_text.strip()
        if len(text) < 20:
            continue
        if text_kw and not any(kw in text.lower() for kw in text_kw):
            continue
        snippet = text[:200] + ("…" if len(text) > 200 else "")
        if snippet not in quotes:
            quotes.append(snippet)
        if len(quotes) >= limit:
            break

    return quotes[:limit]


def _related_clusters(
    reviews: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    cluster_counts = Counter(r.cluster_id for r in reviews if r.cluster_id is not None)
    insight_map = {ci["cluster_id"]: ci for ci in cluster_insights}
    results = []
    for cid, count in cluster_counts.most_common(5):
        ci = insight_map.get(cid, {})
        results.append(
            {
                "cluster_id": cid,
                "review_count": count,
                "pain_point": ci.get("pain_point"),
                "severity": ci.get("severity"),
                "product_opportunity": ci.get("product_opportunity"),
            }
        )
    return results


def _build_finding_summary(
    question: Dict[str, Any],
    reviews: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> str:
    qid = question["id"]
    n = len(reviews)
    if n == 0:
        return "Insufficient review evidence in the current filter window."

    sentiment = _sentiment_breakdown(reviews)
    top_themes = _top_themes(reviews, 3)
    theme_str = ", ".join(t["theme"] for t in top_themes) if top_themes else "mixed themes"

    if qid == "discovery_struggle":
        return (
            f"Across {n:,} relevant reviews, {sentiment['negative_pct']}% express negative sentiment "
            f"about music discovery. Dominant themes include {theme_str}. Users report difficulty "
            f"finding fresh music beyond familiar playlists and describe recommendations as "
            f"limited or poorly matched to their taste."
        )

    if qid == "recommendation_frustrations":
        clusters = _related_clusters(reviews, cluster_insights)
        top_pain = clusters[0]["pain_point"] if clusters else "repetitive or irrelevant suggestions"
        return (
            f"Recommendation frustrations appear in {n:,} reviews ({sentiment['negative_pct']}% negative). "
            f"Top themes: {theme_str}. The leading cluster pain point: {top_pain}."
        )

    if qid == "listening_behaviors":
        segments = _segment_breakdown(reviews)
        top_seg = segments[0]["segment"] if segments else "Casual Listener"
        return (
            f"Review language reveals users pursuing comfort, mood-based, and contextual listening "
            f"({n:,} relevant reviews). The most vocal behavioral segment is {top_seg}. "
            f"Common themes: {theme_str}."
        )

    if qid == "repetitive_listening":
        return (
            f"Repetitive listening is linked to {n:,} reviews ({sentiment['negative_pct']}% negative), "
            f"with themes such as {theme_str}. Users cite hearing the same songs/artists, "
            f"playlist fatigue, and algorithms that fail to introduce novelty."
        )

    if qid == "segment_discovery_challenges":
        seg_scores: Dict[str, float] = defaultdict(float)
        for r in reviews:
            weight = 1.0
            if r.sentiment_label == "negative":
                weight += 1.5
            if any("discover" in t.lower() or "repetitive" in t.lower() for t in r.themes):
                weight += 1.0
            seg_scores[r.behavioral_segment] += weight
        ranked = sorted(seg_scores.items(), key=lambda x: -x[1])
        if ranked:
            top, score = ranked[0]
            second = ranked[1][0] if len(ranked) > 1 else "other segments"
            return (
                f"{top} shows the highest discovery friction score ({score:.0f} weighted signals), "
                f"followed by {second}. Negative sentiment on discovery themes concentrates in "
                f"behavioral segments rather than demographic profiles."
            )
        return "Segment friction could not be computed from available data."

    if qid == "unmet_needs":
        opportunities = [
            ci.get("product_opportunity")
            for ci in cluster_insights
            if ci.get("product_opportunity")
        ]
        feature_requests = [
            ci.get("feature_request")
            for ci in cluster_insights
            if ci.get("feature_request")
        ]
        opp_sample = opportunities[0] if opportunities else "better personalized discovery"
        return (
            f"Consistent unmet needs surface across {len(cluster_insights)} semantic clusters "
            f"and {n:,} reviews. Recurring feature requests and opportunities include: "
            f"{'; '.join(filter(None, feature_requests[:2])) or opp_sample}."
        )

    return f"Analysis of {n:,} reviews shows patterns around {theme_str}."


def answer_question(
    question: Dict[str, Any],
    records: List[ReviewRecord],
    cluster_insights: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Produce a structured answer for one core question."""
    relevant = _select_relevant_reviews(records, question)
    sentiment = _sentiment_breakdown(relevant)
    segments = _segment_breakdown(relevant)

    return {
        "question_id": question["id"],
        "question": question["question"],
        "finding_summary": _build_finding_summary(question, relevant, cluster_insights),
        "supporting_metrics": {
            "review_count": len(relevant),
            "sentiment_breakdown": sentiment,
            "top_themes": _top_themes(relevant),
            "segment_breakdown": segments,
            "avg_rating": round(
                sum(r.rating for r in relevant if r.rating) / max(
                    1, sum(1 for r in relevant if r.rating)
                ),
                2,
            )
            if any(r.rating for r in relevant)
            else None,
        },
        "representative_quotes": _pick_quotes(relevant, question, cluster_insights),
        "affected_segments": [s["segment"] for s in segments[:3]],
        "related_clusters": _related_clusters(relevant, cluster_insights),
    }


def run_all_queries(filters: Optional[QueryFilters] = None) -> Dict[str, Any]:
    """Answer all six core problem-statement questions."""
    filters = resolve_query_filters(filters)
    records = load_filtered_reviews(filters)
    cluster_insights = load_cluster_insights()

    answers = [
        answer_question(q, records, cluster_insights)
        for q in CORE_QUESTIONS
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {
            k: v
            for k, v in filters.__dict__.items()
            if v is not None
        },
        "total_reviews_analyzed": len(records),
        "answers": answers,
    }


def save_results(results: Dict[str, Any], output_path: str = DEFAULT_OUTPUT_FILE) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    logger.info("Saved problem-statement insights to %s", output_path)
    return output_path


def save_to_weekly_insights(results: Dict[str, Any]) -> bool:
    """Merge problem-statement insights into the current week's weekly_insights row."""
    from src.phase5_orchestration.weekly_insights_store import merge_top_themes_for_week

    client = get_supabase_client()
    if not client:
        return False

    try:
        merge_top_themes_for_week(
            client,
            "problem_statement_insights",
            results,
            _build_markdown_report(results),
        )
        logger.info("Saved problem-statement snapshot to weekly_insights.")
        return True
    except Exception as exc:
        logger.error("Could not save to weekly_insights: %s", exc)
        return False


def _build_markdown_report(results: Dict[str, Any]) -> str:
    lines = [
        "# Problem Statement Insights (Phase 3.1)",
        "",
        f"Generated: {results.get('generated_at', '')}",
        f"Reviews analyzed: {results.get('total_reviews_analyzed', 0):,}",
        "",
    ]
    for ans in results.get("answers", []):
        lines.append(f"## {ans['question']}")
        lines.append("")
        lines.append(ans["finding_summary"])
        lines.append("")
        metrics = ans.get("supporting_metrics", {})
        lines.append(f"- Relevant reviews: **{metrics.get('review_count', 0):,}**")
        sb = metrics.get("sentiment_breakdown", {})
        lines.append(f"- Negative sentiment: **{sb.get('negative_pct', 0)}%**")
        if ans.get("representative_quotes"):
            lines.append("- Representative quotes:")
            for q in ans["representative_quotes"][:3]:
                lines.append(f"  - \"{q}\"")
        lines.append("")
    return "\n".join(lines)


def run_problem_statement_engine(
    filters: Optional[QueryFilters] = None,
    output_path: str = DEFAULT_OUTPUT_FILE,
    save_supabase: bool = True,
) -> Dict[str, Any]:
    """Phase 3.1 entry point: run all queries, save JSON (+ optional Supabase)."""
    results = run_all_queries(filters)
    save_results(results, output_path)
    if save_supabase:
        save_to_weekly_insights(results)
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.1 — Problem Statement Query Engine")
    parser.add_argument("--source", type=str, default=None)
    parser.add_argument("--theme", type=str, default=None)
    parser.add_argument("--sentiment", type=str, default=None)
    parser.add_argument("--segment", type=str, default=None, help="Behavioral segment filter")
    parser.add_argument("--cluster", type=int, default=None)
    parser.add_argument("--date-start", type=str, default=None)
    parser.add_argument("--date-end", type=str, default=None)
    parser.add_argument("--no-supabase", action="store_true")
    args = parser.parse_args()

    filt = QueryFilters(
        date_start=args.date_start,
        date_end=args.date_end,
        source=args.source,
        theme=args.theme,
        sentiment=args.sentiment,
        behavioral_segment=args.segment,
        cluster_id=args.cluster,
    )

    result = run_problem_statement_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.1 Summary ---")
    print(f"  Reviews analyzed : {result['total_reviews_analyzed']:,}")
    print(f"  Questions answered: {len(result['answers'])}")
    for ans in result["answers"]:
        m = ans["supporting_metrics"]
        print(f"\n  [{ans['question_id']}]")
        print(f"    {ans['question']}")
        print(f"    Reviews: {m['review_count']:,} | Negative: {m['sentiment_breakdown']['negative_pct']}%")
        print(f"    Summary: {ans['finding_summary'][:120]}…")
