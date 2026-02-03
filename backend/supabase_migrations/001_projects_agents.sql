-- Lunara Projects & Agents Tables
-- Run this in your Supabase SQL Editor

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view projects in their organization
CREATE POLICY "View org projects" ON projects
    FOR SELECT USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- Policy: Users can insert projects in their organization
CREATE POLICY "Create org projects" ON projects
    FOR INSERT WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- Policy: Users can update their org projects
CREATE POLICY "Update org projects" ON projects
    FOR UPDATE USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- Policy: Users can delete their org projects
CREATE POLICY "Delete org projects" ON projects
    FOR DELETE USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    instructions TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view agents in their projects
CREATE POLICY "View project agents" ON agents
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Policy: Users can create agents in their projects
CREATE POLICY "Create project agents" ON agents
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Policy: Users can update agents in their projects
CREATE POLICY "Update project agents" ON agents
    FOR UPDATE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Policy: Users can delete agents in their projects
CREATE POLICY "Delete project agents" ON agents
    FOR DELETE USING (
        project_id IN (
            SELECT id FROM projects 
            WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
    );

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
