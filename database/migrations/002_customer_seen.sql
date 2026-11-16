-- Run once on databases created before this column existed:
--   psql "$DATABASE_URL" -f database/migrations/002_customer_seen.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_seen_at TIMESTAMPTZ;
