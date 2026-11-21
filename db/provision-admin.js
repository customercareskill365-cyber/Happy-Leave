import pg from 'pg';
import { hashPin } from '../netlify/functions/_lib/crypto.js';
import { validateEmployeeIdFormat, validatePasswordFormat } from '../netlify/functions/_lib/auth.js';
import { normalizePgConnectionConfig, resolveConnectionString } from '../netlify/functions/_lib/db.js';

/**
 * One-time Master Admin provisioning script.
 * Reads MASTER_ADMIN_ID, MASTER_ADMIN_NAME, and MASTER_ADMIN_PASSWORD from env.
 * Refuses to run if initial setup is already completed or a master_admin exists.
 */
async function main() {
  const connectionString = resolveConnectionString();

  if (!connectionString) {
    console.error('Missing NETLIFY_DB_URL or DATABASE_URL.');
    process.exit(1);
  }

  const adminId = (process.env.MASTER_ADMIN_ID || '').trim().toUpperCase();
  const adminName = (process.env.MASTER_ADMIN_NAME || 'Master Admin').trim();
  const adminPassword = process.env.MASTER_ADMIN_PASSWORD || '';

  const idErr = validateEmployeeIdFormat(adminId);
  if (idErr) {
    console.error(`Invalid MASTER_ADMIN_ID: ${idErr}`);
    process.exit(1);
  }
  const passErr = validatePasswordFormat(adminPassword);
  if (passErr) {
    console.error(`Invalid MASTER_ADMIN_PASSWORD: ${passErr}`);
    process.exit(1);
  }

  const pool = new pg.Pool(normalizePgConnectionConfig(connectionString));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingAdmin } = await client.query(
      "SELECT id FROM employees WHERE role = 'master_admin' LIMIT 1",
    );
    if (existingAdmin.length > 0) {
      throw new Error('Master Admin already exists. Initial provisioning is disabled.');
    }

    const { rows: settingsRows } = await client.query(
      "SELECT value FROM app_settings WHERE key = 'system'",
    );
    if (settingsRows[0]?.value?.initialSetupCompleted) {
      throw new Error('Initial setup has already been completed.');
    }

    const passwordHash = await hashPin(adminPassword);
    const { rows: inserted } = await client.query(
      `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
       VALUES ($1, $2, 'master_admin', $3, true, true)
       RETURNING id, employee_id`,
      [adminName, adminId, passwordHash],
    );

    await client.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('system', '{"initialSetupCompleted": true, "allowPasskeys": true, "appTitle": "Team Leave Manager"}'::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = jsonb_set(app_settings.value, '{initialSetupCompleted}', 'true'::jsonb),
           updated_at = now()`,
    );

    await client.query(
      `INSERT INTO audit_logs (actor_employee_id, action, target_employee_id, metadata)
       VALUES ($1, 'master_admin_provisioned', $1, $2::jsonb)`,
      [inserted[0].id, JSON.stringify({ employeeId: inserted[0].employee_id })],
    );

    await client.query('COMMIT');
    console.log(`Master Admin ${inserted[0].employee_id} provisioned. Password change required on first login.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Provisioning aborted:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
