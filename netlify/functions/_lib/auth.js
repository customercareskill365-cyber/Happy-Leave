import crypto from 'node:crypto';
import { generateToken, sha256Hex } from './crypto.js';
import { getSessionCookie } from './http.js';

const SESSION_TTL_HOURS = 12;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    `SELECT e.id, e.full_name, e.employee_id, e.role, e.is_active, e.must_change_pin, e.last_login_at
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
    lastLoginAt: row.last_login_at,
    sessionHash: tokenHash,
  };
}

export async function revokeEmployeeSessions(pool, employeeId, exceptSessionHash = null) {
  if (exceptSessionHash) {
    await pool.query('DELETE FROM sessions WHERE employee_id = $1 AND id <> $2', [employeeId, exceptSessionHash]);
  } else {
    await pool.query('DELETE FROM sessions WHERE employee_id = $1', [employeeId]);
  }
}

export async function revokeEmployeePasskeysAndChallenges(pool, employeeId) {
  await pool.query('DELETE FROM passkey_credentials WHERE employee_id = $1', [employeeId]);
  await pool.query('DELETE FROM webauthn_challenges WHERE employee_id = $1', [employeeId]);
}

export async function isPasskeysAllowed(pool) {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'system'");
  if (rows.length === 0) return true;
  return rows[0].value?.allowPasskeys !== false;
}

export async function auditLog(pool, { actorId = null, action, targetId = null, metadata = {} }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_employee_id, action, target_employee_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorId, action, targetId, JSON.stringify(metadata)],
  );
}

export function validatePasswordFormat(password) {
  if (typeof password !== 'string') return 'Password/PIN is required.';
  const trimmed = password.trim();
  if (trimmed.length < 4 || trimmed.length > 64) {
    return 'Password/PIN must be between 4 and 64 characters.';
  }
  if (/\s/.test(trimmed)) {
    return 'Password/PIN cannot contain spaces.';
  }
  return null;
}

export const validatePinFormat = validatePasswordFormat;

export function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

export function validateEmployeeIdFormat(empId) {
  if (typeof empId !== 'string') return 'User ID is required.';
  const trimmed = empId.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,24}$/.test(trimmed)) {
    return 'User ID must be 2–24 characters (letters, digits, hyphen, underscore).';
  }
  return null;
}

export function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export function isMasterAdmin(user) {
  return user?.role === 'master_admin';
}

export function isSupervisorOrAdmin(user) {
  return user?.role === 'supervisor' || user?.role === 'master_admin';
}
