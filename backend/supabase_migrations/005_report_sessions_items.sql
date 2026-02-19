-- ============================================
-- Migration: 005_report_sessions_items.sql
-- Create report_sessions and report_items tables
-- ============================================

-- ----------------------------------------
-- report_sessions: stores reports per project
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS report_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Untitled Report',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_sessions_project_id ON report_sessions(project_id);

ALTER TABLE report_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View project report sessions" ON report_sessions
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Create project report sessions" ON report_sessions
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Update project report sessions" ON report_sessions
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Delete project report sessions" ON report_sessions
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

DROP TRIGGER IF EXISTS update_report_sessions_updated_at ON report_sessions;
CREATE TRIGGER update_report_sessions_updated_at
    BEFORE UPDATE ON report_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------
-- report_items: content sections within a report
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS report_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID REFERENCES report_sessions(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL DEFAULT 'html',
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_items_report_id ON report_items(report_id);

ALTER TABLE report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View report items" ON report_items
    FOR SELECT USING (
        report_id IN (
            SELECT rs.id FROM report_sessions rs
            JOIN projects p ON rs.project_id = p.id
            WHERE p.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Create report items" ON report_items
    FOR INSERT WITH CHECK (
        report_id IN (
            SELECT rs.id FROM report_sessions rs
            JOIN projects p ON rs.project_id = p.id
            WHERE p.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Update report items" ON report_items
    FOR UPDATE USING (
        report_id IN (
            SELECT rs.id FROM report_sessions rs
            JOIN projects p ON rs.project_id = p.id
            WHERE p.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Delete report items" ON report_items
    FOR DELETE USING (
        report_id IN (
            SELECT rs.id FROM report_sessions rs
            JOIN projects p ON rs.project_id = p.id
            WHERE p.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );
