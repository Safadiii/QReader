-- Run once on databases created before this column existed:
--   psql "$DATABASE_URL" -f database/migrations/002_ring_again.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ring_requested_at TIMESTAMPTZ;
