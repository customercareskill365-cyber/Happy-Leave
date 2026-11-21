import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { validateEmployeeIdFormat } from './_lib/auth.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin } from './_lib/http.js';

export async function handler(event) {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim().toUpperCase() : '';
  if (validateEmployeeIdFormat(employeeId)) {
    return jsonResponse(400, { error: 'Valid Employee ID is required.' });
  }

  const pool = getPool();
  const { rows: empRows } = await pool.query(
    'SELECT id, is_active, must_change_pin FROM employees WHERE employee_id = $1',
    [employeeId],
  );
  if (empRows.length === 0 || !empRows[0].is_active) {
    return jsonResponse(404, { error: 'No active passkey found for this Employee ID.' });
  }
  const emp = empRows[0];
  if (emp.must_change_pin) {
    return jsonResponse(403, { error: 'Please sign in with your temporary PIN first.' });
  }

  const { rows: creds } = await pool.query(
    'SELECT credential_id, transports FROM passkey_credentials WHERE employee_id = $1',
    [emp.id],
  );
  if (creds.length === 0) {
    return jsonResponse(404, { error: 'No passkey registered for this Employee ID. Sign in with PIN first.' });
  }

  const hostHeader = event.headers?.host || event.headers?.Host || 'localhost:8888';
  const rpID = hostHeader.split(':')[0];

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({
      id: c.credential_id,
      transports: Array.isArray(c.transports) ? c.transports : [],
    })),
    userVerification: 'preferred',
  });

  await pool.query(
    `DELETE FROM webauthn_challenges WHERE employee_id = $1 AND kind = 'authentication'`,
    [emp.id],
  );
  await pool.query(
    `INSERT INTO webauthn_challenges (employee_id, challenge, kind, expires_at)
     VALUES ($1, $2, 'authentication', now() + interval '5 minutes')`,
    [emp.id, options.challenge],
  );

  return jsonResponse(200, options);
}
