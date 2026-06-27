# AI-Powered Review Discovery Engine

> Build an AI-powered review intelligence system that analyzes large-scale user feedback to identify why users struggle with music discovery, why repetitive listening persists, and what product opportunities exist to improve meaningful discovery in Spotify.

## Project Structure

```
GRAD PROJ/
├── DOCS/                          # Architecture, implementation plan, decisions
├── frontend/                      # Phase 4 — Next.js dashboard (Vercel)
│   └── src/
│       ├── app/                   # Routes (overview, insights, auth, …)
│       ├── components/            # UI, filters, auth, analytics
│       ├── lib/                   # Data layer, Supabase, filters, auth
│       └── proxy.ts               # Session + route protection (Next.js 16)
├── scripts/                       # Phase 2–3 pipeline runners
│   ├── run_embedding_clustering.py
│   ├── run_theme_classification.py
│   ├── run_sentiment_analysis.py
│   ├── run_user_segment_detection.py
│   ├── run_cluster_insights.py
│   ├── run_problem_statement_engine.py
│   ├── run_segment_deep_dive.py
│   ├── run_opportunity_scoring.py
│   ├── run_insight_prioritization.py
│   ├── run_embedding_store.py     # optional ChromaDB
│   ├── run_weekly_report.py       # Phase 5.1
│   ├── run_pipeline.py            # Phase 5.2
│   ├── run_scheduled_pipeline.py  # Phase 5.3
│   └── check_pipeline_health.py   # Phase 5.3
├── src/
│   ├── phase1_data_pipeline/      # Ingestion, cleaning, PII, dedup
│   ├── phase2_analysis/           # Embeddings, themes, sentiment, segments, LLM
│   ├── phase3_knowledge/          # Problem engine, deep-dive, scoring, prioritization
│   ├── phase4_output/             # Placeholder (dashboard lives in frontend/)
│   └── phase5_orchestration/      # Weekly report, pipeline, health, scheduling
├── supabase/
│   └── auth_profiles.sql          # Dashboard auth (Phase 4.10.1)
├── data/
│   ├── raw/                       # Raw review exports
│   ├── processed/                 # Local Phase 1 exports
│   ├── chroma_db/                 # Vector store (optional)
│   └── outputs/                   # Phase 3 JSON (+ frontend local fallback)
├── tests/                         # pytest suite
├── supabase_schema.sql            # Main database schema
├── requirements.txt
└── .env.example
```

## Quick Start

```bash
cd "GRAD PROJ"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

## Run Pipeline Phases

```bash
# Phase 1
python -m src.phase1_data_pipeline.data_ingestion
python -m src.phase1_data_pipeline.data_cleaning
python -m src.phase1_data_pipeline.data_sanitization
python -m src.phase1_data_pipeline.deduplication

# Phase 2
python scripts/run_embedding_clustering.py
python scripts/run_theme_classification.py
python scripts/run_sentiment_analysis.py
python scripts/run_user_segment_detection.py
python scripts/run_cluster_insights.py

# Phase 3
python scripts/run_problem_statement_engine.py
python scripts/run_segment_deep_dive.py
python scripts/run_opportunity_scoring.py
python scripts/run_insight_prioritization.py
python scripts/run_embedding_store.py   # optional: ChromaDB
python scripts/run_weekly_report.py     # 5.1 — weekly report
python scripts/run_pipeline.py          # 5.2 — full orchestrated pipeline
python scripts/run_scheduled_pipeline.py  # 5.3 — weekly scheduled entry point
python scripts/check_pipeline_health.py   # 5.3 — health check
```

## Weekly automation (Phase 5.3)

GitHub Actions runs the pipeline **every Sunday at 05:00 UTC** (see `.github/workflows/weekly-pipeline.yml` at the repo root).

**Required GitHub repository secrets:**

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service role key |
| `GROQ_API_KEY` | Groq LLM API key |

Optional: `GROQ_MODEL`, `OPENAI_API_KEY`, `SLACK_WEBHOOK_URL`, `VERCEL_DASHBOARD_URL`

To change the schedule to 5:00 AM in your timezone, edit the `cron` line in the workflow (GitHub uses UTC).

## Dashboard (Phase 4)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000/overview](http://localhost:3000/overview). See `frontend/README.md` and `DOCS/implementationPlan.md` §4.10 for auth and Vercel deploy.

### Deploy to Vercel (Phase 4.10.2)

1. Push this folder to [github.com/subramanyacharan/spotify-analyzer-](https://github.com/subramanyacharan/spotify-analyzer-)
2. [vercel.com/new](https://vercel.com/new) → import repo → **Root Directory:** `frontend`
3. Set env vars (see `frontend/.env.local.example`)
4. Configure Supabase auth redirect URLs for your Vercel domain

Full guide: [`frontend/README.md`](frontend/README.md)

## Current Status

- [x] Phase 1 — Data pipeline
- [x] Phase 2 — Hybrid AI analysis engine
- [x] Phase 3 — Insight engines (problem, deep-dive, opportunities, prioritization)
- [x] Phase 4 — Dashboard & analytics (frontend)
- [x] Phase 4.10.1 — Supabase Auth
- [x] Phase 4.10.2 — Vercel deployment ([spotify-analyzer-](https://github.com/subramanyacharan/spotify-analyzer-))
- [x] Phase 5.1 — Automated weekly report generation
- [x] Phase 5.2 — Pipeline orchestration
- [x] Phase 5.3 — GitHub Actions weekly scheduling

## Tech Stack

- **Python 3.11+**, **Supabase**, **ChromaDB** (optional)
- **Next.js 16**, **React**, **Tailwind** (dashboard on Vercel)
- **sentence-transformers**, **scikit-learn**, **Groq**, **VADER/TextBlob**

See [DOCS/implementationPlan.md](DOCS/implementationPlan.md) for the full roadmap.
