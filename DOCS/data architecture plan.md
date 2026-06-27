# Data Architecture Plan — AI Review Discovery Engine

## 1. Objective

Design a scalable data architecture that supports review ingestion, hybrid AI analysis, **product decision intelligence**, and dashboard reporting — aligned with [Problem statement.md](./Problem%20statement.md).

The system converts large-scale user feedback into:

- Top discovery-related complaints
- Recommendation pain points
- Listening behavior patterns
- Behavioral segment discovery challenges
- Emerging unmet needs
- Trend shifts over time

---

## 2. Storage Architecture

| Store | Role | Retention |
|-------|------|-----------|
| **Supabase** | Primary source of truth — all structured data | Permanent |
| **ChromaDB** | Optional vector store for semantic retrieval | Rolling 90-day window (when enabled) |

All insight engines (Phase 3) read primarily from Supabase. ChromaDB is an optional accelerator, not a dependency for core reporting.

---

## 3. Supabase (Primary Storage)

**Tables and contents:**

| Table | Data |
|-------|------|
| `raw_reviews` | Source, review text, rating, timestamp, metadata |
| `processed_reviews` | Cleaned text, themes, sentiment, user_segment, cluster_id, pain_points |
| `cluster_insights` | Cluster pain points, severity, feature requests, quotes, product opportunities |
| `weekly_insights` | Weekly reports, problem-statement snapshots, top themes |
| `historical_trends` | Theme counts, sentiment averages, segment breakdowns by week |

**Available signals for insights:** review text, ratings, timestamps, sources, and Phase 2 classifications only.

---

## 4. ChromaDB (Optional Analyzer Storage)

When enabled, stores:

- Review embeddings (text + theme + sentiment chunks)
- Metadata filters: date, source, segment, theme, week_number, cluster_id

Used for optional semantic retrieval supporting Phase 3 query engines. Data evicted from ChromaDB remains in Supabase.

---

## 5. Rolling Analysis Window

- **Ingestion:** Reviews collected for the last **90 days (3 months)** on each full run.
- **ChromaDB (optional):** Active embeddings limited to the same 90-day window.
- **Supabase:** Retains all ingested historical data for trend analysis.

---

## 6. Data Flow

```
Review Sources
    → Ingestion & Cleaning (Phase 1)
    → Supabase (raw_reviews, processed_reviews)
    → Hybrid Analysis (Phase 2): themes, sentiment, segments, clusters, cluster_insights
    → Insight Intelligence (Phase 3): problem answers, segment profiles, opportunity scores, prioritization
    → Supabase (weekly_insights, historical_trends)
    → Next.js Dashboard on Vercel (Phase 4) — read-only fetch via @supabase/supabase-js
    → Weekly Reports & Pipeline Automation (Phase 5)
```

---

## 6.1 Dashboard Deployment Layer

| Component | Technology | Role |
|-----------|------------|------|
| **Frontend** | Next.js + React + Tailwind + Recharts | UI matching [reference.png](./reference.png) |
| **Hosting** | **Vercel** | Production + preview deploys; Git CI/CD |
| **API / data** | Supabase (existing schema) | Read-only queries; SQL views/RPC for aggregates |
| **Pipeline** | Python (Phases 1–3, 5) | Writes insights to Supabase; separate from Vercel |

The dashboard does not run the analysis pipeline. It consumes structured outputs already stored in Supabase.

---

## 7. Behavioral Segmentation (Phase 3 Decision Layer)

Phase 2 assigns rule-based segments (New User, Casual Listener, Premium User, Heavy Listener, Niche Music Listener).

Phase 3 normalizes these into **behavioral segments** for product decisions:

- Discovery Seeker
- Habit Listener
- Heavy Listener
- Playlist Driven
- Niche Listener
- Casual Listener

Demographic profiles (students, age groups, parents, etc.) are **not** used as primary decision factors.

---

## 8. Key Benefits

- Permanent historical retention in Supabase
- Scalable hybrid analysis (~50k reviews without per-review LLM)
- Realistic, evidence-backed product insights
- Dashboard-ready structured outputs for growth and product teams
- **Vercel-hosted** Next.js frontend with read-only Supabase access — no duplicate data store
- Optional vector search without blocking core analytics
