import { generateToken, sha256Hex } from './crypto.js';
import { getSessionCookie } from './http.js';

const SESSION_TTL_HOURS = 12;

export async function createSession(pool, employeeId) {
  const rawToken = generateToken(32);
  const tokenHash = sha256Hex(rawToken);
  await pool.query(
    `INSERT INTO sessions (id, employee_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [tokenHash, employeeId, String(SESSION_TTL_HOURS)],
  );
  return rawToken;
}

export async function getSessionUser(pool, event) {
  const rawToken = getSessionCookie(event);
  if (!rawToken) return null;

  const tokenHash = sha256Hex(rawToken);
  const { rows } = await pool.query(
    `SELECT e.id, e.full_name, e.employee_id, e.role, e.is_active, e.must_change_pin
     FROM sessions s
     JOIN employees e ON e.id = s.employee_id
     WHERE s.id = $1 AND s.expires_at > now() AND e.is_active = true`,
    [tokenHash],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    fullName: row.full_name,
    employeeId: row.employee_id,
    role: row.role,
    isActive: row.is_active,
    mustChangePin: row.must_change_pin,
    sessionHash: tokenHash,
  };
}

export async function revokeEmployeeSessions(pool, employeeId) {
  await pool.query('DELETE FROM sessions WHERE employee_id = $1', [employeeId]);
}

export async function auditLog(pool, { actorId = null, action, targetId = null, metadata = {} }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_employee_id, action, target_employee_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorId, action, targetId, JSON.stringify(metadata)],
  );
}

export function validatePinFormat(pin) {
  if (typeof pin !== 'string') return 'PIN must be a string.';
  const trimmed = pin.trim();
  if (trimmed.length < 4 || trimmed.length > 12) {
    return 'PIN must be between 4 and 12 characters.';
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return 'PIN may only contain letters and digits.';
  }
  return null;
}

export function validateEmployeeIdFormat(empId) {
  if (typeof empId !== 'string') return 'Employee ID is required.';
  const trimmed = empId.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,24}$/.test(trimmed)) {
    return 'Employee ID must be 2–24 characters (letters, digits, hyphen, underscore).';
  }
  return null;
}
