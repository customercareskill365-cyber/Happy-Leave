import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { getSessionUser } from './_lib/auth.js';
import { jsonResponse, requireMethod, requireSameOrigin } from './_lib/http.js';

function getRpConfig(event) {
  const hostHeader = event.headers?.host || event.headers?.Host || 'localhost:8888';
  const rpID = hostHeader.split(':')[0];
  return { rpName: 'Team Leave Manager', rpID };
}

export async function handler(event) {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) return jsonResponse(401, { error: 'Authentication required.' });
  if (user.mustChangePin) {
    return jsonResponse(403, { error: 'Change your initial PIN before registering a passkey.' });
  }

  const { rows: existing } = await pool.query(
    'SELECT credential_id, transports FROM passkey_credentials WHERE employee_id = $1',
    [user.id],
  );

  const { rpName, rpID } = getRpConfig(event);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.employeeId,
    userDisplayName: user.fullName,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: Array.isArray(c.transports) ? c.transports : [],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await pool.query(
    `DELETE FROM webauthn_challenges WHERE employee_id = $1 AND kind = 'registration'`,
    [user.id],
  );
  await pool.query(
    `INSERT INTO webauthn_challenges (employee_id, challenge, kind, expires_at)
     VALUES ($1, $2, 'registration', now() + interval '5 minutes')`,
    [user.id, options.challenge],
  );

  return jsonResponse(200, options);
}
