# Edge Cases & Failure Scenarios

Potential failure modes across the AI-Powered Review Discovery Engine. Aligned with [Problem statement.md](./Problem%20statement.md) and the Product Decision Intelligence architecture.

---

## Phase 1: Data Pipeline

### Ingestion
- **Rate limiting / IP bans** from App Store or Play Store scrapers
- **API schema changes** breaking scraper parsers
- **Zero new reviews** in a weekly run (silent scraper failure or low activity)
- **Multilingual reviews** bypassing English-centric theme/segment rules

### Cleaning & Sanitization
- **Non-standard date formats** breaking temporal filters
- **Extremely long reviews** exceeding downstream token limits
- **Obfuscated PII** bypassing regex (e.g., `user [at] gmail [dot] com`)
- **Emoji-only reviews** producing empty or meaningless analysis input

### Supabase
- **Connection timeouts** during bulk inserts
- **Duplicate insertions** on pipeline retry without idempotency

---

## Phase 2: Hybrid Analysis Engine

### Analysis
- **Groq rate limits / daily token caps** during cluster insight generation
- **Malformed JSON** from cluster-level LLM responses
- **Mixed sentiments** in a single review (positive UI praise + negative discovery complaint)
- **Unidentifiable segments** in short reviews with no behavioral signals
- **Off-topic reviews** (billing, ads) with weak discovery theme match

### Clustering
- **Cluster imbalance** — one cluster dominates, reducing insight diversity
- **Empty or near-empty clusters** after filtering

---

## Phase 3: Insight Intelligence Layer

### Problem Statement Query Engine (3.1)
- **Zero matching reviews** for a filtered query — must return graceful "insufficient evidence" response
- **Over-broad keyword matching** inflating relevant review counts
- **Segment normalization ambiguity** — Phase 2 label maps to multiple behavioral segments

### Segment Deep-Dives (3.2)
- **Sparse segment data** — behavioral segment with very few reviews produces unreliable profiles
- **Playlist Driven over-counting** — playlist keywords in text may overweight that segment

### Opportunity Scoring (3.3)
- **Tied scores** requiring deterministic tie-breakers
- **High frequency / low severity** items ranking above critical but rare issues
- **Scoring with missing cluster severity** when cluster_insights row is absent

### Prioritization (3.4)
- **Conflicting signals** — high opportunity score but low negative sentiment
- **No prior week data** — emerging issue detection fails on first run

### Data Constraints
- **Demographic inference requests** — system must decline or redirect to behavioral segments
- **Unsupported insight requests** (e.g., age-based recommendations) must not appear in primary outputs

---

## Phase 4: Dashboard & Analytics (Vercel)

- **Empty dashboard state** when no reviews match active filters
- **Performance degradation** visualizing full 50k+ dataset without pagination or Supabase RPC aggregation
- **Stale Phase 3 data** — dashboard shows outdated insight scores if Supabase refresh fails
- **Filter combinations** returning zero rows without user feedback
- **Missing Vercel env vars** — build succeeds but runtime Supabase calls fail (blank pages)
- **Supabase RLS misconfiguration** — anon key blocked from read-only tables
- **Vercel serverless timeout** on unbounded aggregate queries — mitigated by single-pass lite aggregation, parallel pagination (8k × 8), 12s corpus timeout with snapshot fallback, 30-minute in-memory corpus cache, and 10-minute `unstable_cache` on merged Phase 3 themes
- **Live vs snapshot ranking drift** — window corpus may re-sort opportunities/prioritization relative to Phase 3 JSON until next pipeline run
- **Corpus fetch timeout** — dashboard falls back to Phase 3 snapshot counts if `getWindowCorpus()` exceeds ~12s
- **CORS / key exposure** — service-role key accidentally bundled in Next.js client code

---

## Phase 5: Weekly Reporting & Automation

- **Partial pipeline failure** — raw reviews stored but Phase 3 insights not generated; next run must resume idempotently
- **Concurrent pipeline runs** causing race conditions on Supabase writes
- **Silent failures** — pipeline exits successfully but produces empty weekly report
- **Week boundary edge cases** — ISO week transitions affecting trend comparisons
- **Vercel stale cache** — ISR or edge cache serving old dashboard data after weekly run (mitigate with revalidate or deploy hook)

---

## ChromaDB

### Phase 2 — `reviews` collection (weekly pipeline)

- **Missing or empty `data/chroma_db`** on first run — full embed of all processed reviews (slower; expected once)
- **Index corruption** after interrupted writes — delete `data/chroma_db` and re-run Phase 2 embedding stage; Supabase retains review text
- **Concurrent client access** causing read errors during active upsert — weekly pipeline uses concurrency lock; avoid parallel pipeline runs
- **GitHub Actions cache miss** — re-embeds reviews that were previously cached locally (longer run, same outcome)

### Phase 3.1 — `review_knowledge` collection (optional)

- **Empty vector store** when optional layer is enabled but `run_embedding_store.py` was never run
- **Stale knowledge collection** if Phase 3.1 script not re-run after major data refresh
