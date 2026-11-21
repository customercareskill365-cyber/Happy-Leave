import { getPool } from './_lib/db.js';
import { getSessionUser } from './_lib/auth.js';
import { getIstDateString } from './_lib/ist.js';
import { jsonResponse, requireMethod } from './_lib/http.js';

export async function handler(event) {
  const methodErr = requireMethod(event, ['GET']);
  if (methodErr) return methodErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(200, { user: null });
  }

  const today = getIstDateString();
  const { rows } = await pool.query(
    `SELECT status, updated_at
     FROM daily_availability
     WHERE employee_id = $1 AND availability_date = $2`,
    [user.id, today],
  );

  const todayRow = rows[0] || null;

  return jsonResponse(200, {
    user: {
      id: user.id,
      fullName: user.fullName,
      employeeId: user.employeeId,
      role: user.role,
      mustChangePin: user.mustChangePin,
      todayStatus: todayRow ? todayRow.status : 'not-updated',
      todayUpdatedAt: todayRow ? todayRow.updated_at : null,
    },
  });
}
