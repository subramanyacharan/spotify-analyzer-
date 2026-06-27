# Phase Evaluation & Exit Criteria

Testing strategy and success criteria aligned with [Problem statement.md](./Problem%20statement.md) and the Product Decision Intelligence platform architecture.

---

## Phase 1: Data Pipeline & Ingestion

### Testing Strategy
- Unit tests for ingestion, cleaning, sanitization, deduplication
- Schema validation and PII audit on processed output

### Exit Criteria

| # | Criterion | Metric |
|---|-----------|--------|
| 1 | Supabase setup | Tables configured with correct schema |
| 2 | Multi-source ingestion | ≥ 5,000 raw reviews from ≥ 2 sources |
| 3 | Normalized dates | 100% ISO 8601 |
| 4 | No PII leakage | 0 PII regex matches in processed text |
| 5 | Deduplication | Dedup ratio reported |
| 6 | Processed storage | Rows in `processed_reviews` |

---

## Phase 2: Hybrid AI Analysis Engine

### Testing Strategy
- Validate theme, sentiment, and segment coverage on sample reviews
- Confirm cluster insights JSON structure and severity bounds
- Verify cluster_id and pain_points propagation

### Exit Criteria

| # | Criterion | Metric |
|---|-----------|--------|
| 1 | Clustering complete | 100% reviews have cluster_id |
| 2 | Theme classification | 100% reviews labeled with ≥ 1 theme |
| 3 | Sentiment scores | 100% coverage in Supabase |
| 4 | User segments | 100% reviews have user_segment |
| 5 | Cluster insights | One row per cluster in `cluster_insights` |
| 6 | LLM efficiency | Cluster-level calls only (~5 vs. per-review) |
| 7 | Data integrity | All results mapped to original review IDs |

---

## Phase 3: Insight Intelligence Layer

### Testing Strategy
- Validate all six core problem-statement questions return structured answers
- Confirm behavioral segment normalization (no demographic labels in output)
- Verify opportunity scores use only supported metrics
- Check evidence linkage (quotes, themes, cluster pain points)

### Exit Criteria

| # | Criterion | Metric |
|---|-----------|--------|
| 1 | Problem statement engine (3.1) | All 6 core questions answered with metrics + quotes |
| 2 | Segment deep-dives (3.2) | Profiles for all 6 behavioral segments |
| 3 | Opportunity scoring (3.3) | Ranked list with Frequency × Severity × Segment Impact × Sentiment |
| 4 | Prioritization (3.4) | Tiered output (Critical / High / Monitor) |
| 5 | Data constraint | No demographic inference in primary outputs |
| 6 | Supabase storage | Insights persisted for dashboard consumption |

**Phase 3.1 status:** Problem Statement Query Engine implemented — 48,730 reviews analyzed, six structured answers saved.

---

## Phase 4: Dashboard & Analytics (Vercel)

### Testing Strategy
- Functional test of all Next.js views and filters (`npm run dev` locally against Supabase)
- Validate charts against known Supabase aggregates
- Confirm five-level segmentation filters (not demographic)
- Vercel preview deploy smoke test before production

### Exit Criteria

| # | Criterion | Metric |
|---|-----------|--------|
| 1 | Executive overview | KPIs render from Phase 2/3 data |
| 2 | Problem statement view | Six questions displayed with drill-down |
| 3 | Visualizations | Trend, theme, segment, opportunity charts present |
| 4 | Filters | Date, source, theme, sentiment, five-level segmentation, cluster, opportunity tier |
| 5 | Decision support | Highest-pain segment, highest-opportunity segment, top problems identifiable |
| 6 | Vercel deployment | Production URL live; Supabase env vars configured; matches reference layout |

---

## Phase 5: Weekly Reporting & Automation

### Testing Strategy
- End-to-end pipeline run from ingest to weekly report
- Verify week-over-week comparability
- Error recovery and idempotent re-runs
- Confirm Vercel dashboard shows updated data after pipeline run (no redeploy)

### Exit Criteria

| # | Criterion | Metric |
|---|-----------|--------|
| 1 | Weekly report content | Emerging complaints, theme shifts, segment changes, opportunities, summary |
| 2 | Full pipeline | Phases 1–5 execute without unhandled errors |
| 3 | Supabase preserved | Phase 2/3 outputs intact after automation runs |
| 4 | Scheduling | Weekly trigger configured (Python runner separate from Vercel) |
| 5 | Documentation | Methodology doc + Vercel deploy guide + production URL documented |

---

## Problem Statement Success Criteria (Cross-Phase)

| Criterion | Validated By |
|-----------|-------------|
| Process large-scale review data automatically | Phase 1 + 5 |
| Classify major themes accurately | Phase 2 |
| Identify recurring discovery pain points | Phase 2.5 + 3.1 |
| Segment users by behavior and challenges | Phase 2.4 + 3.2 |
| Surface actionable product opportunities | Phase 3.3 + 4.5 |
