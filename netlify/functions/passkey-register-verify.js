import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getPool } from './_lib/db.js';
import { auditLog, getSessionUser } from './_lib/auth.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin } from './_lib/http.js';

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

export async function handler(event) {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) return jsonResponse(401, { error: 'Authentication required.' });

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
}
