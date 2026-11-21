import { getPool } from './_lib/db.js';
import { auditLog, getSessionUser, isMasterAdmin } from './_lib/auth.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

export default withHandler(async (event) => {
  const methodErr = requireMethod(event, ['GET', 'PATCH']);
  if (methodErr) return methodErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }
  if (!isMasterAdmin(user)) {
    return jsonResponse(403, { error: 'Master Admin access required.' });
  }
  if (user.mustChangePin) {
    return jsonResponse(403, { error: 'Please change your initial password first.' });
  }

  const method = event.httpMethod.toUpperCase();

  if (method === 'GET') {
    const { rows } = await pool.query(
      "SELECT value, updated_at FROM app_settings WHERE key = 'system'",
    );
    const val = rows[0]?.value || { initialSetupCompleted: true, allowPasskeys: true, appTitle: 'Team Leave Manager' };
    return jsonResponse(200, {
      settings: {
        initialSetupCompleted: Boolean(val.initialSetupCompleted),
        allowPasskeys: val.allowPasskeys !== false,
        appTitle: val.appTitle || 'Team Leave Manager',
        updatedAt: rows[0]?.updated_at || null,
      },
    });
  }

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  const allowPasskeys = body.allowPasskeys !== undefined ? Boolean(body.allowPasskeys) : undefined;
  const appTitle = typeof body.appTitle === 'string' ? body.appTitle.trim().slice(0, 60) : undefined;

  const { rows: curRows } = await pool.query("SELECT value FROM app_settings WHERE key = 'system'");
  const current = curRows[0]?.value || { initialSetupCompleted: true, allowPasskeys: true, appTitle: 'Team Leave Manager' };

  const updated = {
    ...current,
    initialSetupCompleted: true, // Never allow disabling setup lock once provisioned
    ...(allowPasskeys !== undefined ? { allowPasskeys } : {}),
    ...(appTitle ? { appTitle } : {}),
  };

  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('system', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(updated)],
  );

  await auditLog(pool, {
    actorId: user.id,
    action: 'settings_updated',
    targetId: user.id,
    metadata: { allowPasskeys: updated.allowPasskeys, appTitle: updated.appTitle },
  });

  return jsonResponse(200, { settings: updated });
});
