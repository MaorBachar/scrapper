CREATE TABLE IF NOT EXISTS llc_opportunity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  llc_id UUID NOT NULL REFERENCES llcs(id) ON DELETE CASCADE,
  pct_below INTEGER NOT NULL DEFAULT 30,
  min_comps INTEGER NOT NULL DEFAULT 2,
  sqft_range INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(llc_id)
);

-- Add sqft_range to existing tables
ALTER TABLE llc_opportunity_settings
  ADD COLUMN IF NOT EXISTS sqft_range INTEGER NOT NULL DEFAULT 20;

-- Add max_distance_miles to existing tables
ALTER TABLE llc_opportunity_settings
  ADD COLUMN IF NOT EXISTS max_distance_miles NUMERIC NOT NULL DEFAULT 0.5;

-- Add max_comp_months to existing tables
ALTER TABLE llc_opportunity_settings
  ADD COLUMN IF NOT EXISTS max_comp_months INTEGER NOT NULL DEFAULT 3;
