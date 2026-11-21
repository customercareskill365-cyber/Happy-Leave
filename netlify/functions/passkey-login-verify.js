import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { auditLog, createSession, validateEmployeeIdFormat } from './_lib/auth.js';
import { buildSessionCookie, jsonResponse, parseJsonBody, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

function getRpAndOrigin(event) {
  const hostHeader = event.headers?.host || event.headers?.Host || 'localhost:8888';
  const rpID = hostHeader.split(':')[0];
  const proto =
    event.headers?.['x-forwarded-proto'] ||
    event.headers?.['X-Forwarded-Proto'] ||
    (rpID === 'localhost' || rpID === '127.0.0.1' ? 'http' : 'https');
  const origin = `${proto}://${hostHeader}`;
  return { rpID, origin };
}

export default withHandler(async (event) => {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const body = parseJsonBody(event);
  if (!body || !body.assertion) return jsonResponse(400, { error: 'Invalid passkey payload.' });

  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
  if (validateEmployeeIdFormat(employeeId)) {
    return jsonResponse(400, { error: 'Valid User ID is required.' });
  }

  const pool = getPool();
  const { rows: empRows } = await pool.query(
    'SELECT id, full_name, employee_id, role, is_active, must_change_pin FROM employees WHERE employee_id = $1',
    [employeeId],
  );
  if (empRows.length === 0 || !empRows[0].is_active) {
    return jsonResponse(401, { error: 'Account unavailable.' });
  }
  const emp = empRows[0];

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
  const verification = await verifyAuthenticationResponse({
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

  if (!verification.verified) {
    await auditLog(pool, {
      actorId: emp.id,
      action: 'login_failed',
      targetId: emp.id,
      metadata: { method: 'passkey' },
    });
    return jsonResponse(401, { error: 'Passkey verification failed.' });
  }

  await pool.query(
    'UPDATE passkey_credentials SET sign_count = $1 WHERE id = $2',
    [verification.authenticationInfo.newCounter, cred.id],
  );
  await pool.query(
    'UPDATE employees SET last_login_at = now(), updated_at = now() WHERE id = $1',
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
