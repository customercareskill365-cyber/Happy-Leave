-- Reversible rollback for 002_master_admin.sql (only safe if no master_admin rows remain)

DROP TABLE IF EXISTS app_settings;
DROP INDEX IF EXISTS idx_single_master_admin;
ALTER TABLE employees DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE employees DROP COLUMN IF EXISTS created_by;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check CHECK (role IN ('employee', 'supervisor'));
