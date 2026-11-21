import { getPool } from './_lib/db.js';
import { hashPin } from './_lib/crypto.js';
import {
  auditLog,
  getSessionUser,
  revokeEmployeeSessions,
  validateEmployeeIdFormat,
  validatePinFormat,
} from './_lib/auth.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin } from './_lib/http.js';

const VALID_ROLES = new Set(['employee', 'supervisor']);

export async function handler(event) {
  const methodErr = requireMethod(event, ['GET', 'POST', 'PATCH']);
  if (methodErr) return methodErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }
  if (user.role !== 'supervisor') {
    return jsonResponse(403, { error: 'Supervisor access required.' });
  }

  const method = event.httpMethod.toUpperCase();

  if (method === 'GET') {
    const { rows } = await pool.query(
      `SELECT id, full_name, employee_id, role, is_active, must_change_pin, created_at, updated_at
       FROM employees
       ORDER BY is_active DESC, full_name ASC`,
    );
    return jsonResponse(200, {
      employees: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        employeeId: r.employee_id,
        role: r.role,
        isActive: r.is_active,
        mustChangePin: r.must_change_pin,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  }

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  if (method === 'POST') {
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
    const initialPin = typeof body.initialPin === 'string' ? body.initialPin.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : 'employee';

    if (!fullName || fullName.length > 100) {
      return jsonResponse(400, { error: 'Full name is required (max 100 characters).' });
    }
    const idErr = validateEmployeeIdFormat(employeeId);
    if (idErr) return jsonResponse(400, { error: idErr });
    const pinErr = validatePinFormat(initialPin);
    if (pinErr) return jsonResponse(400, { error: pinErr });
    if (!VALID_ROLES.has(role)) {
      return jsonResponse(400, { error: 'Role must be employee or supervisor.' });
    }

    const pinHash = await hashPin(initialPin);
    try {
      const { rows } = await pool.query(
        `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
         VALUES ($1, $2, $3, $4, true, true)
         RETURNING id, full_name, employee_id, role, is_active, must_change_pin`,
        [fullName, employeeId, role, pinHash],
      );
      await auditLog(pool, {
        actorId: user.id,
        action: 'employee_created',
        targetId: rows[0].id,
        metadata: { employeeId, role },
      });
      return jsonResponse(201, { employee: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return jsonResponse(409, { error: `Employee ID ${employeeId} already exists.` });
      }
      throw err;
    }
  }

  // PATCH: edit | reset_pin | deactivate | reactivate
  const targetId = typeof body.id === 'string' ? body.id.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!targetId || !action) {
    return jsonResponse(400, { error: 'Employee id and action are required.' });
  }

  const { rows: existingRows } = await pool.query(
    'SELECT id, employee_id, role, is_active FROM employees WHERE id = $1',
    [targetId],
  );
  if (existingRows.length === 0) {
    return jsonResponse(404, { error: 'Employee not found.' });
  }
  const target = existingRows[0];

  if (action === 'edit') {
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';

    if (!fullName || fullName.length > 100) {
      return jsonResponse(400, { error: 'Full name is required (max 100 characters).' });
    }
    const idErr = validateEmployeeIdFormat(employeeId);
    if (idErr) return jsonResponse(400, { error: idErr });
    if (!VALID_ROLES.has(role)) {
      return jsonResponse(400, { error: 'Role must be employee or supervisor.' });
    }
    if (target.id === user.id && role !== 'supervisor') {
      return jsonResponse(400, { error: 'You cannot remove your own supervisor role.' });
    }

    try {
      await pool.query(
        `UPDATE employees
         SET full_name = $1, employee_id = $2, role = $3, updated_at = now()
         WHERE id = $4`,
        [fullName, employeeId, role, target.id],
      );
      await auditLog(pool, {
        actorId: user.id,
        action: 'employee_updated',
        targetId: target.id,
        metadata: { employeeId, role },
      });
      return jsonResponse(200, { ok: true });
    } catch (err) {
      if (err.code === '23505') {
        return jsonResponse(409, { error: `Employee ID ${employeeId} already exists.` });
      }
      throw err;
    }
  }

  if (action === 'reset_pin') {
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';
    const pinErr = validatePinFormat(newPin);
    if (pinErr) return jsonResponse(400, { error: pinErr });

    const pinHash = await hashPin(newPin);
    await pool.query(
      `UPDATE employees
       SET pin_hash = $1, must_change_pin = true, failed_login_attempts = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [pinHash, target.id],
    );
    await revokeEmployeeSessions(pool, target.id);
    await auditLog(pool, {
      actorId: user.id,
      action: 'pin_reset',
      targetId: target.id,
    });
    return jsonResponse(200, { ok: true });
  }

  if (action === 'deactivate') {
    if (target.id === user.id) {
      return jsonResponse(400, { error: 'You cannot deactivate your own supervisor account.' });
    }
    await pool.query(
      `UPDATE employees
       SET is_active = false, updated_at = now()
       WHERE id = $1`,
      [target.id],
    );
    await revokeEmployeeSessions(pool, target.id);
    await auditLog(pool, {
      actorId: user.id,
      action: 'employee_deactivated',
      targetId: target.id,
    });
    return jsonResponse(200, { ok: true });
  }

  if (action === 'reactivate') {
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';
    const pinErr = validatePinFormat(newPin);
    if (pinErr) {
      return jsonResponse(400, { error: 'A valid temporary PIN is required to reactivate an account.' });
    }
    const pinHash = await hashPin(newPin);
    await pool.query(
      `UPDATE employees
       SET is_active = true, pin_hash = $1, must_change_pin = true, failed_login_attempts = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [pinHash, target.id],
    );
    await auditLog(pool, {
      actorId: user.id,
      action: 'employee_reactivated',
      targetId: target.id,
    });
    return jsonResponse(200, { ok: true });
  }

  return jsonResponse(400, { error: 'Unsupported action.' });
}
