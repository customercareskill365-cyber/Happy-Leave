import { getPool } from './_lib/db.js';
import { sha256Hex } from './_lib/crypto.js';
import { clearSessionCookie, getSessionCookie, jsonResponse, requireMethod, requireSameOrigin } from './_lib/http.js';

export async function handler(event) {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const rawToken = getSessionCookie(event);
  if (rawToken) {
    const pool = getPool();
    await pool.query('DELETE FROM sessions WHERE id = $1', [sha256Hex(rawToken)]).catch(() => {});
  }

  return jsonResponse(200, { ok: true }, { 'Set-Cookie': clearSessionCookie(event) });
}
