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
| **ChromaDB (Phase 2)** | Embedding store for clustering pipeline — collection `reviews` at `data/chroma_db` | Persistent on disk; cached in GitHub Actions between weekly runs |
| **ChromaDB (Phase 3.1, optional)** | Semantic retrieval collection `review_knowledge` | Rolling 90-day window when `run_embedding_store.py` is run manually |

Phase 3 insight engines and the Vercel dashboard read **Supabase only**. ChromaDB is used in production by Phase 2.1 (`embedding_clustering.py`) on every weekly pipeline run.

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

## 4. ChromaDB (Vector Storage)

ChromaDB is **in active use** in the current codebase. Configure via `CHROMA_PERSIST_DIR` (default `./data/chroma_db`).

### 4.1 Phase 2 — `reviews` collection (weekly pipeline)

Used by `src/phase2_analysis/embedding_clustering.py` on every orchestrated run:

- Stores review embedding vectors (local sentence-transformers by default)
- Supports incremental runs — skips reviews already embedded
- Loads embeddings back for K-Means / DBSCAN clustering
- Final `cluster_id` and analysis fields are written to Supabase `processed_reviews`

This collection is **required** for the standard weekly GitHub Actions pipeline. The workflow restores and saves `data/chroma_db` as a cache.

### 4.2 Phase 3.1 — `review_knowledge` collection (optional)

Used only when `scripts/run_embedding_store.py` is run separately:

- Stores richer metadata chunks for optional semantic quote retrieval
- **Not** included in `scripts/run_scheduled_pipeline.py` stage list
- Phase 3 core engines (problem statement, deep-dive, opportunities, prioritization) do not depend on it

Data evicted from optional Phase 3.1 collections remains in Supabase.

---

## 5. Rolling Analysis Window

- **Ingestion:** Reviews collected for the last **90 days (3 months)** on each full run; **7 days** on incremental weekly runs.
- **ChromaDB (Phase 2):** Embeddings for all processed reviews in the active analysis set; persisted at `data/chroma_db`.
- **ChromaDB (Phase 3.1, optional):** Active embeddings limited to the same 90-day window when the knowledge-layer script is run.
- **Supabase:** Retains all ingested historical data for trend analysis.

---

## 6. Data Flow

```
Review Sources
    → Ingestion & Cleaning (Phase 1)
    → Supabase (raw_reviews, processed_reviews)
    → Hybrid Analysis (Phase 2): embeddings in ChromaDB → themes, sentiment, segments, clusters → Supabase
    → Insight Intelligence (Phase 3): problem answers, segment profiles, opportunity scores, prioritization
    → Supabase (weekly_insights, historical_trends)
    → Next.js Dashboard on Vercel (Phase 4) — server-side Supabase reads + optional 90-day window corpus overlay
    → Weekly pipeline automation + PDF export (Phase 5)
```

---

## 6.1 Dashboard Deployment Layer

| Component | Technology | Role |
|-----------|------------|------|
| **Frontend** | Next.js + React + Tailwind + Recharts | UI matching [reference.png](./reference.png) |
| **Hosting** | **Vercel** | Production + preview deploys; Git CI/CD |
| **API / data** | Supabase (existing schema) | Server-side queries via service role; Phase 3 JSON from `weekly_insights`; live 90-day metrics via `window-corpus.ts` |
| **Pipeline** | Python (Phases 1–3, 5) | Writes insights to Supabase; separate from Vercel |

The dashboard does not run the analysis pipeline. It consumes structured outputs already stored in Supabase.

**PDF export:** The TopBar **Export Report** action reads merged `weekly_insights` payloads (`insight_prioritization`, `segment_deep_dives`, `weekly_report`) and renders a nine-section PDF client-side. See [pdf-report.md](./pdf-report.md).

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
- ChromaDB accelerates Phase 2 embedding reuse; dashboard and Phase 3 reporting do not query ChromaDB
