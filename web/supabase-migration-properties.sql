-- Migration: Add properties table with hash-based key and link lifecycle + listings
-- Run this in Supabase SQL Editor after the base schema exists.

-- 1. Create properties table (property_key_hash = SHA256 of "address|YYYY-MM-DD")
CREATE TABLE IF NOT EXISTS properties (
    property_key_hash TEXT PRIMARY KEY,
    property_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_properties_property_key ON properties(property_key);

-- 2. Add property_key_hash to listings (nullable for existing rows; backfill below)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS property_key_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_listings_property_key_hash ON listings(property_key_hash);

-- 3. Add property_key_hash to lifecycle, keep property_key for display
ALTER TABLE lifecycle ADD COLUMN IF NOT EXISTS property_key_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_lifecycle_property_key_hash ON lifecycle(property_key_hash);

-- 4. Backfill: upsert properties from existing lifecycle rows, then set lifecycle.property_key_hash
INSERT INTO properties (property_key_hash, property_key)
SELECT 
    encode(sha256(property_key::bytea), 'hex'),
    property_key
FROM (SELECT DISTINCT property_key FROM lifecycle) AS l
ON CONFLICT (property_key_hash) DO NOTHING;

UPDATE lifecycle SET property_key_hash = encode(sha256(property_key::bytea), 'hex')
WHERE property_key_hash IS NULL;

-- 5. Backfill listings: compute property_key_hash and link to properties
-- Uses UTC for date to match JS getPropertyKey()
WITH listing_keys AS (
    SELECT
        id,
        encode(sha256((
            COALESCE(TRIM(
                CONCAT_WS(', ',
                    NULLIF(TRIM(address), ''),
                    NULLIF(TRIM(city), ''),
                    NULLIF(TRIM(state), ''),
                    NULLIF(TRIM(zipcode), '')
                )
            ), 'unknown') || '|' ||
            TO_CHAR(
                (created_at AT TIME ZONE 'UTC') - (COALESCE(days_on_zillow, 0) || ' days')::interval,
                'YYYY-MM-DD'
            )
        )::bytea), 'hex') AS property_key_hash,
        COALESCE(TRIM(
            CONCAT_WS(', ',
                NULLIF(TRIM(address), ''),
                NULLIF(TRIM(city), ''),
                NULLIF(TRIM(state), ''),
                NULLIF(TRIM(zipcode), '')
            )
        ), 'unknown') || '|' ||
        TO_CHAR(
            (created_at AT TIME ZONE 'UTC') - (COALESCE(days_on_zillow, 0) || ' days')::interval,
            'YYYY-MM-DD'
        ) AS property_key
    FROM listings
    WHERE (address IS NOT NULL OR city IS NOT NULL OR state IS NOT NULL OR zipcode IS NOT NULL)
      AND property_key_hash IS NULL
)
INSERT INTO properties (property_key_hash, property_key)
SELECT DISTINCT property_key_hash, property_key FROM listing_keys
ON CONFLICT (property_key_hash) DO NOTHING;

UPDATE listings l SET property_key_hash = sub.property_key_hash
FROM (
    SELECT
        id,
        encode(sha256((
            COALESCE(TRIM(
                CONCAT_WS(', ',
                    NULLIF(TRIM(address), ''),
                    NULLIF(TRIM(city), ''),
                    NULLIF(TRIM(state), ''),
                    NULLIF(TRIM(zipcode), '')
                )
            ), 'unknown') || '|' ||
            TO_CHAR(
                (created_at AT TIME ZONE 'UTC') - (COALESCE(days_on_zillow, 0) || ' days')::interval,
                'YYYY-MM-DD'
            )
        )::bytea), 'hex') AS property_key_hash
    FROM listings
    WHERE property_key_hash IS NULL
) sub
WHERE l.id = sub.id;

-- 6. Add foreign keys after backfill (skip if already applied)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_listings_property') THEN
    ALTER TABLE listings ADD CONSTRAINT fk_listings_property
      FOREIGN KEY (property_key_hash) REFERENCES properties(property_key_hash);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lifecycle_property') THEN
    ALTER TABLE lifecycle ADD CONSTRAINT fk_lifecycle_property
      FOREIGN KEY (property_key_hash) REFERENCES properties(property_key_hash);
  END IF;
END $$;
