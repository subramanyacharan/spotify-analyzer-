-- Schema for AI-Powered Review Discovery Engine
-- Run this in your Supabase SQL Editor

-- 1. Raw Reviews Table
CREATE TABLE IF NOT EXISTS public.raw_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source VARCHAR(50) NOT NULL, -- e.g., 'play_store', 'app_store', 'reddit'
    review_id VARCHAR(255) UNIQUE, -- ID from the source to prevent duplicates
    review_text TEXT NOT NULL,
    rating INTEGER,
    review_date TIMESTAMP WITH TIME ZONE,
    version VARCHAR(50),
    thumbs_up_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Processed Reviews Table
CREATE TABLE IF NOT EXISTS public.processed_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_review_id UUID REFERENCES public.raw_reviews(id) ON DELETE CASCADE,
    cleaned_text TEXT NOT NULL,
    themes JSONB DEFAULT '[]'::jsonb, -- Array of themes like ["Playlist Fatigue", "Discover Weekly"]
    sentiment_label VARCHAR(50), -- e.g., 'positive', 'neutral', 'negative'
    sentiment_score INTEGER, -- 1 to 5
    user_segment VARCHAR(100), -- e.g., 'Premium User', 'Casual Listener'
    pain_points JSONB DEFAULT '[]'::jsonb, -- Array of structured pain points
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Weekly Insights Table
CREATE TABLE IF NOT EXISTS public.weekly_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    top_themes JSONB DEFAULT '[]'::jsonb,
    pulse_report_md TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Historical Trends Table
CREATE TABLE IF NOT EXISTS public.historical_trends (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    week_start DATE NOT NULL,
    theme VARCHAR(100) NOT NULL,
    mention_count INTEGER DEFAULT 0,
    avg_sentiment NUMERIC(3, 2),
    segment_breakdown JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Phase 2.1: Add cluster_id column to processed_reviews (run this if upgrading from Phase 1 schema)
ALTER TABLE public.processed_reviews ADD COLUMN IF NOT EXISTS cluster_id INTEGER;

-- Phase 2.5: Cluster-level LLM insights (one row per cluster)
CREATE TABLE IF NOT EXISTS public.cluster_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cluster_id INTEGER UNIQUE NOT NULL,
    themes JSONB DEFAULT '[]'::jsonb,
    pain_point TEXT NOT NULL,
    severity INTEGER CHECK (severity >= 1 AND severity <= 5),
    feature_request TEXT,
    representative_user_quotes JSONB DEFAULT '[]'::jsonb,
    product_opportunity TEXT,
    review_count INTEGER DEFAULT 0,
    dominant_sentiment VARCHAR(50),
    top_segments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_raw_reviews_date ON public.raw_reviews(review_date);
CREATE INDEX IF NOT EXISTS idx_raw_reviews_source ON public.raw_reviews(source);
CREATE INDEX IF NOT EXISTS idx_processed_reviews_sentiment ON public.processed_reviews(sentiment_label);
CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_reviews_raw_review_id ON public.processed_reviews(raw_review_id);
CREATE INDEX IF NOT EXISTS idx_weekly_insights_dates ON public.weekly_insights(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_processed_reviews_cluster_id ON public.processed_reviews(cluster_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_insights_cluster_id ON public.cluster_insights(cluster_id);

-- Setup Row Level Security (RLS)
-- Pipeline tables: RLS ON, no public policies. service_role bypasses RLS (Python + dashboard server).
-- NEVER add USING (true) policies — that exposes all data to the browser anon key.
ALTER TABLE public.raw_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_insights ENABLE ROW LEVEL SECURITY;

-- Explicit deny for anon/authenticated on pipeline data (see supabase/rls_lockdown.sql)
CREATE POLICY "Deny public access to raw_reviews" ON public.raw_reviews AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny public access to processed_reviews" ON public.processed_reviews AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny public access to weekly_insights" ON public.weekly_insights AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny public access to historical_trends" ON public.historical_trends AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "Deny public access to cluster_insights" ON public.cluster_insights AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);

-- ---------------------------------------------------------------------------
-- Phase 4.10.1 — Dashboard auth (separate migration)
-- Run supabase/auth_profiles.sql after this schema for profiles + login RPCs.
-- Run supabase/rls_lockdown.sql on existing DBs that had USING (true) policies.
-- ---------------------------------------------------------------------------
