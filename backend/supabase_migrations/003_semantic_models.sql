-- ============================================
-- Migration: 003_semantic_models.sql
-- Create semantic_models table for storing generated semantic layers
-- ============================================

-- Create semantic_models table
CREATE TABLE IF NOT EXISTS semantic_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    
    -- The semantic model data (tables, columns, types, relationships)
    model JSONB NOT NULL DEFAULT '{}',
    
    -- Metadata
    source_type TEXT DEFAULT 'bigquery' CHECK (source_type IN ('bigquery', 'postgres', 'redshift', 'snowflake')),
    table_count INTEGER DEFAULT 0,
    
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster project lookups
CREATE INDEX IF NOT EXISTS idx_semantic_models_project_id ON semantic_models(project_id);

-- Enable RLS
ALTER TABLE semantic_models ENABLE ROW LEVEL SECURITY;

-- RLS Policy: View semantic models for projects in user's organization
CREATE POLICY "View project semantic models" ON semantic_models
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS Policy: Create semantic models for projects in user's organization
CREATE POLICY "Create project semantic models" ON semantic_models
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS Policy: Update semantic models for projects in user's organization
CREATE POLICY "Update project semantic models" ON semantic_models
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- RLS Policy: Delete semantic models for projects in user's organization
CREATE POLICY "Delete project semantic models" ON semantic_models
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_semantic_models_updated_at ON semantic_models;
CREATE TRIGGER update_semantic_models_updated_at
    BEFORE UPDATE ON semantic_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
