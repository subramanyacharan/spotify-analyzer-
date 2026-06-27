# Architecture Decision Records (ADRs)

Technical decisions for the AI-Powered Review Discovery Engine, aligned with [Problem statement.md](./Problem%20statement.md).

---

## ADR-001: Product Selection — Spotify

- **Context:** Need a consumer product with rich feedback about music discovery and recommendations.
- **Decision:** Spotify as the target product.
- **Rationale:** Large review volume across App Store and Play Store; discovery and recommendations are frequent review topics.
- **Status:** Accepted

---

## ADR-002: Hybrid Analysis over Per-Review LLM

- **Context:** ~50k reviews make per-review LLM classification costly and rate-limit prone. Reviews still need contextual understanding for cluster-level insights.
- **Decision:** Hybrid pipeline — lightweight models (VADER, TextBlob, keyword/zero-shot themes, rule-based segments) for per-review tasks; Groq LLM only at cluster level (~5 calls).
- **Rationale:** 90–98% LLM cost reduction while preserving structured pain points and opportunities via cluster summaries.
- **Trade-off:** Per-review nuance captured indirectly through cluster propagation, not individual LLM classification.
- **Status:** Accepted (supersedes pure LLM-first per-review approach)

---

## ADR-003: Dual-Storage Architecture (Supabase + Optional ChromaDB)

- **Context:** Need permanent structured storage plus optional semantic retrieval.
- **Decision:** Supabase as primary source of truth; ChromaDB as optional vector accelerator.
- **Rationale:** Phase 3 insight engines aggregate Supabase data directly. ChromaDB supports optional semantic retrieval but is not required for core dashboards or weekly reports.
- **Status:** Accepted

---

## ADR-004: Rolling 90-Day Analysis Window

- **Context:** User sentiment and app features evolve; analysis should focus on recent feedback.
- **Decision:** 90-day (3-month) window for ingestion and optional ChromaDB embeddings.
- **Rationale:** Keeps active analysis relevant; all historical data retained in Supabase for long-term trends.
- **Status:** Accepted

---

## ADR-005: Batch Processing over Real-Time

- **Context:** Output is weekly product intelligence, not live monitoring.
- **Decision:** Batch pipeline runs (weekly primary, optional daily incremental ingest).
- **Rationale:** Simpler, cheaper, easier to test and debug.
- **Status:** Accepted

---

## ADR-006: Behavioral Segmentation for Product Decisions

- **Context:** Problem statement requires segment-wise discovery challenges, but review data cannot reliably infer demographics (age, student/professional/parent).
- **Decision:** Phase 3 uses six **behavioral segments** (Discovery Seeker, Habit Listener, Heavy Listener, Playlist Driven, Niche Listener, Casual Listener), mapped from Phase 2 rule-based labels.
- **Rationale:** Insights stay realistic and evidence-backed. Demographic profiles excluded from primary decision factors.
- **Status:** Accepted

---

## ADR-007: Product Decision Intelligence Layer (Phase 3)

- **Context:** Phase 2 produces themes, sentiment, segments, and cluster insights. Product teams need aggregated answers to six core discovery questions, not raw classifications alone.
- **Decision:** Phase 3 insight engines — Problem Statement Query, Segment Deep-Dive, Opportunity Scoring, Insight Prioritization — built on Supabase aggregates and cluster_insights.
- **Rationale:** Directly supports problem statement expected outputs (pain points, behavior patterns, segment challenges, unmet needs, trends).
- **Status:** Accepted (3.1 implemented)

---

## ADR-008: Next.js Dashboard on Vercel

- **Context:** Product and growth teams need an interactive dashboard matching the [reference UI](./reference.png) — sidebar navigation, five-level segmentation filters, segment matrix, and comparison cards. Streamlit cannot replicate this custom product analytics layout.
- **Decision:** **Next.js** (App Router) + React + Tailwind + Recharts for Phase 4; deploy to **Vercel** with Git-connected CI/CD. Data via read-only `@supabase/supabase-js` (anon key). Python pipeline (Phases 1–3, 5) remains separate from frontend hosting.
- **Rationale:** Matches reference mockup fidelity; free Vercel tier; native Next.js support; preview deploys for demos; Supabase already in stack.
- **Status:** Accepted (supersedes Streamlit-only ADR-008)

---

## Decision Log

| # | Decision | Date | Status |
|---|----------|------|--------|
| ADR-001 | Spotify as target product | 2026-06-20 | Accepted |
| ADR-002 | Hybrid analysis (not per-review LLM) | 2026-06-21 | Accepted |
| ADR-003 | Supabase primary + optional ChromaDB | 2026-06-20 | Accepted |
| ADR-004 | Rolling 90-day window | 2026-06-20 | Accepted |
| ADR-005 | Batch processing | 2026-06-20 | Accepted |
| ADR-006 | Behavioral segmentation (Phase 3) | 2026-06-21 | Accepted |
| ADR-007 | Product Decision Intelligence layer | 2026-06-21 | Accepted |
| ADR-008 | Next.js dashboard on Vercel | 2026-06-20 | Accepted |
