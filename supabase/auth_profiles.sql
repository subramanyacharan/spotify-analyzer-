-- =============================================================================
-- Dashboard auth setup (SAFE — additive only)
-- =============================================================================
-- What this script DOES:
--   - Creates public.profiles (new table for login usernames)
--   - Adds sign-up trigger on auth.users (new accounts only)
--   - Adds login helper functions (resolve_login_email, is_username_available)
--
-- What this script does NOT touch:
--   - raw_reviews, processed_reviews, weekly_insights
--   - cluster_insights, historical_trends, or any existing pipeline data
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE only (no DROP).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users) — new table only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profiles_username_unique UNIQUE (username),
    CONSTRAINT profiles_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON public.profiles (lower(email));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies (skip if already exist — no DROP)
DO $policy$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'Users can read own profile'
    ) THEN
        CREATE POLICY "Users can read own profile"
            ON public.profiles FOR SELECT
            USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile"
            ON public.profiles FOR UPDATE
            USING (auth.uid() = id);
    END IF;
END;
$policy$;

-- Auto-create profile on sign-up (new auth.users rows only)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Attach trigger only if missing (no DROP TRIGGER)
DO $trigger$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'on_auth_user_created'
          AND n.nspname = 'auth'
          AND c.relname = 'users'
          AND NOT t.tgisinternal
    ) THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user();
    END IF;
END;
$trigger$;

-- ---------------------------------------------------------------------------
-- RPC: resolve username or email -> email (login + password reset)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_login_email(identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized TEXT;
    resolved TEXT;
BEGIN
    normalized := lower(trim(identifier));
    IF normalized = '' THEN
        RETURN NULL;
    END IF;

    IF position('@' IN normalized) > 0 THEN
        RETURN normalized;
    END IF;

    SELECT email INTO resolved
    FROM public.profiles
    WHERE lower(username) = normalized
    LIMIT 1;

    RETURN resolved;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(username) = lower(trim(p_username))
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO anon, authenticated;
