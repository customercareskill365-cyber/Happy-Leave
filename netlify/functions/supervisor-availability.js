import { getPool } from './_lib/db.js';
import { getSessionUser, isSupervisorOrAdmin } from './_lib/auth.js';
import { getIstDateString } from './_lib/ist.js';
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

  const availabilityDate = getIstDateString();
  const { rows } = await pool.query(
    `SELECT e.employee_id,
            e.full_name,
            e.role,
            COALESCE(da.status, 'not-updated') AS status,
            da.leave_reason,
            da.updated_at
     FROM employees e
     LEFT JOIN daily_availability da
       ON da.employee_id = e.id AND da.availability_date = $1
     WHERE e.is_active = true AND e.role IN ('employee', 'supervisor')
     ORDER BY
       CASE COALESCE(da.status, 'not-updated')
         WHEN 'leave' THEN 1
         WHEN 'not-updated' THEN 2
         WHEN 'office' THEN 3
         WHEN 'wfh' THEN 4
         ELSE 5
       END,
       e.full_name ASC`,
    [availabilityDate],
  );

  const counts = {
    total: rows.length,
    activeEmployees: 0,
    activeSupervisors: 0,
    office: 0,
    wfh: 0,
    leave: 0,
    notUpdated: 0,
  };

  const employees = rows.map((r) => {
    if (r.role === 'supervisor') counts.activeSupervisors += 1;
    else counts.activeEmployees += 1;

    if (r.status === 'office') counts.office += 1;
    else if (r.status === 'wfh') counts.wfh += 1;
    else if (r.status === 'leave') counts.leave += 1;
    else counts.notUpdated += 1;

    return {
      employeeId: r.employee_id,
      fullName: r.full_name,
      role: r.role,
      status: r.status,
      leaveReason: r.status === 'leave' ? r.leave_reason : null,
      updatedAt: r.updated_at,
    };
  });

  return jsonResponse(200, {
    availabilityDate,
    counts,
    employees,
  });
});
