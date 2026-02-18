-- ============================================
-- Migration: 004_chat_sessions_artifacts.sql
-- Create chat_sessions and chat_artifacts tables
-- ============================================

-- ----------------------------------------
-- chat_sessions: stores chat conversations per project
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'New Chat',
    messages JSONB NOT NULL DEFAULT '[]',
    semantic_model_id UUID REFERENCES semantic_models(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_id ON chat_sessions(project_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View project chat sessions" ON chat_sessions
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Create project chat sessions" ON chat_sessions
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Update project chat sessions" ON chat_sessions
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Delete project chat sessions" ON chat_sessions
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------
-- chat_artifacts: stores saved query results per project
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS chat_artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    sql TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '[]',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_artifacts_project_id ON chat_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_artifacts_session_id ON chat_artifacts(session_id);

ALTER TABLE chat_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View project chat artifacts" ON chat_artifacts
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Create project chat artifacts" ON chat_artifacts
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Update project chat artifacts" ON chat_artifacts
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Delete project chat artifacts" ON chat_artifacts
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );
