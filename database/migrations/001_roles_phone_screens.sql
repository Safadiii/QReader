-- Roles (owner / manager / staff), phone sign-in, and the iPad / TV screen links.
-- Run once on an existing database:  psql "$DATABASE_URL" -f database/migrations/001_roles_phone_screens.sql
-- Fresh databases get all of this from database/schema.py (python -m database.init_db).

-- Replace the old two-value role type with the three roles.
ALTER TYPE user_role_enum RENAME TO user_role_enum_old;
CREATE TYPE user_role_enum AS ENUM ('owner', 'manager', 'staff');
ALTER TABLE users ALTER COLUMN role TYPE user_role_enum USING (
  CASE role::text WHEN 'admin' THEN 'owner' WHEN 'cashier' THEN 'staff' ELSE role::text END
)::user_role_enum;
DROP TYPE user_role_enum_old;

-- Phone sign-in. Existing members get a placeholder; set the real one with
-- python -m database.set_phone
ALTER TABLE users ADD COLUMN phone varchar(20);
UPDATE users u SET phone = '+999' || lpad(n.rn::text, 9, '0')
  FROM (SELECT id, row_number() OVER (ORDER BY created_at) AS rn FROM users) n
  WHERE u.id = n.id AND u.phone IS NULL;
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT uq_users_phone UNIQUE (phone);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Links for the iPad and the TV.
ALTER TABLE stores ADD COLUMN display_token varchar(64) UNIQUE;
ALTER TABLE stores ADD COLUMN waiting_token varchar(64) UNIQUE;
