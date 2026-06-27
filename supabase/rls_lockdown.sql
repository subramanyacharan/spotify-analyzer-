-- Security lockdown: revoke public access to pipeline tables
-- Run in Supabase SQL Editor on existing projects (after supabase_schema.sql).
--
-- Problem: policies named "Allow service role..." used USING (true), which grants
-- anon/authenticated full read/write on all review data via the public anon key.
--
-- Fix: drop those policies. service_role bypasses RLS (Python pipeline + dashboard
-- server). anon/authenticated get no access to pipeline tables.

DROP POLICY IF EXISTS "Allow service role full access to raw_reviews" ON public.raw_reviews;
DROP POLICY IF EXISTS "Allow service role full access to processed_reviews" ON public.processed_reviews;
DROP POLICY IF EXISTS "Allow service role full access to weekly_insights" ON public.weekly_insights;
DROP POLICY IF EXISTS "Allow service role full access to historical_trends" ON public.historical_trends;
DROP POLICY IF EXISTS "Allow service role full access to cluster_insights" ON public.cluster_insights;

-- Explicit deny for anon + authenticated (defense in depth if policies are re-added)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'raw_reviews',
    'processed_reviews',
    'weekly_insights',
    'historical_trends',
    'cluster_insights'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Deny public access to %1$s" ON public.%1$I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Deny public access to %1$s" ON public.%1$I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false)',
      tbl
    );
  END LOOP;
END $$;

-- profiles: users may only read/update their own row (from auth_profiles.sql)
-- resolve_login_email / is_username_available: auth helpers only (SECURITY DEFINER)
