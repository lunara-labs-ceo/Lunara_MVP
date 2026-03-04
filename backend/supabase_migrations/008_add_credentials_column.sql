-- ============================================
-- Migration: 008_add_credentials_column.sql
-- Add encrypted credentials storage to data_sources table
-- ============================================

-- Add credentials_encrypted column to store encrypted connection credentials
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT;

-- Relax the type CHECK constraint to be more extensible
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_type_check
    CHECK (type IN ('postgres', 'bigquery', 'snowflake', 'redshift', 'mysql', 'databricks'));
