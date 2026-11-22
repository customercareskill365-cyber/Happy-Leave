import pg from 'pg';
import { getConnectionString } from '@netlify/database';

let pool;
let activeConnectionString = '';
let schemaInitializedFor = '';
let schemaPromise = null;

export class DbUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbUnavailableError';
    this.statusCode = 503;
  }
}

const IDEMPOTENT_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  employee_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  must_change_pin BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check CHECK (role IN ('employee', 'supervisor', 'master_admin'));
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_master_admin ON employees (role) WHERE role = 'master_admin';

CREATE TABLE IF NOT EXISTS daily_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  availability_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('office', 'wfh', 'leave')),
  leave_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, availability_date),
  CHECK (status <> 'leave' OR (leave_reason IS NOT NULL AND length(trim(leave_reason)) > 0))
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES ('system', '{"initialSetupCompleted": false, "allowPasskeys": true, "appTitle": "Team Leave Manager"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_daily_availability_date ON daily_availability(availability_date);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_emp ON passkey_credentials(employee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_emp ON webauthn_challenges(employee_id, kind);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
`;

export function getEnvVar(name) {
  try {
    if (typeof globalThis.Netlify !== 'undefined' && globalThis.Netlify?.env?.get) {
      const val = globalThis.Netlify.env.get(name);
      if (val) return val;
    }
  } catch {
    // Fallback to process.env
  }
  return process.env[name] || '';
}

export function resolveConnectionString() {
  try {
    const netlifyUrl = getConnectionString();
    if (netlifyUrl) return netlifyUrl;
  } catch {
    // Not resolved via @netlify/database; check runtime environment variables.
  }
  return (
    getEnvVar('NETLIFY_DB_URL') ||
    getEnvVar('DATABASE_URL') ||
    getEnvVar('NETLIFY_DATABASE_URL') ||
    ''
  );
}

export function isIsolatedNonProductionEnv(connectionString = resolveConnectionString()) {
  const context = (getEnvVar('CONTEXT') || '').toLowerCase();
  if (context === 'production') {
    return false;
  }
  if (context === 'deploy-preview' || context === 'branch-deploy' || context === 'dev') {
    return true;
  }
  if (connectionString.includes('localhost') || connectionString.includes('127.0.0.1')) {
    return true;
  }
  return getEnvVar('ALLOW_AUTO_SCHEMA_MIGRATION') === 'true';
}

export function normalizePgConnectionConfig(rawConnectionString) {
  const isLocal = rawConnectionString.includes('localhost') || rawConnectionString.includes('127.0.0.1');
  if (isLocal) {
    return { connectionString: rawConnectionString, ssl: false };
  }
  try {
    const u = new URL(rawConnectionString);
    // Strip sslmode from URL so pg-connection-string does not override explicit ssl config
    u.searchParams.delete('sslmode');
    return {
      connectionString: u.toString(),
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return {
      connectionString: rawConnectionString,
      ssl: { rejectUnauthorized: false },
    };
  }
}

export function getPool() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new DbUnavailableError(
      'Database is not configured. Provision Netlify Database (NETLIFY_DB_URL) or set DATABASE_URL.',
    );
  }

  if (pool && activeConnectionString === connectionString) {
    return pool;
  }

  if (pool) {
    const oldPool = pool;
    oldPool.end().catch(() => {});
  }

  const cfg = normalizePgConnectionConfig(connectionString);
  pool = new pg.Pool({
    ...cfg,
    max: 5,
    idleTimeoutMillis: 10000,
  });
  activeConnectionString = connectionString;

  return pool;
}

export async function ensureSchema(targetPool = getPool()) {
  if (schemaInitializedFor === activeConnectionString) return;

  // Never auto-initialize schema unless non-production database isolation is confirmed
  if (!isIsolatedNonProductionEnv(activeConnectionString)) {
    return;
  }

  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    try {
      const { rows } = await targetPool.query(
        `SELECT to_regclass('public.employees') AS emp_tbl,
                to_regclass('public.app_settings') AS set_tbl`,
      );
      if (!rows[0]?.emp_tbl || !rows[0]?.set_tbl) {
        await targetPool.query(IDEMPOTENT_SCHEMA_SQL);
      }
      schemaInitializedFor = activeConnectionString;
    } finally {
      schemaPromise = null;
    }
  })();

  return schemaPromise;
}
