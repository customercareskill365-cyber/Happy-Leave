import { getPool } from './_lib/db.js';
import { hashPin, verifyPin } from './_lib/crypto.js';
import { auditLog, getSessionUser, validatePasswordFormat } from './_lib/auth.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

export default withHandler(async (event) => {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  const currentSecret = typeof body.currentPassword === 'string' ? body.currentPassword : typeof body.currentPin === 'string' ? body.currentPin : '';
  const newSecret = typeof body.newPassword === 'string' ? body.newPassword.trim() : typeof body.newPin === 'string' ? body.newPin.trim() : '';

  const passErr = validatePasswordFormat(newSecret);
  if (passErr) {
    return jsonResponse(400, { error: passErr });
  }
  if (currentSecret === newSecret) {
    return jsonResponse(400, { error: 'New password must be different from your current password.' });
  }

  const { rows } = await pool.query('SELECT pin_hash FROM employees WHERE id = $1', [user.id]);
  if (rows.length === 0) {
    return jsonResponse(404, { error: 'Account not found.' });
  }

  const ok = await verifyPin(currentSecret, rows[0].pin_hash);
  if (!ok) {
    return jsonResponse(401, { error: 'Current password is incorrect.' });
  }

  const newHash = await hashPin(newSecret);
  await pool.query(
    `UPDATE employees
     SET pin_hash = $1, must_change_pin = false, updated_at = now()
     WHERE id = $2`,
    [newHash, user.id],
  );

  await auditLog(pool, {
    actorId: user.id,
    action: 'password_changed',
    targetId: user.id,
  });

  return jsonResponse(200, { ok: true });
});
