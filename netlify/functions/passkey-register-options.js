import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { getSessionUser, isPasskeysAllowed } from './_lib/auth.js';
import { getRpAndOrigin, jsonResponse, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

export default withHandler(async (event) => {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const pool = getPool();
  if (!(await isPasskeysAllowed(pool))) {
    return jsonResponse(403, { error: 'Passkeys are disabled by the administrator.' });
  }

  const user = await getSessionUser(pool, event);
  if (!user) return jsonResponse(401, { error: 'Authentication required.' });
  if (user.mustChangePin) {
    return jsonResponse(403, { error: 'Change your initial password before registering a passkey.' });
  }

  const { rows: existing } = await pool.query(
    'SELECT credential_id, transports FROM passkey_credentials WHERE employee_id = $1',
    [user.id],
  );

  const { rpName, rpID } = getRpAndOrigin(event);
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
});
