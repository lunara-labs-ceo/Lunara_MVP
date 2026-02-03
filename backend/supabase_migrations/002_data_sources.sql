-- ============================================
-- Migration: 002_data_sources.sql
-- Create data_sources table for storing project connections
-- ============================================

-- Create data_sources table
CREATE TABLE IF NOT EXISTS data_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bigquery', 'postgres', 'redshift', 'snowflake')),
    name TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',  -- Stores: gcp_project_id, datasets[], etc. (NOT credentials)
    status TEXT DEFAULT 'connected' CHECK (status IN ('pending', 'connected', 'error')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster project lookups
CREATE INDEX IF NOT EXISTS idx_data_sources_project_id ON data_sources(project_id);

-- Enable RLS
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policy: View data sources for projects in user's organization
CREATE POLICY "View project data sources" ON data_sources
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS Policy: Create data sources for projects in user's organization
CREATE POLICY "Create project data sources" ON data_sources
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS Policy: Update data sources for projects in user's organization
CREATE POLICY "Update project data sources" ON data_sources
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS Policy: Delete data sources for projects in user's organization
CREATE POLICY "Delete project data sources" ON data_sources
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_data_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_data_sources_updated_at ON data_sources;
CREATE TRIGGER update_data_sources_updated_at
    BEFORE UPDATE ON data_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_data_sources_updated_at();
