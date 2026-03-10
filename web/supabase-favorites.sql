-- Migration: Favorite ZIP Codes per LLC
-- Run in Supabase SQL Editor after supabase-migration-auth.sql

CREATE TABLE IF NOT EXISTS llc_favorite_zipcodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  llc_id          UUID NOT NULL REFERENCES llcs(id) ON DELETE CASCADE,
  zipcode         TEXT NOT NULL,
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_scraped_at TIMESTAMPTZ,
  UNIQUE(llc_id, zipcode)
);

-- Add column if table already exists
ALTER TABLE llc_favorite_zipcodes ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fav_zipcodes_llc_id ON llc_favorite_zipcodes(llc_id);

ALTER TABLE llc_favorite_zipcodes ENABLE ROW LEVEL SECURITY;
