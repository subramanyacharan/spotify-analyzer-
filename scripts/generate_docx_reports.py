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


def complete_sentence(text: str) -> str:
    """Ensure insight text is a full sentence without trailing ellipsis."""
    if not text or not str(text).strip():
        return ""
    t = str(text).strip()
    while t.endswith("…") or t.endswith("..."):
        t = t.rstrip(".… ").strip()
    if t and t[-1] not in ".!?":
        t += "."
    return t


def build_documentation_report(doc) -> None:
    add_title(doc, "AI-Powered Review Discovery Engine")
    add_p(doc, "Project Documentation — Team Reference")
    add_p(
        doc,
        "This document explains the full system so product, engineering, and research teams "
        "can understand how the platform works end to end. It describes architecture, data flow, "
        "analysis methodology, and how to operate the pipeline and dashboard."
    )
    add_p(doc, f"Document version: {datetime.now().strftime('%B %d, %Y')}")
    doc.add_paragraph("")

    add_h(doc, "1. Project Overview")
    add_h(doc, "1.1 Problem statement", 2)
    add_p(
        doc,
        "Spotify has a large user base and a sophisticated recommendation system, yet much listening "
        "still comes from repeat playlists and familiar artists rather than meaningful new discovery. "
        "User feedback is scattered across App Store reviews, Play Store reviews, and community channels. "
        "It is unstructured, high-volume, and impossible to read manually at scale."
    )
    add_p(
        doc,
        "The Growth Team needs a centralized intelligence system that continuously answers: "
        "Why do users struggle to discover music? What frustrates them about recommendations? "
        "Which behavioral segments face the biggest challenges? What product opportunities emerge from reviews?"
    )
    add_h(doc, "1.2 Business objective", 2)
    add_p(
        doc,
        "Build a Product Decision Intelligence platform that automatically ingests public reviews, "
        "processes them through a hybrid AI pipeline, stores structured results permanently, "
        "and presents ranked, evidence-backed insights through a secure web dashboard and exportable reports."
    )
    add_h(doc, "1.3 Why this matters for Spotify", 2)
    add_bullets(
        doc,
        [
            "Discovery quality affects retention, session depth, and premium value perception.",
            "Recommendation failures show up in reviews before they appear in aggregate metrics.",
            "Segment-level friction reveals which user cohorts the algorithm underserves.",
            "A repeatable weekly pipeline gives the Growth Team continuous intelligence without manual analysis.",
            "Evidence-backed rankings reduce debate about what users actually said in public feedback.",
        ],
    )
    add_h(doc, "1.4 Core questions the system answers", 2)
    add_bullets(
        doc,
        [
            "Why do users struggle to discover new music?",
            "What frustrates users about recommendations?",
            "What listening behaviors are users trying to achieve?",
            "What causes repetitive listening?",
            "Which behavioral segments face the biggest discovery challenges?",
            "What unmet needs appear consistently in reviews?",
        ],
    )
    add_h(doc, "1.5 Design principles", 2)
    add_bullets(
        doc,
        [
            "Evidence-backed only — insights must link to review counts, themes, clusters, or quotes.",
            "Behavioral segmentation — no inferred demographics (age, student/professional, etc.).",
            "Hybrid analysis — lightweight models at scale plus cluster-level LLM calls, not per-review LLM.",
            "Supabase-first — permanent structured storage; dashboard reads Supabase, not ChromaDB directly.",
            "Modular phases — ingestion, analysis, insight engines, dashboard, and automation are independently runnable.",
        ],
    )

    add_h(doc, "2. System Architecture")
    add_h(doc, "2.1 High-level components", 2)
    add_table(
        doc,
        ["Component", "Technology", "Role"],
        [
            ["Data pipeline", "Python 3.11+", "Ingest, clean, analyze, generate insights"],
            ["Primary database", "Supabase (PostgreSQL)", "Permanent store for all review and insight data"],
            ["Vector store", "ChromaDB", "Phase 2 embeddings for clustering (pipeline only)"],
            ["LLM", "Groq (llama-3.3-70b-versatile)", "Cluster-level pain points and opportunities"],
            ["Dashboard", "Next.js on Vercel", "Authenticated UI for stakeholders"],
            ["Automation", "GitHub Actions", "Weekly scheduled pipeline runs"],
        ],
    )
    add_h(doc, "2.2 Data sources", 2)
    add_bullets(
        doc,
        [
            "Google Play Store reviews — primary source with rating, date, and text.",
            "Apple App Store reviews — primary source with rating, date, and text.",
            "Reddit (optional) — documented for future extension; not required for core operation.",
        ],
    )
    add_h(doc, "2.3 Database schema (Supabase)", 2)
    add_table(
        doc,
        ["Table", "Purpose"],
        [
            ["raw_reviews", "Permanent raw review storage (source, text, rating, date)"],
            ["processed_reviews", "Cleaned text, themes, sentiment, user_segment, cluster_id, pain_points"],
            ["cluster_insights", "Cluster-level pain points, severity, opportunities, quotes"],
            ["weekly_insights", "Weekly snapshots and Phase 3 JSON bundles (top_themes)"],
            ["historical_trends", "Theme and sentiment aggregates over time"],
            ["profiles", "Dashboard user accounts (auth)"],
        ],
    )
    add_h(doc, "2.4 Data flow", 2)
    add_p(
        doc,
        "Reviews flow: App Store / Play Store → Phase 1 ingestion → raw_reviews → "
        "cleaning/PII/dedupe → processed_reviews → Phase 2 embeddings & clustering → "
        "themes, sentiment, segments, cluster_insights → Phase 3 insight engines → "
        "weekly_insights.top_themes → Next.js dashboard and export APIs."
    )
    add_h(doc, "2.5 AI analyzer flow", 2)
    add_p(
        doc,
        "The analyzer uses a rolling analysis window (90 days) for ingestion and scoring. "
        "Each weekly run can operate in full mode (re-ingest 90 days) or incremental mode (last 7 days). "
        "Phase 2 assigns each review a cluster_id, theme labels, sentiment, and user_segment. "
        "Phase 2.5 runs one LLM call per cluster (not per review) to extract pain points and severity. "
        "Phase 3 aggregates Phase 2 outputs into ranked segments, opportunities, and an action matrix."
    )
    add_h(doc, "2.6 Dashboard flow", 2)
    add_p(
        doc,
        "The Next.js app on Vercel uses Supabase Auth for login. Server-side loaders read Phase 3 JSON "
        "from weekly_insights via the service role key. A live window overlay can recompute counts and "
        "rankings from processed_reviews for the same 90-day period without re-running Python. "
        "Users access Overview, Insights, Analytics, Segments, Opportunities, and PDF/DOCX export."
    )

    add_h(doc, "3. Phase-wise Breakdown")
    phases = [
        (
            "Phase 1: Data Collection & Preparation",
            "Collect, clean, and store review data as the foundation for all downstream analysis.",
            "App Store and Play Store APIs; raw review text, ratings, timestamps, source identifiers.",
            "Fetch reviews within the analysis window. Normalize dates to ISO 8601. Remove HTML artifacts. "
            "Strip PII (emails, phones, URLs). Deduplicate exact and near-duplicate text. "
            "Filter empty or very short reviews.",
            "raw_reviews and processed_reviews rows in Supabase; local exports in data/processed/.",
        ),
        (
            "Phase 2: Hybrid AI Analysis",
            "Label every review with themes, sentiment, segment, and cluster at scale without per-review LLM cost.",
            "Cleaned review text from processed_reviews.",
            "Generate embeddings (sentence-transformers) and store in ChromaDB. Cluster with K-Means/DBSCAN. "
            "Assign themes via keyword mapping and lightweight classifiers. Score sentiment with VADER/TextBlob. "
            "Detect user_segment with rule-based classifiers. Run Groq LLM once per cluster for pain points.",
            "processed_reviews with cluster_id, themes, sentiment_label, user_segment, pain_points; "
            "cluster_insights table with severity and opportunities.",
        ),
        (
            "Phase 3: Insight Intelligence Layer",
            "Transform structured Phase 2 data into product-ready answers and ranked lists.",
            "Phase 2 fields, cluster_insights, and aggregated metrics.",
            "Run four engines: (3.1) Problem Statement Query — six core questions; "
            "(3.2) Segment Deep-Dive — profiles per behavioral segment; "
            "(3.3) Opportunity Scoring — composite rank per cluster; "
            "(3.4) Insight Prioritization — unified Critical/High/Monitor action matrix.",
            "JSON files in data/outputs/ and merged keys in weekly_insights.top_themes.",
        ),
        (
            "Phase 4: Dashboard & Reporting",
            "Deliver insights to stakeholders through a secure web UI and downloadable reports.",
            "Phase 3 JSON snapshots; optional live Supabase aggregates for the analysis window.",
            "Next.js server components load data per route. Recharts visualizes trends and distributions. "
            "Confidence badges computed at render time. Export Report generates PDF; DOCX reports generated "
            "offline from pipeline JSON via scripts/generate_docx_reports.py.",
            "Routes: /overview, /insights, /insights/analytics, /segments, /deep-dive, "
            "/opportunities, /opportunities/actions; GET /api/export/report for PDF.",
        ),
        (
            "Phase 5: Weekly Automation",
            "Run the full pipeline on a schedule without manual intervention.",
            "Environment secrets (Supabase, Groq); cached ChromaDB from prior runs.",
            "GitHub Actions runs every Sunday 05:00 UTC. Orchestrator executes Phases 1–5 in order "
            "with checkpoint/resume. Health check validates row counts and weekly_insights freshness.",
            "Updated Supabase data visible on dashboard after next page load; no frontend redeploy required.",
        ),
    ]
    for title, purpose, inp, process, output in phases:
        add_h(doc, title, 2)
        add_p(doc, f"Purpose: {purpose}")
        add_p(doc, f"Input: {inp}")
        add_p(doc, f"Process: {process}")
        add_p(doc, f"Output: {output}")

    add_h(doc, "4. Repository Structure (key paths)")
    add_bullets(
        doc,
        [
            "src/phase1_data_pipeline/ — ingestion, cleaning, PII, deduplication",
            "src/phase2_analysis/ — embeddings, clustering, themes, sentiment, segments, cluster LLM",
            "src/phase3_knowledge/ — problem engine, deep-dive, opportunity scoring, prioritization",
            "src/phase5_orchestration/ — pipeline orchestrator, weekly report, health checks",
            "frontend/ — Next.js dashboard (Vercel root directory)",
            "scripts/ — CLI entry points for each phase and run_pipeline.py",
            "data/outputs/ — Phase 3 JSON used for local fallback and DOCX generation",
            "DOCS/ — architecture, implementation plan, scoring methodology",
        ],
    )

    add_h(doc, "5. Segmentation Framework")
    add_p(
        doc,
        "The dashboard uses five lenses to slice the same review corpus. Behavioral segmentation is the "
        "primary lens for ranking and opportunities. Business labels come from Phase 2; engagement and "
        "context are derived groupings for comparison."
    )
    add_h(doc, "5.1 Business segmentation (Phase 2 user_segment)", 2)
    for name, desc in BUSINESS_SEGMENTS:
        add_p(doc, f"{name}: {desc}")
    add_h(doc, "5.2 Usage / engagement segmentation", 2)
    for name, desc in ENGAGEMENT_LENSES:
        add_p(doc, f"{name}: {desc}")
    add_h(doc, "5.3 Behavioral segmentation (primary for ranking)", 2)
    add_p(
        doc,
        "Six behavioral segments mapped from Phase 2 labels plus review language and themes:"
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
    add_h(doc, "5.4 Pain segmentation", 2)
    for name, desc in PAIN_LENSES:
        add_p(doc, f"{name}: {desc}")

    add_h(doc, "6. Theme Classification")
    add_p(
        doc,
        "Themes are assigned at the cluster level using keyword patterns from cluster centroids and "
        "lightweight classifiers, then propagated to every review in the cluster. "
        "The taxonomy aligns with discovery and recommendation problem areas:"
    )
    for theme, desc in THEME_DEFINITIONS.items():
        add_p(doc, f"{theme}: {desc}")

    add_h(doc, "7. Scoring System")
    add_table(
        doc,
        ["Metric", "Definition", "Used on"],
        [
            ["Sentiment Score", "Average review tone (1–5; higher = more positive)", "Segment profiles, theme analysis"],
            ["Pain Score", "Average cluster severity (1–5) for cited issues", "Segment cards, pain ranking"],
            ["Complaint Frequency", "Share of cohort reviews citing the top pain cluster", "Segment breakdown, PDF export"],
            ["Business Impact Score", "Friction score × review volume %", "Segment ranking proof"],
            ["Opportunity Score", "Frequency × Severity × Segment Impact × Sentiment Intensity", "Opportunities tab"],
            ["Ranking Score (friction)", "Weighted negative %, pain density, discovery-theme %, severity-adjusted", "Segment rank order"],
            ["Impact Score (pain)", "Review frequency × (cluster severity ÷ 5)", "Pain point rank order"],
            ["Priority Score", "Merged score for action matrix items", "Prioritization / Action plan"],
        ],
    )

    add_h(doc, "8. Ranking & Prioritization Logic")
    add_bullets(
        doc,
        [
            "Segments: sorted by friction_score descending (see formula in §7).",
            "Pain points: sorted by impact_score = frequency × (severity ÷ 5).",
            "Opportunities: sorted by composite score; tier Critical / High / Monitor by rank and score bands.",
            "Action matrix: merges top pains, opportunities, friction segments, emerging issues; sorted by priority_score.",
            "Dashboard may overlay live window counts when Supabase corpus load succeeds; structure comes from Phase 3 JSON.",
        ],
    )

    add_h(doc, "9. Decision Framework")
    add_p(
        doc,
        "The platform does not pick a single segment automatically for product teams. "
        "It surfaces ranked evidence so teams can choose based on two complementary signals:"
    )
    add_bullets(
        doc,
        [
            "Friction rank (#1): highest negative rate and discovery pain density — who hurts most per review.",
            "Volume rank (#1): largest review count or fatigue score — where the most users are affected.",
            "Pain rank (#1): highest impact_score — the most severe widespread complaint theme.",
            "Opportunity rank (#1): highest composite score with Critical tier — best-documented product bet.",
        ],
    )
    add_p(
        doc,
        "Recommended practice: prioritize interventions that score high on both friction and volume "
        "(e.g. Playlist Driven for scale, Habit Listener for intensity). Use the Prioritization Action plan "
        "for the merged Critical-tier list. All decisions should cite review counts and cluster evidence."
    )

    add_h(doc, "10. Operations Guide")
    add_h(doc, "10.1 Running the pipeline locally", 2)
    add_bullets(
        doc,
        [
            "Full run: python scripts/run_pipeline.py --mode full",
            "Incremental: python scripts/run_pipeline.py --mode incremental",
            "Single phase: python scripts/run_problem_statement_engine.py (and similar scripts/)",
            "Health check: python scripts/check_pipeline_health.py",
        ],
    )
    add_h(doc, "10.2 Dashboard deployment", 2)
    add_p(
        doc,
        "Deploy frontend/ to Vercel with Root Directory set to frontend. Required env vars: "
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. "
        "Run supabase_schema.sql and supabase/auth_profiles.sql in Supabase SQL editor."
    )
    add_h(doc, "10.3 Authentication", 2)
    add_p(
        doc,
        "Supabase Auth protects all dashboard routes. Users sign up with username and email. "
        "Middleware refreshes sessions. Service role key is server-only for data reads."
    )
    add_h(doc, "10.4 Regenerating reports", 2)
    add_p(
        doc,
        "PDF: Export Report button in dashboard (90-day window). "
        "DOCX: python scripts/generate_docx_reports.py after a pipeline run."
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
        complete_sentence(
            f"This report summarizes analyzer findings from {total:,} public reviews in the last 90 days. "
            f"The highest-friction behavioral segment is {top_seg['name'] if top_seg else 'unknown'} "
            f"(friction score {top_seg['ranking_score']:.3f}). "
            f"The top prioritized pain point is: {top.get('title', 'Not available')}."
        ),
    )
    if rec_answer.get("finding_summary"):
        add_p(doc, complete_sentence(rec_answer["finding_summary"]))

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
            add_p(
                doc,
                complete_sentence(
                    f"Pain: {p['pain_point']} ({p['count']:,} reviews, {p.get('pct', 0)}% of segment)."
                ),
            )

    add_h(doc, "4. Top Pain Points Ranked")
    pains = prior.get("top_pain_points", [])[:8]
    add_table(
        doc,
        ["Rank", "Pain point", "Reviews", "Vol %", "Severity", "Impact score"],
        [
            [
                i + 1,
                complete_sentence(p["pain_point"]),
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
            proof = (
                f"Rank #1: {p['frequency']:,} reviews with impact score {p['impact_score']:.1f}, "
                f"the highest frequency × severity combination in the corpus."
            )
        elif prev:
            proof = (
                f"Rank #{i + 1}: {p['frequency']:,} reviews versus rank #{i} at {prev['frequency']:,} reviews. "
                f"Impact score {p['impact_score']:.1f} versus {prev['impact_score']:.1f} for the higher-ranked item."
            )
        else:
            proof = "Ranked by impact score, which is complaint frequency multiplied by cluster severity."
        add_p(doc, complete_sentence(proof))
        add_p(doc, complete_sentence(p["pain_point"]))

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
                complete_sentence(o.get("pain_point") or ""),
            ]
            for i, o in enumerate(opps.get("opportunities", [])[:8])
        ],
    )
    for i, o in enumerate(opps.get("opportunities", [])[:8]):
        prev = opps.get("opportunities", [])[i - 1] if i > 0 else None
        composite = o.get("scores", {}).get("composite", 0)
        if i == 0:
            proof = (
                f"Rank #1 with composite impact score {composite * 100:.2f} and {o.get('review_count', 0):,} "
                f"supporting reviews in the 90-day window."
            )
        elif prev:
            prev_c = prev.get("scores", {}).get("composite", 0)
            proof = (
                f"Rank #{i + 1} with impact score {composite * 100:.2f} below rank #{i} "
                f"({prev_c * 100:.2f}) based on frequency, severity, and segment impact."
            )
        else:
            proof = f"Ranked #{o.get('rank', i + 1)} by composite opportunity score."
        add_p(doc, complete_sentence(proof))
        add_p(doc, complete_sentence(o.get("pain_point") or ""))

    add_h(doc, "9. Final Recommendations")
    add_p(doc, "Based on Critical-tier prioritization and opportunity scores from the analyzer:")
    for rec in prior.get("product_recommendations", [])[:6]:
        add_p(doc, complete_sentence(f"[{rec.get('tier', 'Monitor')}] {rec.get('recommendation', '')}"))
        add_p(
            doc,
            complete_sentence(
                f"Supporting evidence: {rec.get('review_count', 0):,} reviews, "
                f"opportunity score {rec.get('opportunity_score', 0):.4f}. "
                f"Related pain: {rec.get('pain_point', '')}"
            ),
        )
    add_p(
        doc,
        complete_sentence(
            f"Top priority action: {top.get('recommendation') or top.get('title', 'See prioritization matrix in dashboard.')}"
        ),
    )


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
