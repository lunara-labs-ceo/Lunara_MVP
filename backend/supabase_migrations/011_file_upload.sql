-- ============================================================================
-- Migration 011: File Upload Support
-- ============================================================================

-- Update data_sources type constraint to allow file_upload
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_type_check
    CHECK (type IN ('bigquery', 'postgres', 'redshift', 'snowflake', 'file_upload'));

-- Track file upload history
CREATE TABLE IF NOT EXISTS uploaded_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data_source_id UUID REFERENCES data_sources(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    original_file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('csv')),
    target_schema TEXT NOT NULL DEFAULT 'uploads',
    target_table TEXT NOT NULL,
    row_count INTEGER,
    file_size_bytes BIGINT,
    upload_status TEXT DEFAULT 'pending' CHECK (upload_status IN ('pending', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for uploaded_files (same org-scoped pattern as other tables)
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View uploaded files" ON uploaded_files
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Create uploaded files" ON uploaded_files
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Delete uploaded files" ON uploaded_files
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );
