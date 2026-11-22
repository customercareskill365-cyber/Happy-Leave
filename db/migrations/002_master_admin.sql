-- Additive, non-destructive migration for Master Admin, Supervisor tracking, and App Settings

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check CHECK (role IN ('employee', 'supervisor', 'master_admin'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_master_admin ON employees (role) WHERE role = 'master_admin';
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_emp ON passkey_credentials(employee_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES ('system', '{"initialSetupCompleted": false, "allowPasskeys": true, "appTitle": "Team Leave Manager"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
