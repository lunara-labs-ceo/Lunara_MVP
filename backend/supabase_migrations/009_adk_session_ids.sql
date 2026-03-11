-- ============================================
-- Migration: 009_adk_session_ids.sql
-- Add ADK session ID columns to chat_sessions and report_sessions
-- for native ADK session persistence (replaces SQLite lunara.db).
-- ============================================

-- chat_sessions: store the ADK-generated session ID
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS adk_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_adk_session_id
    ON chat_sessions(adk_session_id)
    WHERE adk_session_id IS NOT NULL;

-- report_sessions: store the ADK-generated session ID for multi-turn reports
ALTER TABLE report_sessions
    ADD COLUMN IF NOT EXISTS adk_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_report_sessions_adk_session_id
    ON report_sessions(adk_session_id)
    WHERE adk_session_id IS NOT NULL;
