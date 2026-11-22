import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { auditLog, createSession, isPasskeysAllowed, validateEmployeeIdFormat } from './_lib/auth.js';
import {
  buildSessionCookie,
  getRpAndOrigin,
  jsonResponse,
  parseJsonBody,
  requireMethod,
  requireSameOrigin,
  withHandler,
} from './_lib/http.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export default withHandler(async (event) => {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const pool = getPool();
  if (!(await isPasskeysAllowed(pool))) {
    return jsonResponse(403, { error: 'Passkeys are disabled by the administrator.' });
  }

  const body = parseJsonBody(event);
  if (!body || !body.assertion) return jsonResponse(400, { error: 'Invalid passkey payload.' });

  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
  if (validateEmployeeIdFormat(employeeId)) {
    return jsonResponse(400, { error: 'Valid User ID is required.' });
  }

  const { rows: empRows } = await pool.query(
    'SELECT id, full_name, employee_id, role, is_active, must_change_pin, failed_login_attempts, locked_until FROM employees WHERE employee_id = $1',
    [employeeId],
  );
  if (empRows.length === 0 || !empRows[0].is_active) {
    return jsonResponse(401, { error: 'Account unavailable.' });
  }
  const emp = empRows[0];
  if (emp.locked_until && new Date(emp.locked_until) > new Date()) {
    return jsonResponse(429, { error: 'Account temporarily locked due to failed login attempts.' });
  }
  if (emp.must_change_pin) {
    return jsonResponse(403, { error: 'Please sign in with your temporary password first.' });
  }

  const { rows: chalRows } = await pool.query(
    `DELETE FROM webauthn_challenges
     WHERE employee_id = $1 AND kind = 'authentication' AND expires_at > now()
     RETURNING challenge`,
    [emp.id],
  );
  if (chalRows.length === 0) {
    return jsonResponse(400, { error: 'Passkey challenge expired. Please try again.' });
  }

  const credentialId = body.assertion.id;
  const { rows: credRows } = await pool.query(
    'SELECT id, credential_id, public_key, sign_count, transports FROM passkey_credentials WHERE employee_id = $1 AND credential_id = $2',
    [emp.id, credentialId],
  );
  if (credRows.length === 0) {
    return jsonResponse(401, { error: 'Passkey not recognized.' });
  }
  const cred = credRows[0];

  const { rpID, origin } = getRpAndOrigin(event);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.assertion,
      expectedChallenge: chalRows[0].challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(cred.public_key),
        counter: Number(cred.sign_count),
        transports: Array.isArray(cred.transports) ? cred.transports : [],
      },
    });
  } catch {
    verification = { verified: false };
  }

  if (!verification?.verified) {
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
      metadata: { method: 'passkey', attempts: nextAttempts, locked: shouldLock },
    });

    if (shouldLock) {
      return jsonResponse(429, {
        error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
      });
    }
    return jsonResponse(401, { error: 'Passkey verification failed.' });
  }

  await pool.query(
    'UPDATE passkey_credentials SET sign_count = $1 WHERE id = $2',
    [verification.authenticationInfo.newCounter, cred.id],
  );
  await pool.query(
    'UPDATE employees SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now() WHERE id = $1',
    [emp.id],
  );

  const token = await createSession(pool, emp.id);
  await auditLog(pool, {
    actorId: emp.id,
    action: 'login_success',
    targetId: emp.id,
    metadata: { method: 'passkey', role: emp.role },
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
});
