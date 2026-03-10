-- Migration: Lifecycle follow-up date
-- Run in Supabase SQL Editor

ALTER TABLE lifecycle ADD COLUMN IF NOT EXISTS follow_up_date DATE;
