-- Clerk Auth Migration
-- Changes UUID columns to TEXT to accommodate Clerk's string-based IDs (e.g. user_2abc123, org_2abc123)
-- Run this in your Supabase SQL Editor AFTER backing up any data you want to keep.

-- ============================================================================
-- 1. Drop foreign key constraints referencing auth.users
-- ============================================================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_created_by_fkey;
ALTER TABLE chat_artifacts DROP CONSTRAINT IF EXISTS chat_artifacts_created_by_fkey;
ALTER TABLE semantic_models DROP CONSTRAINT IF EXISTS semantic_models_created_by_fkey;
ALTER TABLE report_sessions DROP CONSTRAINT IF EXISTS report_sessions_created_by_fkey;

-- ============================================================================
-- 2. Change created_by columns from UUID to TEXT
-- ============================================================================

ALTER TABLE projects ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
ALTER TABLE chat_sessions ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;

-- These may or may not exist depending on your schema version
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_artifacts' AND column_name = 'created_by') THEN
        ALTER TABLE chat_artifacts ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'semantic_models' AND column_name = 'created_by') THEN
        ALTER TABLE semantic_models ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_sessions' AND column_name = 'created_by') THEN
        ALTER TABLE report_sessions ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
    END IF;
END $$;

-- ============================================================================
-- 3. Update profiles table for Clerk user IDs
-- ============================================================================

-- Drop existing profiles and recreate with TEXT id
DROP TABLE IF EXISTS profiles CASCADE;

CREATE TABLE profiles (
    id TEXT PRIMARY KEY,              -- Clerk user ID (e.g. user_2abc123)
    email TEXT,
    organization_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service role key)
CREATE POLICY "Service role full access" ON profiles
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. Update organizations table for Clerk org IDs
-- ============================================================================

-- Drop and recreate with TEXT id
DROP TABLE IF EXISTS organizations CASCADE;

CREATE TABLE organizations (
    id TEXT PRIMARY KEY,              -- Clerk org ID (e.g. org_2abc123)
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON organizations
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. Update organization_id column type on dependent tables
-- ============================================================================

ALTER TABLE projects ALTER COLUMN organization_id TYPE TEXT USING organization_id::TEXT;

-- Add foreign key from profiles to organizations
ALTER TABLE profiles ADD CONSTRAINT profiles_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- ============================================================================
-- 6. Update RLS policies to work with service role
-- ============================================================================
-- The backend now uses the Supabase service role key (bypasses RLS).
-- Existing RLS policies using auth.uid() remain as a safety net but won't
-- be the primary auth mechanism. The backend enforces auth via Clerk JWT.

-- Add trigger for updated_at on new tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
