-- Run once on databases created before these columns existed:
--   psql "$DATABASE_URL" -f database/migrations/001_scan_and_coming.sql
-- (Fresh databases get them from `python -m database.init_db`.)
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_coming_at TIMESTAMPTZ;
