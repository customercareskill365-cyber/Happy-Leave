import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from '../netlify/functions/_lib/crypto.js';
import { getIstDateString } from '../netlify/functions/_lib/ist.js';

test('crypto: hashPin and verifyPin work with salt and reject wrong password', async () => {
  const hash1 = await hashPin('StrongPass!99');
  const hash2 = await hashPin('StrongPass!99');
  assert.notEqual(hash1, hash2, 'Hashes should use unique random salts');
  assert.equal(await verifyPin('StrongPass!99', hash1), true);
  assert.equal(await verifyPin('WrongPass', hash1), false);
});

test('ist: getIstDateString rolls over at midnight IST (18:30 UTC)', () => {
  const beforeMidnightIst = new Date('2026-11-20T18:29:59.000Z');
  const afterMidnightIst = new Date('2026-11-20T18:30:01.000Z');
  assert.equal(getIstDateString(beforeMidnightIst), '2026-11-20');
  assert.equal(getIstDateString(afterMidnightIst), '2026-11-21');
});

const hasDb = Boolean(process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

test('integration: Master Admin, Supervisor, Employee RBAC, Audit Logs, Security & Functions v2', { skip: !hasDb }, async () => {
  const { getPool } = await import('../netlify/functions/_lib/db.js');
  const { default: loginHandler } = await import('../netlify/functions/auth-login.js');
  const { default: meHandler } = await import('../netlify/functions/auth-me.js');
  const { default: changePinHandler } = await import('../netlify/functions/auth-change-pin.js');
  const { default: logoutHandler } = await import('../netlify/functions/auth-logout.js');
  const { default: publicAvailHandler } = await import('../netlify/functions/availability-public.js');
  const { default: updateAvailHandler } = await import('../netlify/functions/availability-update.js');
  const { default: supAvailHandler } = await import('../netlify/functions/supervisor-availability.js');
  const { default: supEmpHandler } = await import('../netlify/functions/supervisor-employees.js');
  const { default: auditHandler } = await import('../netlify/functions/audit-logs.js');
  const { default: settingsHandler } = await import('../netlify/functions/admin-settings.js');
  const { default: passkeyRegOpts } = await import('../netlify/functions/passkey-register-options.js');
  const { default: passkeyRegVerify } = await import('../netlify/functions/passkey-register-verify.js');
  const { default: passkeyLoginOpts } = await import('../netlify/functions/passkey-login-options.js');
  const { default: passkeyLoginVerify } = await import('../netlify/functions/passkey-login-verify.js');

  const pool = getPool();

  // Clean slate
  await pool.query('TRUNCATE TABLE audit_logs, sessions, webauthn_challenges, passkey_credentials, daily_availability, employees RESTART IDENTITY CASCADE');

  // Seed 1 Master Admin (simulating provision-admin.js)
  const adminHash = await hashPin('AdminInit!1');
  await pool.query(
    `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
     VALUES ('Master Admin', 'ADM-01', 'master_admin', $1, true, true)`,
    [adminHash],
  );

  // Enforce unique master_admin constraint at DB level
  await assert.rejects(
    pool.query(
      `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
       VALUES ('Second Admin', 'ADM-02', 'master_admin', $1, true, true)`,
      [adminHash],
    ),
    /idx_single_master_admin|duplicate key/,
  );

  const makeEvent = (method, body = null, cookie = '', queryStringParameters = {}) => ({
    httpMethod: method,
    headers: {
      host: 'localhost:8888',
      ...(cookie ? { cookie } : {}),
    },
    queryStringParameters,
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  });

  const makeV2Request = (url, method = 'GET', body = null, cookie = '') =>
    new Request(url, {
      method,
      headers: {
        host: 'localhost:8888',
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  const extractCookie = (res) => (res.headers?.['Set-Cookie'] || '').split(';')[0];

  // 0. Test Functions v2 Web Request / Response contract across endpoints
  const v2PubRes = await publicAvailHandler(makeV2Request('http://localhost:8888/api/availability-public', 'GET'));
  assert.equal(v2PubRes instanceof Response, true);
  assert.equal(v2PubRes.status, 200);
  const v2PubBody = await v2PubRes.json();
  assert.equal(typeof v2PubBody.availabilityDate, 'string');

  const v2MeRes = await meHandler(makeV2Request('http://localhost:8888/api/auth-me', 'GET'));
  assert.equal(v2MeRes instanceof Response, true);
  assert.equal(v2MeRes.status, 200);

  // Test all 4 passkey endpoints via Functions v2 Web Request
  const v2PkRegOptsRes = await passkeyRegOpts(makeV2Request('http://localhost:8888/api/passkey-register-options', 'POST'));
  assert.equal(v2PkRegOptsRes.status, 401);
  const v2PkRegVerRes = await passkeyRegVerify(makeV2Request('http://localhost:8888/api/passkey-register-verify', 'POST', {}));
  assert.equal(v2PkRegVerRes.status, 401);
  const v2PkLogOptsRes = await passkeyLoginOpts(makeV2Request('http://localhost:8888/api/passkey-login-options', 'POST', { employeeId: 'EMP-404' }));
  assert.equal(v2PkLogOptsRes.status, 404);
  const v2PkLogVerRes = await passkeyLoginVerify(makeV2Request('http://localhost:8888/api/passkey-login-verify', 'POST', { employeeId: 'EMP-404', assertion: {} }));
  assert.equal(v2PkLogVerRes.status, 401);

  // 1. Unauthenticated checks
  assert.equal((await supAvailHandler(makeEvent('GET'))).statusCode, 401);
  assert.equal((await supEmpHandler(makeEvent('GET'))).statusCode, 401);
  assert.equal((await auditHandler(makeEvent('GET'))).statusCode, 401);
  assert.equal((await settingsHandler(makeEvent('GET'))).statusCode, 401);

  // 2. Master Admin logs in -> forced to change initial password
  const admLogin = await loginHandler(makeEvent('POST', { employeeId: 'ADM-01', password: 'AdminInit!1' }));
  assert.equal(admLogin.statusCode, 200);
  assert.equal(JSON.parse(admLogin.body).user.role, 'master_admin');
  assert.equal(JSON.parse(admLogin.body).user.mustChangePin, true);
  const admCookie = extractCookie(admLogin);

  // Blocked from creating accounts until password changed
  const admBlocked = await supEmpHandler(
    makeEvent('POST', { fullName: 'Sup One', employeeId: 'SUP-01', role: 'supervisor', generatePassword: true }, admCookie),
  );
  assert.equal(admBlocked.statusCode, 403);

  // Change Master Admin password
  const admPwdChange = await changePinHandler(
    makeEvent('POST', { currentPassword: 'AdminInit!1', newPassword: 'AdminStrong!2026' }, admCookie),
  );
  assert.equal(admPwdChange.statusCode, 200);

  // 3. Master Admin creates Supervisor SUP-01 with auto-generated one-time password
  const createSup = await supEmpHandler(
    makeEvent('POST', { fullName: 'Supervisor One', employeeId: 'SUP-01', role: 'supervisor', generatePassword: true }, admCookie),
  );
  assert.equal(createSup.statusCode, 201);
  const supTempPwd = JSON.parse(createSup.body).temporaryPassword;
  assert.ok(supTempPwd && supTempPwd.length >= 10);
  const supUuid = JSON.parse(createSup.body).employee.id;

  // Master Admin cannot create another Master Admin via API
  const createSecondAdm = await supEmpHandler(
    makeEvent('POST', { fullName: 'Fake Admin', employeeId: 'ADM-99', role: 'master_admin', generatePassword: true }, admCookie),
  );
  assert.equal(createSecondAdm.statusCode, 403);

  // 4. Supervisor logs in, changes initial password, creates Employee EMP-101
  const supLogin = await loginHandler(makeEvent('POST', { employeeId: 'SUP-01', password: supTempPwd }));
  assert.equal(supLogin.statusCode, 200);
  const supCookie = extractCookie(supLogin);
  assert.equal(
    (await changePinHandler(makeEvent('POST', { currentPassword: supTempPwd, newPassword: 'SupStrong!2026' }, supCookie))).statusCode,
    200,
  );

  // Supervisor CANNOT create another Supervisor -> 403
  const supCreateSup = await supEmpHandler(
    makeEvent('POST', { fullName: 'Sup Two', employeeId: 'SUP-02', role: 'supervisor', generatePassword: true }, supCookie),
  );
  assert.equal(supCreateSup.statusCode, 403);

  // Supervisor CANNOT access Master Admin settings -> 403
  assert.equal((await settingsHandler(makeEvent('GET', null, supCookie))).statusCode, 403);

  // Supervisor CANNOT list Supervisors or Master Admin
  const supList = JSON.parse((await supEmpHandler(makeEvent('GET', null, supCookie))).body);
  assert.equal(supList.employees.length, 0);

  // Supervisor creates Employee EMP-101
  const createEmp = await supEmpHandler(
    makeEvent('POST', { fullName: 'Ananya Rao', employeeId: 'EMP-101', role: 'employee', generatePassword: true }, supCookie),
  );
  assert.equal(createEmp.statusCode, 201);
  const empTempPwd = JSON.parse(createEmp.body).temporaryPassword;
  const empUuid = JSON.parse(createEmp.body).employee.id;

  // Duplicate User ID rejected -> 409
  const dupEmp = await supEmpHandler(
    makeEvent('POST', { fullName: 'Dup', employeeId: 'EMP-101', role: 'employee', generatePassword: true }, supCookie),
  );
  assert.equal(dupEmp.statusCode, 409);

  // Supervisor CANNOT modify Master Admin
  const admRow = (await pool.query("SELECT id FROM employees WHERE role = 'master_admin'")).rows[0];
  const supTouchAdm = await supEmpHandler(
    makeEvent('PATCH', { id: admRow.id, action: 'deactivate' }, supCookie),
  );
  assert.equal(supTouchAdm.statusCode, 403);

  // Supervisor CANNOT promote an Employee to Supervisor
  const supPromote = await supEmpHandler(
    makeEvent('PATCH', { id: empUuid, action: 'edit', fullName: 'Ananya Rao', employeeId: 'EMP-101', role: 'supervisor' }, supCookie),
  );
  assert.equal(supPromote.statusCode, 403);

  // 5. Employee EMP-101 logs in, changes initial password, updates status to On Leave
  const empLogin = await loginHandler(makeEvent('POST', { employeeId: 'EMP-101', password: empTempPwd }));
  assert.equal(empLogin.statusCode, 200);
  const empCookie = extractCookie(empLogin);
  assert.equal(
    (await changePinHandler(makeEvent('POST', { currentPassword: empTempPwd, newPassword: 'EmpStrong!2026' }, empCookie))).statusCode,
    200,
  );

  // Employee can request passkey registration options once initial password is changed
  const pkOptsOk = await passkeyRegOpts(makeV2Request('http://localhost:8888/api/passkey-register-options', 'POST', null, empCookie));
  assert.equal(pkOptsOk.status, 200);

  // Employee CANNOT access employee management, audit logs, or supervisor availability -> 403
  assert.equal((await supEmpHandler(makeEvent('GET', null, empCookie))).statusCode, 403);
  assert.equal((await auditHandler(makeEvent('GET', null, empCookie))).statusCode, 403);
  assert.equal((await supAvailHandler(makeEvent('GET', null, empCookie))).statusCode, 403);

  // Employee marks On Leave with mandatory reason
  const leaveOk = await updateAvailHandler(
    makeEvent('POST', { status: 'leave', leaveReason: 'Sick Leave — Fever' }, empCookie),
  );
  assert.equal(leaveOk.statusCode, 200);

  // Public API excludes master_admin and never exposes leaveReason
  const pubData = JSON.parse((await publicAvailHandler(makeEvent('GET'))).body);
  assert.equal(pubData.employees.some((e) => e.employeeId === 'ADM-01'), false);
  const pubEmp = pubData.employees.find((e) => e.employeeId === 'EMP-101');
  assert.equal(pubEmp.status, 'leave');
  assert.equal('leaveReason' in pubEmp, false);

  // Master Admin & Supervisor both see confidential leave reason
  const admAvail = JSON.parse((await supAvailHandler(makeEvent('GET', null, admCookie))).body);
  assert.equal(admAvail.counts.activeEmployees, 1);
  assert.equal(admAvail.counts.activeSupervisors, 1);
  assert.equal(admAvail.employees.find((e) => e.employeeId === 'EMP-101').leaveReason, 'Sick Leave — Fever');

  // 6. Master Admin resets Supervisor password, deactivates & reactivates Supervisor
  const resetSup = await supEmpHandler(
    makeEvent('PATCH', { id: supUuid, action: 'reset_password', generatePassword: true }, admCookie),
  );
  assert.equal(resetSup.statusCode, 200);
  assert.ok(JSON.parse(resetSup.body).temporaryPassword);

  // Supervisor's old session was revoked
  assert.equal(JSON.parse((await meHandler(makeEvent('GET', null, supCookie))).body).user, null);

  assert.equal(
    (await supEmpHandler(makeEvent('PATCH', { id: supUuid, action: 'deactivate' }, admCookie))).statusCode,
    200,
  );
  assert.equal(
    (await supEmpHandler(makeEvent('PATCH', { id: supUuid, action: 'reactivate', generatePassword: true }, admCookie))).statusCode,
    200,
  );

  // 7. Audit logs: Master Admin sees supervisor_created; Supervisor does NOT
  const admLogs = JSON.parse((await auditHandler(makeEvent('GET', null, admCookie))).body).logs;
  assert.equal(admLogs.some((l) => l.action === 'supervisor_created'), true);

  // Re-login Supervisor to check scoped audit logs
  const supReactLogin = await loginHandler(makeEvent('POST', { employeeId: 'SUP-01', password: (await (async () => {
    const r = await supEmpHandler(makeEvent('PATCH', { id: supUuid, action: 'reset_password', generatePassword: true }, admCookie));
    return JSON.parse(r.body).temporaryPassword;
  })()) }));
  const supCookie2 = extractCookie(supReactLogin);
  const supLogs = JSON.parse((await auditHandler(makeEvent('GET', null, supCookie2))).body).logs;
  assert.equal(supLogs.some((l) => l.action === 'supervisor_created'), false);
  assert.equal(supLogs.some((l) => l.action === 'employee_created'), true);

  // 8. Master Admin settings update
  const updSettings = await settingsHandler(
    makeEvent('PATCH', { appTitle: 'Contact Centre Leave', allowPasskeys: false }, admCookie),
  );
  assert.equal(updSettings.statusCode, 200);
  assert.equal(JSON.parse(updSettings.body).settings.initialSetupCompleted, true);

  await logoutHandler(makeEvent('POST', null, admCookie));
  await pool.end();
});
