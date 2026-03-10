-- Migration: Auth & Multi-LLC System
-- Run this in Supabase SQL Editor after the base schema (supabase-schema.sql) exists.

-- ============================================================
-- 1. LLCs table
-- ============================================================
CREATE TABLE IF NOT EXISTS llcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. User profiles (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  openphone_api_key TEXT,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. User <-> LLC memberships with role + approval
-- ============================================================
CREATE TABLE IF NOT EXISTS user_llc_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  llc_id UUID NOT NULL REFERENCES llcs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES user_profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, llc_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON user_llc_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_llc_id ON user_llc_memberships(llc_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON user_llc_memberships(status);

-- ============================================================
-- 4. Add llc_id to existing tables
-- ============================================================
ALTER TABLE runs      ADD COLUMN IF NOT EXISTS llc_id UUID REFERENCES llcs(id);
ALTER TABLE listings  ADD COLUMN IF NOT EXISTS llc_id UUID REFERENCES llcs(id);
ALTER TABLE lifecycle ADD COLUMN IF NOT EXISTS llc_id UUID REFERENCES llcs(id);

CREATE INDEX IF NOT EXISTS idx_runs_llc_id      ON runs(llc_id);
CREATE INDEX IF NOT EXISTS idx_listings_llc_id  ON listings(llc_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_llc_id ON lifecycle(llc_id);

-- ============================================================
-- 5. RLS Policies
-- ============================================================

-- user_profiles: users can read/update their own row; super admins read all
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "user_profiles_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- user_llc_memberships: users see their own memberships; admins see all in their LLC
ALTER TABLE user_llc_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memberships_select_own" ON user_llc_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_llc_memberships m2
      WHERE m2.user_id = auth.uid()
        AND m2.llc_id = user_llc_memberships.llc_id
        AND m2.status = 'approved'
        AND m2.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.is_super_admin = TRUE
    )
  );

-- llcs: anyone authenticated can read (needed for registration LLC lookup)
ALTER TABLE llcs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llcs_select_authenticated" ON llcs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- runs: users can only see their LLC's runs
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runs_select_by_llc" ON runs
  FOR SELECT USING (
    llc_id IS NULL  -- legacy rows without llc_id remain visible during migration
    OR EXISTS (
      SELECT 1 FROM user_llc_memberships m
      WHERE m.user_id = auth.uid()
        AND m.llc_id = runs.llc_id
        AND m.status = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.is_super_admin = TRUE
    )
  );

-- listings: scoped by llc_id via runs relationship
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings_select_by_llc" ON listings
  FOR SELECT USING (
    llc_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_llc_memberships m
      WHERE m.user_id = auth.uid()
        AND m.llc_id = listings.llc_id
        AND m.status = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.is_super_admin = TRUE
    )
  );

-- lifecycle: scoped by llc_id
ALTER TABLE lifecycle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lifecycle_select_by_llc" ON lifecycle
  FOR SELECT USING (
    llc_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_llc_memberships m
      WHERE m.user_id = auth.uid()
        AND m.llc_id = lifecycle.llc_id
        AND m.status = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.is_super_admin = TRUE
    )
  );

CREATE POLICY "lifecycle_insert_by_llc" ON lifecycle
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_llc_memberships m
      WHERE m.user_id = auth.uid()
        AND m.llc_id = lifecycle.llc_id
        AND m.status = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.is_super_admin = TRUE
    )
  );

-- properties: global read (shared dedup table, no LLC scoping needed)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties_select_authenticated" ON properties
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "properties_insert_authenticated" ON properties
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 6. Auto-create user_profile on signup (Supabase DB trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, first_name, last_name, phone_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
