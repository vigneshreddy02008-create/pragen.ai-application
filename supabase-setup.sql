-- ─────────────────────────────────────────────────────────────
-- Pragen.ai  –  Supabase Database Setup
-- Run this ONCE in your Supabase project's SQL Editor
-- Dashboard → SQL Editor → New query → paste & Run
-- ─────────────────────────────────────────────────────────────

-- 1. Create the applications table
CREATE TABLE IF NOT EXISTS public.applications (
    id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name           TEXT        NOT NULL,
    "displayName"  TEXT,
    email          TEXT        NOT NULL,
    phone          TEXT        NOT NULL,
    state          TEXT,
    city           TEXT,
    linkedin       TEXT,
    github         TEXT,
    "collegeName"  TEXT,
    "collegeCity"  TEXT,
    "collegeState" TEXT,
    branch         TEXT,
    year           TEXT,
    q1             TEXT,
    q2             TEXT,
    q3             TEXT,
    q4             TEXT,
    q5             TEXT,
    status         TEXT        NOT NULL DEFAULT 'Pending',
    timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow anonymous inserts (students submitting applications)
CREATE POLICY "Allow anonymous inserts"
    ON public.applications
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- 4. Policy: Allow anonymous reads (admin panel & status checks)
CREATE POLICY "Allow anonymous reads"
    ON public.applications
    FOR SELECT
    TO anon
    USING (true);

-- 5. Policy: Allow anonymous updates (admin approving/rejecting)
CREATE POLICY "Allow anonymous updates"
    ON public.applications
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- 6. Policy: Allow anonymous deletes (admin removing records)
CREATE POLICY "Allow anonymous deletes"
    ON public.applications
    FOR DELETE
    TO anon
    USING (true);

-- ─────────────────────────────────────────────────────────────
-- OPTIONAL: Index for fast phone-based lookups (status check)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_phone
    ON public.applications (phone);

CREATE INDEX IF NOT EXISTS idx_applications_status
    ON public.applications (status);

CREATE INDEX IF NOT EXISTS idx_applications_email
    ON public.applications (email);

-- ─────────────────────────────────────────────────────────────
-- DONE! Now add these to your .env file or Vercel env vars:
--
--   SUPABASE_URL      = https://xxxxxxxxxxxx.supabase.co
--   SUPABASE_ANON_KEY = eyJhbGc...  (your anon public key)
-- ─────────────────────────────────────────────────────────────
