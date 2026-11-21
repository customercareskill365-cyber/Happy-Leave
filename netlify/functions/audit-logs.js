import { getPool } from './_lib/db.js';
import { getSessionUser, isMasterAdmin, isSupervisorOrAdmin } from './_lib/auth.js';
import { jsonResponse, requireMethod, withHandler } from './_lib/http.js';

export const handler = withHandler(async (event) => {
  const methodErr = requireMethod(event, ['GET']);
  if (methodErr) return methodErr;

  const pool = getPool();
  const user = await getSessionUser(pool, event);
  if (!user) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }
  if (!isSupervisorOrAdmin(user)) {
    return jsonResponse(403, { error: 'Supervisor or Master Admin access required.' });
  }

  const admin = isMasterAdmin(user);
  const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit) || 100, 1), 250);

  // Supervisors see employee & availability logs only (never master_admin or supervisor management logs).
  const filterSql = admin
    ? ''
    : `WHERE (actor.role IS NULL OR actor.role <> 'master_admin')
         AND (target.role IS NULL OR target.role = 'employee')
         AND l.action NOT IN (
           'master_admin_provisioned',
           'supervisor_created',
           'supervisor_updated',
           'supervisor_password_reset',
           'supervisor_deactivated',
           'supervisor_reactivated',
           'settings_updated'
         )`;

  const { rows } = await pool.query(
    `SELECT l.id,
            l.action,
            l.metadata,
            l.created_at,
            actor.employee_id AS actor_id,
            actor.full_name AS actor_name,
            actor.role AS actor_role,
            target.employee_id AS target_id,
            target.full_name AS target_name
     FROM audit_logs l
     LEFT JOIN employees actor ON actor.id = l.actor_employee_id
     LEFT JOIN employees target ON target.id = l.target_employee_id
     ${filterSql}
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [limit],
  );

  return jsonResponse(200, {
    logs: rows.map((r) => ({
      id: r.id,
      action: r.action,
      metadata: r.metadata,
      createdAt: r.created_at,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      targetId: r.target_id,
      targetName: r.target_name,
    })),
  });
});
