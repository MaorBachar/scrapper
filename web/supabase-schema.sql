-- Supabase Database Schema for Zillow Scraper

-- Runs table: tracks each scraping run
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT UNIQUE NOT NULL,
    zip_codes TEXT[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'listings_completed', 'completed', 'failed')),
    max_listings_per_zip INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Properties table: unique properties (address|listed_date), hash for indexing
CREATE TABLE IF NOT EXISTS properties (
    property_key_hash TEXT PRIMARY KEY,
    property_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_properties_property_key ON properties(property_key);

-- Listings table: stores for-sale listings
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    property_key_hash TEXT REFERENCES properties(property_key_hash),
    zpid TEXT,
    url TEXT NOT NULL,
    address TEXT,
    zipcode TEXT,
    city TEXT,
    state TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    price INTEGER,
    beds DOUBLE PRECISION,
    baths DOUBLE PRECISION,
    sqft INTEGER,
    home_type TEXT,
    architectural_style TEXT,
    days_on_zillow INTEGER,
    agent_name TEXT,
    agent_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sold comps table: stores sold comparable properties
CREATE TABLE IF NOT EXISTS sold_comps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    zpid TEXT,
    url TEXT NOT NULL,
    address TEXT,
    zipcode TEXT,
    city TEXT,
    state TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    sold_price INTEGER,
    sold_date DATE,
    beds DOUBLE PRECISION,
    baths DOUBLE PRECISION,
    sqft INTEGER,
    home_type TEXT,
    architectural_style TEXT,
    distance_miles DOUBLE PRECISION,
    comp_search_window TEXT NOT NULL CHECK (comp_search_window IN ('3mo', '6mo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lifecycle table: tracks status history for for-sale properties
CREATE TABLE IF NOT EXISTS lifecycle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_key_hash TEXT NOT NULL REFERENCES properties(property_key_hash),
    property_key TEXT NOT NULL,
    lifecycle TEXT NOT NULL CHECK (lifecycle IN ('New', 'Sent SMS', 'Waiting for POS', 'Do follow up', 'Other', 'Sold')),
    date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_property_key_hash ON lifecycle(property_key_hash);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_runs_run_id ON runs(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_run_id ON listings(run_id);
CREATE INDEX IF NOT EXISTS idx_listings_property_key_hash ON listings(property_key_hash);
CREATE INDEX IF NOT EXISTS idx_listings_zpid ON listings(zpid);
CREATE INDEX IF NOT EXISTS idx_sold_comps_listing_id ON sold_comps(listing_id);
CREATE INDEX IF NOT EXISTS idx_sold_comps_zpid ON sold_comps(zpid);
