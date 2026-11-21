import { getPool } from './_lib/db.js';
import { verifyPin } from './_lib/crypto.js';
import { auditLog, createSession, validateEmployeeIdFormat } from './_lib/auth.js';
import { buildSessionCookie, jsonResponse, parseJsonBody, requireMethod, requireSameOrigin } from './_lib/http.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function handler(event) {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  const rawEmpId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';

  const idErr = validateEmployeeIdFormat(rawEmpId);
  if (idErr || !pin) {
    return jsonResponse(400, { error: 'Employee ID and PIN are required.' });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, full_name, employee_id, role, pin_hash, is_active, must_change_pin, failed_login_attempts, locked_until
     FROM employees
     WHERE employee_id = $1`,
    [rawEmpId],
  );

  if (rows.length === 0) {
    return jsonResponse(401, { error: 'Invalid Employee ID or PIN.' });
  }

  const emp = rows[0];
  if (!emp.is_active) {
    await auditLog(pool, {
      actorId: emp.id,
      action: 'login_failed',
      targetId: emp.id,
      metadata: { reason: 'account_deactivated' },
    });
    return jsonResponse(403, { error: 'This account has been deactivated. Contact a supervisor.' });
  }

  if (emp.locked_until && new Date(emp.locked_until) > new Date()) {
    await auditLog(pool, {
      actorId: emp.id,
      action: 'login_failed',
      targetId: emp.id,
      metadata: { reason: 'account_locked' },
    });
    return jsonResponse(429, {
      error: `Too many failed attempts. Account temporarily locked for ${LOCKOUT_MINUTES} minutes.`,
    });
  }

  const ok = await verifyPin(pin, emp.pin_hash);
  if (!ok) {
    const nextAttempts = (emp.failed_login_attempts || 0) + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;

    await pool.query(
      `UPDATE employees
       SET failed_login_attempts = $1,
           locked_until = CASE WHEN $2 THEN now() + ($3 || ' minutes')::interval ELSE NULL END,
           updated_at = now()
       WHERE id = $4`,
      [nextAttempts, shouldLock, String(LOCKOUT_MINUTES), emp.id],
    );

    await auditLog(pool, {
      actorId: emp.id,
      action: 'login_failed',
      targetId: emp.id,
      metadata: { attempts: nextAttempts, locked: shouldLock },
    });

    if (shouldLock) {
      return jsonResponse(429, {
        error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
      });
    }
    return jsonResponse(401, { error: 'Invalid Employee ID or PIN.' });
  }

  await pool.query(
    `UPDATE employees
     SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [emp.id],
  );

  const token = await createSession(pool, emp.id);
  await auditLog(pool, {
    actorId: emp.id,
    action: 'login_success',
    targetId: emp.id,
    metadata: { method: 'pin', role: emp.role },
  });

  return jsonResponse(
    200,
    {
      user: {
        id: emp.id,
        fullName: emp.full_name,
        employeeId: emp.employee_id,
        role: emp.role,
        mustChangePin: emp.must_change_pin,
      },
    },
    { 'Set-Cookie': buildSessionCookie(token, event) },
  );
}
