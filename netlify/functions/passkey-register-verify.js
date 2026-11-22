import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { auditLog, getSessionUser, isPasskeysAllowed } from './_lib/auth.js';
import { getRpAndOrigin, jsonResponse, parseJsonBody, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

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

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  const { rows: chalRows } = await pool.query(
    `DELETE FROM webauthn_challenges
     WHERE employee_id = $1 AND kind = 'registration' AND expires_at > now()
     RETURNING challenge`,
    [user.id],
  );
  if (chalRows.length === 0) {
    return jsonResponse(400, { error: 'Registration challenge expired. Please try again.' });
  }

  const { rpID, origin } = getRpAndOrigin(event);
  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: chalRows[0].challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse(400, { error: 'Passkey verification failed.' });
  }

  const { credential } = verification.registrationInfo;
  await pool.query(
    `INSERT INTO passkey_credentials (employee_id, credential_id, public_key, sign_count, transports)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (credential_id) DO NOTHING`,
    [
      user.id,
      credential.id,
      Buffer.from(credential.publicKey),
      credential.counter || 0,
      JSON.stringify(body.response?.transports || []),
    ],
  );

  await auditLog(pool, {
    actorId: user.id,
    action: 'passkey_registered',
    targetId: user.id,
  });

  return jsonResponse(200, { ok: true });
});
