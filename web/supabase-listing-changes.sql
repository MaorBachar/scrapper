-- Migration: Property change tracking via lifecycle
-- Run in Supabase SQL Editor

-- 1. Add listing_status column to listings (tracks current MLS status)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_status TEXT;

-- 2. Expand lifecycle CHECK constraint to include auto-detected statuses
-- Drop old constraint and re-create with additional values
ALTER TABLE lifecycle DROP CONSTRAINT IF EXISTS lifecycle_lifecycle_check;
ALTER TABLE lifecycle ADD CONSTRAINT lifecycle_lifecycle_check
  CHECK (lifecycle IN (
    'New', 'Sent SMS', 'Waiting for POS', 'Do follow up', 'Other', 'Sold',
    'Price Drop', 'Price Increase', 'Pending', 'Contingent', 'Unknown', 'Back on Market'
  ));

-- 3. Add source column to lifecycle (manual vs auto-detected)
ALTER TABLE lifecycle ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- 4. Index for efficient price-drop queries (recent auto entries)
CREATE INDEX IF NOT EXISTS idx_lifecycle_source_created
  ON lifecycle(source, created_at DESC)
  WHERE source = 'auto';

CREATE INDEX IF NOT EXISTS idx_listings_listing_status
  ON listings(listing_status);
