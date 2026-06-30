#!/usr/bin/env python3
"""
Generate two professional DOCX reports from existing analyzer JSON outputs.
Does not modify analyzer logic or dashboard code.

Usage:
  pip install python-docx
  python scripts/generate_docx_reports.py

Outputs:
  DOCS/reports/Project_Documentation_Report.docx
  DOCS/reports/Analyzer_Insights_Report.docx
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "DOCS" / "reports"
DATA = ROOT / "data" / "outputs"

SEGMENT_DEFINITIONS = {
    "Discovery Seeker": "Users actively trying to find new music through discovery features.",
    "Habit Listener": "Comfort-listening users who repeat familiar tracks and routines.",
    "Heavy Listener": "High-volume listeners commenting on breadth of features and playback.",
    "Playlist Driven": "Users who mainly consume music through playlists rather than search.",
    "Niche Listener": "Users focused on specific genres; sensitive to recommendation relevance.",
    "Casual Listener": "Light listeners focused on basic app experience.",
    "New User": "Recently onboarded users evaluating first impressions and onboarding.",
    "Premium User": "Paying subscribers with higher expectations for premium features.",
    "Niche Music Listener": "Users with narrow taste profiles (Phase 2 business label).",
}

THEME_DEFINITIONS = {
    "Recommendation Quality": "How well suggested songs and mixes match user taste.",
    "Playlist Fatigue": "Playlists feeling stale, repetitive, or polluted.",
    "Search & Discovery UX": "Difficulty finding music via search or home surfaces.",
    "Repetitive Recommendations": "Same artists or songs resurfacing too often.",
    "Discover Weekly Issues": "Problems with weekly personalized discovery playlists.",
    "Algorithm Bias": "Perceived favoritism toward mainstream music.",
    "Niche Music Gap": "Gaps in catalog for niche or regional genres.",
    "General App Feedback": "Billing, performance, UI, or non-discovery issues.",
}

BUSINESS_SEGMENTS = [
    ("New User", "Recently joined users; onboarding and first recommendation quality."),
    ("Casual Listener", "Default Phase 2 label for general listening patterns."),
    ("Premium User", "Evidence-based label when reviews mention premium subscription."),
    ("Heavy Listener", "High activity listeners in Phase 2 taxonomy."),
    ("Niche Music Listener", "Users focused on narrow genres or artists."),
]

ENGAGEMENT_LENSES = [
    ("Heavy / New User tier", "High activity or newly onboarded cohorts."),
    ("Premium tier", "Subscribers with premium feature expectations."),
    ("Niche tier", "Specialized taste and catalog sensitivity."),
    ("Casual tier", "Lower-intensity listening patterns."),
]

PAIN_LENSES = [
    ("Cluster severity", "Average severity 1–5 from cluster-level LLM insights."),
    ("Sentiment polarity", "Share of negative reviews in a slice."),
    ("Friction tier", "Critical / High / Monitor from prioritization engine."),
    ("Pain-point frequency", "How often a cluster pain point appears in reviews."),
]


def load_json(name: str) -> dict:
    path = DATA / name
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def pct(part: float, total: float) -> float:
    return round(100 * part / total, 1) if total else 0.0


def add_title(doc, text: str) -> None:
    doc.add_heading(text, level=0)


def add_h(doc, text: str, level: int = 1) -> None:
    doc.add_heading(text, level=level)


def add_p(doc, text: str) -> None:
    doc.add_paragraph(text)


def add_bullets(doc, items: list[str]) -> None:
    for item in items:
        doc.add_paragraph(item, style="List Bullet")


def add_table(doc, headers: list[str], rows: list[list[str]]) -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = h
    for ri, row in enumerate(rows):
        cells = table.rows[ri + 1].cells
        for ci, val in enumerate(row):
            cells[ci].text = str(val)
    doc.add_paragraph("")


def build_documentation_report(doc) -> None:
    add_title(doc, "AI-Powered Review Discovery Engine")
    add_p(doc, "Project Documentation Report")
    add_p(doc, f"Analysis window: Last 90 days · Generated {datetime.now().strftime('%B %d, %Y')}")
    doc.add_paragraph("")

    add_h(doc, "1. Project Overview")
    add_h(doc, "Problem statement", 2)
    add_p(
        doc,
        "Spotify users often repeat familiar playlists instead of discovering new music. "
        "Product teams need a scalable way to understand discovery pain, recommendation frustration, "
        "and segment-specific needs from large-scale public review data."
    )
    add_h(doc, "Business objective", 2)
    add_p(
        doc,
        "Build a Product Decision Intelligence platform that ingests app store reviews, "
        "analyzes them with a hybrid AI pipeline, and delivers ranked insights for the Growth Team."
    )
    add_h(doc, "Why this matters for Spotify", 2)
    add_bullets(
        doc,
        [
            "Discovery quality directly affects retention and premium value.",
            "Manual review reading does not scale across tens of thousands of reviews.",
            "Segment-level friction reveals where recommendation systems underperform.",
            "Evidence-backed rankings support prioritization without demographic guessing.",
        ],
    )

    add_h(doc, "2. Project Architecture")
    add_h(doc, "Data sources", 2)
    add_bullets(
        doc,
        [
            "Google Play Store reviews (primary)",
            "Apple App Store reviews (primary)",
            "Optional Reddit (documented, not required for core pipeline)",
        ],
    )
    add_h(doc, "Database flow", 2)
    add_p(
        doc,
        "Supabase (PostgreSQL) is the permanent store: raw_reviews → processed_reviews → "
        "cluster_insights → weekly_insights → historical_trends. "
        "ChromaDB holds Phase 2 embeddings for clustering only; the dashboard reads Supabase."
    )
    add_h(doc, "AI analyzer flow", 2)
    add_p(
        doc,
        "Weekly Python pipeline: ingest (90-day window) → clean/sanitize/dedupe → embed & cluster → "
        "themes/sentiment/segments → cluster-level LLM insights → Phase 3 insight engines → weekly snapshot."
    )
    add_h(doc, "Dashboard flow", 2)
    add_p(
        doc,
        "Next.js on Vercel loads Phase 3 JSON from weekly_insights.top_themes. "
        "When Supabase is available, a live 90-day window overlay recomputes counts and rankings "
        "from processed_reviews without re-running the analyzer."
    )

    add_h(doc, "3. Phase-wise Breakdown")
    phases = [
        (
            "Phase 1: Data Collection",
            "Collect and store raw reviews from app stores within a rolling 90-day window.",
            "App Store / Play Store APIs and scrapers.",
            "Normalize dates, remove PII, deduplicate, filter short/empty text.",
            "raw_reviews and processed_reviews tables in Supabase.",
        ),
        (
            "Phase 2: Data Processing & Hybrid Analysis",
            "Structure reviews for scalable analysis without per-review LLM cost.",
            "Cleaned review text, ratings, dates, sources.",
            "Embeddings (ChromaDB), clustering, theme classification, VADER/TextBlob sentiment, "
            "rule-based user_segment detection, Groq cluster-level insights.",
            "processed_reviews with themes, sentiment, cluster_id, pain_points; cluster_insights rows.",
        ),
        (
            "Phase 3: AI Analysis Engine (Insight Intelligence)",
            "Answer product questions and produce ranked outputs.",
            "Phase 2 structured fields and cluster summaries.",
            "Problem statement engine, segment deep-dives, opportunity scoring, insight prioritization.",
            "JSON in data/outputs/ and weekly_insights.top_themes.",
        ),
        (
            "Phase 4: Dashboard & Reporting",
            "Present insights to stakeholders and export reports.",
            "Phase 3 snapshots + live 90-day corpus overlay.",
            "Next.js server loaders, Recharts visualizations, PDF/DOCX export.",
            "Overview, Insights, Analytics, Segments, Opportunities, Action plan, downloadable reports.",
        ),
    ]
    for title, purpose, inp, process, output in phases:
        add_h(doc, title, 2)
        add_p(doc, f"Purpose: {purpose}")
        add_p(doc, f"Input: {inp}")
        add_p(doc, f"Process: {process}")
        add_p(doc, f"Output: {output}")

    add_h(doc, "4. Segmentation Framework")
    add_h(doc, "Business segmentation (Phase 2 user_segment)", 2)
    for name, desc in BUSINESS_SEGMENTS:
        add_p(doc, f"{name}: {desc}")
    add_h(doc, "Usage / engagement segmentation", 2)
    add_p(doc, "Dashboard engagement lens groups activity tiers for comparison:")
    for name, desc in ENGAGEMENT_LENSES:
        add_p(doc, f"{name}: {desc}")
    add_h(doc, "Behavioral segmentation (primary decision lens)", 2)
    add_p(
        doc,
        "Six behavioral segments used for ranking and opportunities (mapped from Phase 2 labels + text):"
    )
    for seg in [
        "Discovery Seeker",
        "Habit Listener",
        "Heavy Listener",
        "Playlist Driven",
        "Niche Listener",
        "Casual Listener",
    ]:
        add_p(doc, f"{seg}: {SEGMENT_DEFINITIONS[seg]}")
    add_h(doc, "Pain segmentation", 2)
    for name, desc in PAIN_LENSES:
        add_p(doc, f"{name}: {desc}")

    add_h(doc, "5. Theme Classification")
    add_p(
        doc,
        "Themes are assigned at cluster level using keyword mapping and lightweight classifiers, "
        "then propagated to all reviews in each cluster. Common themes include:"
    )
    for theme, desc in THEME_DEFINITIONS.items():
        add_p(doc, f"{theme}: {desc}")

    add_h(doc, "6. Scoring System")
    scores = [
        ("Sentiment Score", "Average tone per review cohort (1–5 scale; higher = more positive)."),
        ("Pain Score", "Average cluster severity (1–5) for issues cited in a segment or cluster."),
        (
            "Complaint Frequency",
            "Share of reviews in a cohort citing the top pain-point cluster.",
        ),
        (
            "Business Impact Score",
            "Friction score weighted by review volume share (friction × volume %).",
        ),
        (
            "Opportunity Score",
            "Frequency × Severity × Segment Impact × Sentiment Intensity (composite 0–1 scale).",
        ),
        (
            "Ranking Score (segments)",
            "Friction score: 35% negative % + 30% pain density + 35% discovery-theme %, "
            "adjusted by average cluster severity.",
        ),
    ]
    add_table(doc, ["Metric", "Definition"], [[a, b] for a, b in scores])

    add_h(doc, "7. Ranking & Prioritization Logic")
    add_bullets(
        doc,
        [
            "Segments: sorted by friction_score (descending).",
            "Pain points: sorted by impact_score = frequency × (severity ÷ 5).",
            "Opportunities: sorted by composite opportunity score.",
            "Action matrix: merges top pains, opportunities, friction segments; sorted by priority_score.",
            "Tiers: Critical / High / Monitor based on score thresholds and rank position.",
        ],
    )

    add_h(doc, "8. Decision Framework")
    add_p(
        doc,
        "The system selects priority targets using evidence-backed rules—not demographics:"
    )
    add_bullets(
        doc,
        [
            "Primary friction segment: highest behavioral friction_score in the 90-day window.",
            "Largest volume signal: segment with most reviews or highest fatigue score (often Playlist Driven).",
            "Top pain point: highest impact_score across clusters.",
            "Top opportunity: highest composite score with Critical tier.",
            "Final target: intersection of high friction, high volume, and Critical-tier pain/opportunity.",
        ],
    )
    add_p(
        doc,
        "Product teams weigh rank #1 friction (quality signal) against rank #1 volume (scale signal) "
        "when choosing where discovery investment delivers the most user impact."
    )


def segment_metrics(prior: dict, profiles: dict) -> list[dict]:
    total = prior.get("total_reviews_analyzed") or 1
    profile_map = {p["segment"]: p for p in profiles.get("segment_profiles", [])}
    rows = []
    for i, fs in enumerate(prior.get("segment_friction_scores", [])):
        name = fs["segment"]
        rc = fs["review_count"]
        prof = profile_map.get(name, {})
        sb = prof.get("sentiment_breakdown", {})
        top_pain = (prof.get("top_pain_points") or [{}])[0]
        tp_count = top_pain.get("count") or 0
        vol_pct = pct(rc, total)
        friction = fs["friction_score"]
        rows.append(
            {
                "rank": i + 1,
                "name": name,
                "definition": SEGMENT_DEFINITIONS.get(name, name),
                "review_count": rc,
                "volume_pct": vol_pct,
                "sentiment_score": round(sb.get("avg_sentiment_score") or (5 - fs["negative_pct"] / 100 * 2), 2),
                "pain_score": round(fs.get("avg_cluster_severity") or prof.get("avg_cluster_severity") or 0, 1),
                "negative_pct": fs["negative_pct"],
                "complaint_freq": pct(tp_count, rc or 1),
                "business_impact": round(friction * vol_pct, 2),
                "ranking_score": friction,
            }
        )
    return rows


def rank_proof(cur: dict, prev: dict | None, total: int) -> str:
    if cur["rank"] == 1:
        return (
            f"Ranks #1 with friction score {cur['ranking_score']:.3f} — highest in the 90-day window. "
            f"{cur['volume_pct']}% of {total:,} reviews, {cur['negative_pct']}% negative, "
            f"pain score {cur['pain_score']}/5."
        )
    if prev:
        gap = round(prev["ranking_score"] - cur["ranking_score"], 4)
        return (
            f"Ranks #{cur['rank']} (score {cur['ranking_score']:.3f}) below #{cur['rank'] - 1} "
            f"{prev['name']} (score {prev['ranking_score']:.3f}, gap {gap:.3f}). "
            f"{cur['volume_pct']}% volume share, {cur['negative_pct']}% negative."
        )
    return f"Ranked #{cur['rank']} by friction score in {total:,} reviews."


def build_insights_report(doc, prior: dict, profiles: dict, opps: dict, problem: dict) -> None:
    total = prior.get("total_reviews_analyzed", 0)
    gen = prior.get("generated_at", "")[:10]
    add_title(doc, "Spotify Review Intelligence — Analyzer Insights Report")
    add_p(doc, f"90-day analysis window · {total:,} reviews · Snapshot date {gen}")
    doc.add_paragraph("")

    add_h(doc, "1. Executive Summary")
    top = prior.get("top_priority", {})
    seg_rows = segment_metrics(prior, profiles)
    top_seg = seg_rows[0] if seg_rows else None
    rec_answer = next(
        (a for a in problem.get("answers", []) if a["question_id"] == "recommendation_frustrations"),
        {},
    )
    add_p(
        doc,
        f"This report summarizes analyzer findings from {total:,} public reviews in the last 90 days. "
        f"The highest-friction behavioral segment is {top_seg['name'] if top_seg else '—'} "
        f"(friction {top_seg['ranking_score']:.3f}). "
        f"The top prioritized pain point is: {top.get('title', '—')[:200]}."
    )
    if rec_answer.get("finding_summary"):
        add_p(doc, rec_answer["finding_summary"])

    add_h(doc, "2. Top User Segments Ranked")
    headers = [
        "Rank",
        "Segment",
        "Vol %",
        "Sentiment",
        "Pain",
        "Complaint %",
        "Biz Impact",
        "Rank Score",
    ]
    table_rows = [
        [
            r["rank"],
            r["name"],
            f"{r['volume_pct']}%",
            f"{r['sentiment_score']}/5",
            f"{r['pain_score']}/5",
            f"{r['complaint_freq']}%",
            r["business_impact"],
            f"{r['ranking_score']:.3f}",
        ]
        for r in seg_rows
    ]
    add_table(doc, headers, table_rows)
    for i, r in enumerate(seg_rows):
        prev = seg_rows[i - 1] if i > 0 else None
        add_p(doc, f"{r['name']}: {rank_proof(r, prev, total)}")
        add_p(doc, f"Definition: {r['definition']}")

    add_h(doc, "3. Segment Breakdown")
    for prof in profiles.get("segment_profiles", [])[:6]:
        name = prof["segment"]
        rc = prof["review_count"]
        sb = prof.get("sentiment_breakdown", {})
        add_h(doc, name, 2)
        add_p(doc, SEGMENT_DEFINITIONS.get(name, ""))
        add_p(
            doc,
            f"Reviews: {rc:,} ({pct(rc, total)}% of corpus) · "
            f"Negative: {sb.get('negative_pct', 0)}% · "
            f"Avg sentiment: {sb.get('avg_sentiment_score', '—')}/5 · "
            f"Avg pain severity: {prof.get('avg_cluster_severity', '—')}/5"
        )
        themes = prof.get("top_themes", [])[:3]
        if themes:
            add_p(doc, "Top themes: " + ", ".join(f"{t['theme']} ({t['count']:,})" for t in themes))
        pains = prof.get("top_pain_points", [])[:2]
        for p in pains:
            add_p(doc, f"Pain: {p['pain_point'][:180]} ({p['count']:,} reviews, {p.get('pct', 0)}%)")

    add_h(doc, "4. Top Pain Points Ranked")
    pains = prior.get("top_pain_points", [])[:8]
    add_table(
        doc,
        ["Rank", "Pain point (short)", "Reviews", "Vol %", "Severity", "Impact score"],
        [
            [
                i + 1,
                p["pain_point"][:70] + ("…" if len(p["pain_point"]) > 70 else ""),
                f"{p['frequency']:,}",
                f"{pct(p['frequency'], total)}%",
                f"{p['avg_severity']}/5",
                round(p["impact_score"], 1),
            ]
            for i, p in enumerate(pains)
        ],
    )
    for i, p in enumerate(pains):
        prev = pains[i - 1] if i > 0 else None
        if i == 0:
            proof = f"Rank #1: {p['frequency']:,} reviews, highest frequency × severity in corpus."
        elif prev:
            proof = (
                f"Rank #{i + 1}: {p['frequency']:,} reviews vs #{i} at {prev['frequency']:,}; "
                f"impact score {p['impact_score']:.1f} vs {prev['impact_score']:.1f}."
            )
        else:
            proof = f"Ranked by impact score (frequency × severity)."
        add_p(doc, proof)
        add_p(doc, p["pain_point"])

    add_h(doc, "5. Theme Analysis")
    themes = next(
        (
            a.get("supporting_metrics", {}).get("top_themes", [])
            for a in problem.get("answers", [])
            if a.get("question_id") == "recommendation_frustrations"
        ),
        [],
    ) or next(
        (a.get("supporting_metrics", {}).get("top_themes", []) for a in problem.get("answers", [])),
        [],
    )
    add_table(
        doc,
        ["Rank", "Theme", "Mentions", "Vol %"],
        [
            [i + 1, t["theme"], f"{t['count']:,}", f"{pct(t['count'], total)}%"]
            for i, t in enumerate(themes[:8])
        ],
    )
    for i, t in enumerate(themes[:5]):
        add_p(doc, f"{t['theme']}: {THEME_DEFINITIONS.get(t['theme'], t['theme'])}")

    add_h(doc, "6. Discovery Behavior Analysis")
    comp = profiles.get("segment_comparison", {})
    fatigue = comp.get("recommendation_fatigue_ranking", [])
    add_table(
        doc,
        ["Rank", "Segment", "Fatigue score", "Reviews"],
        [
            [i + 1, f["segment"], round(f["score"], 0), f"{f['review_count']:,}"]
            for i, f in enumerate(fatigue)
        ],
    )
    add_p(
        doc,
        "Recommendation fatigue measures weighted complaint signals about repetitive recommendations. "
        "Playlist Driven leads by absolute signal volume; Habit Listener leads by friction rate."
    )

    add_h(doc, "7. Cross Segment Analysis")
    for i, opp in enumerate(opps.get("opportunities", [])[:4]):
        ev = opp.get("evidence", {})
        seg = (ev.get("segment_breakdown") or [{}])[0]
        themes = ev.get("theme_breakdown") or []
        theme_str = ", ".join(t["theme"] for t in themes[:2]) or "General"
        add_p(
            doc,
            f"Pattern {i + 1}: {seg.get('segment', '—')} + {theme_str} — "
            f"{opp.get('review_count', 0):,} reviews ({pct(opp.get('review_count', 0), total)}% of corpus), "
            f"composite score {opp.get('scores', {}).get('composite', 0):.4f}."
        )

    add_h(doc, "8. Opportunities Ranked")
    add_table(
        doc,
        ["Rank", "Tier", "Impact", "Reviews", "Opportunity"],
        [
            [
                o.get("rank", i + 1),
                o.get("tier", ""),
                round(o.get("scores", {}).get("composite", 0) * 100, 2),
                f"{o.get('review_count', 0):,}",
                (o.get("pain_point") or "")[:60] + "…",
            ]
            for i, o in enumerate(opps.get("opportunities", [])[:8])
        ],
    )

    add_h(doc, "9. Final Recommendations")
    add_p(doc, "Based on Critical-tier prioritization and opportunity scores:")
    for rec in prior.get("product_recommendations", [])[:6]:
        add_p(doc, f"[{rec.get('tier', 'Monitor')}] {rec.get('recommendation', '')}")
        add_p(
            doc,
            f"Proof: {rec.get('review_count', 0):,} reviews · "
            f"opportunity score {rec.get('opportunity_score', 0):.4f} · "
            f"pain: {(rec.get('pain_point') or '')[:120]}"
        )
    add_p(doc, f"Top priority action: {top.get('recommendation', top.get('title', '—'))}")


def main() -> None:
    try:
        from docx import Document
    except ImportError as exc:
        raise SystemExit("Install python-docx: pip install python-docx") from exc

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    prior = load_json("insight_prioritization.json")
    profiles = load_json("segment_deep_dives.json")
    opps = load_json("opportunity_scores.json")
    problem = load_json("problem_statement_insights.json")

    doc1 = Document()
    build_documentation_report(doc1)
    path1 = OUTPUT_DIR / "Project_Documentation_Report.docx"
    doc1.save(path1)

    doc2 = Document()
    build_insights_report(doc2, prior, profiles, opps, problem)
    path2 = OUTPUT_DIR / "Analyzer_Insights_Report.docx"
    doc2.save(path2)

    print(f"Wrote {path1}")
    print(f"Wrote {path2}")


if __name__ == "__main__":
    main()
