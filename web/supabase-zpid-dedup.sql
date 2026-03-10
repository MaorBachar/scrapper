-- Migration: ZPID-based property dedup + auto lifecycle separation
-- Run in Supabase SQL Editor BEFORE deploying code changes.

-- 1. Add zpid column to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zpid TEXT;

-- 2. Backfill zpid from listings (pick any zpid for each hash)
UPDATE properties p
SET zpid = sub.zpid
FROM (
  SELECT DISTINCT ON (property_key_hash) property_key_hash, zpid
  FROM listings
  WHERE zpid IS NOT NULL AND zpid != ''
  ORDER BY property_key_hash, created_at DESC
) sub
WHERE p.property_key_hash = sub.property_key_hash
  AND p.zpid IS NULL;

-- 3. Index on zpid (not unique yet — duplicates need merging first via backfill script)
CREATE INDEX IF NOT EXISTS idx_properties_zpid ON properties(zpid);

-- 4. Unique index on (zpid, llc_id) for listings to support upsert
--    (prevents duplicate listings for same property within same LLC)
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_zpid_llc
  ON listings(zpid, llc_id)
  WHERE zpid IS NOT NULL;

-- 5. Allow llc_id = NULL in lifecycle for property-level auto entries
--    (already nullable from migration, but update RLS to allow reading)

-- 6. Update lifecycle RLS: allow reading auto entries (llc_id IS NULL)
--    for any property the user's LLC has listings for
DROP POLICY IF EXISTS "lifecycle_select_by_llc" ON lifecycle;
CREATE POLICY "lifecycle_select_by_llc" ON lifecycle
  FOR SELECT USING (
    -- Legacy rows without llc_id
    llc_id IS NULL AND source = 'auto' AND EXISTS (
      SELECT 1 FROM listings l
      JOIN user_llc_memberships m ON m.llc_id = l.llc_id AND m.user_id = auth.uid() AND m.status = 'approved'
      WHERE l.property_key_hash = lifecycle.property_key_hash
    )
    -- LLC-specific entries (manual or old auto)
    OR EXISTS (
      SELECT 1 FROM user_llc_memberships m
      WHERE m.user_id = auth.uid()
        AND m.llc_id = lifecycle.llc_id
        AND m.status = 'approved'
    )
    -- Super admin sees all
    OR EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.is_super_admin = TRUE
    )
  );
