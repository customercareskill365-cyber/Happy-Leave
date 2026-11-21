import { getPool } from './_lib/db.js';
import { hashPin } from './_lib/crypto.js';
import {
  auditLog,
  generateTempPassword,
  getSessionUser,
  isMasterAdmin,
  isSupervisorOrAdmin,
  revokeEmployeeSessions,
  validateEmployeeIdFormat,
  validatePasswordFormat,
} from './_lib/auth.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

export default withHandler(async (event) => {
  const methodErr = requireMethod(event, ['GET', 'POST', 'PATCH']);
  if (methodErr) return methodErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }
  if (!isSupervisorOrAdmin(user)) {
    return jsonResponse(403, { error: 'Supervisor or Master Admin access required.' });
  }
  if (user.mustChangePin) {
    return jsonResponse(403, { error: 'Please change your initial password first.' });
  }

  const admin = isMasterAdmin(user);
  const method = event.httpMethod.toUpperCase();

  if (method === 'GET') {
    const roleFilter = event.queryStringParameters?.role;
    let whereClause = "WHERE e.role IN ('employee', 'supervisor')";
    const params = [];

    if (!admin) {
      // Supervisors can only view Employee accounts (never Supervisors or Master Admin).
      whereClause = "WHERE e.role = 'employee'";
    } else if (roleFilter === 'employee' || roleFilter === 'supervisor') {
      whereClause = 'WHERE e.role = $1';
      params.push(roleFilter);
    }

    const { rows } = await pool.query(
      `SELECT e.id,
              e.full_name,
              e.employee_id,
              e.role,
              e.is_active,
              e.must_change_pin,
              e.last_login_at,
              e.created_at,
              e.updated_at,
              c.employee_id AS created_by_id
       FROM employees e
       LEFT JOIN employees c ON c.id = e.created_by
       ${whereClause}
       ORDER BY e.is_active DESC, e.role DESC, e.full_name ASC`,
      params,
    );

    return jsonResponse(200, {
      employees: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        employeeId: r.employee_id,
        role: r.role,
        isActive: r.is_active,
        mustChangePin: r.must_change_pin,
        lastLoginAt: r.last_login_at,
        createdById: r.created_by_id,
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
    const role = typeof body.role === 'string' ? body.role.trim() : 'employee';
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
    const generate = Boolean(body.generatePassword);
    const rawPassword = generate
      ? generateTempPassword(10)
      : (typeof body.initialPassword === 'string' ? body.initialPassword.trim() : typeof body.initialPin === 'string' ? body.initialPin.trim() : '');

    if (role === 'master_admin') {
      return jsonResponse(403, { error: 'Master Admin accounts cannot be created here.' });
    }
    if (!admin && role !== 'employee') {
      return jsonResponse(403, { error: 'Only the Master Admin can create Supervisor accounts.' });
    }
    if (role !== 'employee' && role !== 'supervisor') {
      return jsonResponse(400, { error: 'Role must be employee or supervisor.' });
    }
    if (!fullName || fullName.length > 100) {
      return jsonResponse(400, { error: 'Full name is required (max 100 characters).' });
    }
    const idErr = validateEmployeeIdFormat(employeeId);
    if (idErr) return jsonResponse(400, { error: idErr });
    const passErr = validatePasswordFormat(rawPassword);
    if (passErr) return jsonResponse(400, { error: passErr });

    const pinHash = await hashPin(rawPassword);
    try {
      const { rows } = await pool.query(
        `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin, created_by)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         RETURNING id, full_name, employee_id, role, is_active, must_change_pin, created_at`,
        [fullName, employeeId, role, pinHash, isActive, user.id],
      );
      await auditLog(pool, {
        actorId: user.id,
        action: role === 'supervisor' ? 'supervisor_created' : 'employee_created',
        targetId: rows[0].id,
        metadata: { employeeId, role, isActive },
      });
      return jsonResponse(201, {
        employee: {
          id: rows[0].id,
          fullName: rows[0].full_name,
          employeeId: rows[0].employee_id,
          role: rows[0].role,
          isActive: rows[0].is_active,
          mustChangePin: rows[0].must_change_pin,
          createdAt: rows[0].created_at,
        },
        temporaryPassword: rawPassword,
      });
    } catch (err) {
      if (err.code === '23505') {
        return jsonResponse(409, { error: `User ID ${employeeId} already exists.` });
      }
      throw err;
    }
  }

  // PATCH: edit | reset_pin | deactivate | reactivate
  const targetId = typeof body.id === 'string' ? body.id.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!targetId || !action) {
    return jsonResponse(400, { error: 'Account id and action are required.' });
  }

  const { rows: existingRows } = await pool.query(
    'SELECT id, employee_id, role, is_active FROM employees WHERE id = $1',
    [targetId],
  );
  if (existingRows.length === 0) {
    return jsonResponse(404, { error: 'Account not found.' });
  }
  const target = existingRows[0];

  if (target.role === 'master_admin') {
    return jsonResponse(403, { error: 'Master Admin account cannot be modified through this endpoint.' });
  }
  if (!admin && target.role !== 'employee') {
    return jsonResponse(403, { error: 'Supervisors can only manage Employee accounts.' });
  }

  if (action === 'edit') {
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : target.role;

    if (!fullName || fullName.length > 100) {
      return jsonResponse(400, { error: 'Full name is required (max 100 characters).' });
    }
    const idErr = validateEmployeeIdFormat(employeeId);
    if (idErr) return jsonResponse(400, { error: idErr });
    if (role === 'master_admin') {
      return jsonResponse(403, { error: 'Cannot assign Master Admin role.' });
    }
    if (!admin && role !== 'employee') {
      return jsonResponse(403, { error: 'Supervisors cannot change account roles.' });
    }
    if (role !== 'employee' && role !== 'supervisor') {
      return jsonResponse(400, { error: 'Role must be employee or supervisor.' });
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
        action: target.role === 'supervisor' ? 'supervisor_updated' : 'employee_updated',
        targetId: target.id,
        metadata: { employeeId, role },
      });
      return jsonResponse(200, { ok: true });
    } catch (err) {
      if (err.code === '23505') {
        return jsonResponse(409, { error: `User ID ${employeeId} already exists.` });
      }
      throw err;
    }
  }

  if (action === 'reset_pin' || action === 'reset_password') {
    const generate = Boolean(body.generatePassword);
    const newSecret = generate
      ? generateTempPassword(10)
      : (typeof body.newPassword === 'string' ? body.newPassword.trim() : typeof body.newPin === 'string' ? body.newPin.trim() : '');
    const passErr = validatePasswordFormat(newSecret);
    if (passErr) return jsonResponse(400, { error: passErr });

    const pinHash = await hashPin(newSecret);
    await pool.query(
      `UPDATE employees
       SET pin_hash = $1, must_change_pin = true, failed_login_attempts = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [pinHash, target.id],
    );
    await revokeEmployeeSessions(pool, target.id);
    await auditLog(pool, {
      actorId: user.id,
      action: target.role === 'supervisor' ? 'supervisor_password_reset' : 'password_reset',
      targetId: target.id,
    });
    return jsonResponse(200, { ok: true, temporaryPassword: newSecret });
  }

  if (action === 'deactivate') {
    if (target.id === user.id) {
      return jsonResponse(400, { error: 'You cannot deactivate your own account.' });
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
      action: target.role === 'supervisor' ? 'supervisor_deactivated' : 'employee_deactivated',
      targetId: target.id,
    });
    return jsonResponse(200, { ok: true });
  }

  if (action === 'reactivate') {
    const generate = Boolean(body.generatePassword);
    const newSecret = generate
      ? generateTempPassword(10)
      : (typeof body.newPassword === 'string' ? body.newPassword.trim() : typeof body.newPin === 'string' ? body.newPin.trim() : '');
    const passErr = validatePasswordFormat(newSecret);
    if (passErr) {
      return jsonResponse(400, { error: 'A valid temporary password/PIN is required to reactivate an account.' });
    }
    const pinHash = await hashPin(newSecret);
    await pool.query(
      `UPDATE employees
       SET is_active = true, pin_hash = $1, must_change_pin = true, failed_login_attempts = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [pinHash, target.id],
    );
    await auditLog(pool, {
      actorId: user.id,
      action: target.role === 'supervisor' ? 'supervisor_reactivated' : 'employee_reactivated',
      targetId: target.id,
    });
    return jsonResponse(200, { ok: true, temporaryPassword: newSecret });
  }

  return jsonResponse(400, { error: 'Unsupported action.' });
});
