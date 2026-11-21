import { getPool } from './_lib/db.js';
import { auditLog, getSessionUser } from './_lib/auth.js';
import { getIstDateString } from './_lib/ist.js';
import { jsonResponse, parseJsonBody, requireMethod, requireSameOrigin, withHandler } from './_lib/http.js';

const VALID_STATUSES = new Set(['office', 'wfh', 'leave']);

export const handler = withHandler(async (event) => {
  const methodErr = requireMethod(event, ['POST']);
  if (methodErr) return methodErr;

  const originErr = requireSameOrigin(event);
  if (originErr) return originErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }
  if (user.mustChangePin) {
    return jsonResponse(403, { error: 'Please change your initial password before updating your status.' });
  }

  const body = parseJsonBody(event);
  if (!body) return jsonResponse(400, { error: 'Invalid JSON payload.' });

  const status = typeof body.status === 'string' ? body.status.trim() : '';
  if (!VALID_STATUSES.has(status)) {
    return jsonResponse(400, { error: 'Status must be office, wfh, or leave.' });
  }

  let leaveReason = null;
  if (status === 'leave') {
    const rawReason = typeof body.leaveReason === 'string' ? body.leaveReason.trim() : '';
    if (!rawReason) {
      return jsonResponse(400, { error: 'Leave reason is mandatory when selecting On Leave.' });
    }
    if (rawReason.length > 240) {
      return jsonResponse(400, { error: 'Leave reason must be 240 characters or fewer.' });
    }
    leaveReason = rawReason;
  }

  const availabilityDate = getIstDateString();

  // Derive employee identity strictly from authenticated session (user.id).
  const { rows } = await pool.query(
    `INSERT INTO daily_availability (employee_id, availability_date, status, leave_reason, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (employee_id, availability_date)
     DO UPDATE SET status = EXCLUDED.status,
                   leave_reason = EXCLUDED.leave_reason,
                   updated_at = now()
     RETURNING status, availability_date, updated_at`,
    [user.id, availabilityDate, status, leaveReason],
  );

  await auditLog(pool, {
    actorId: user.id,
    action: 'status_updated',
    targetId: user.id,
    metadata: { status, availabilityDate },
  });

  return jsonResponse(200, {
    ok: true,
    availabilityDate,
    status: rows[0].status,
    updatedAt: rows[0].updated_at,
  });
});
