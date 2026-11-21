import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from '../netlify/functions/_lib/crypto.js';
import { getIstDateString } from '../netlify/functions/_lib/ist.js';

test('crypto: hashPin and verifyPin work with salt and reject wrong PIN', async () => {
  const hash1 = await hashPin('5678');
  const hash2 = await hashPin('5678');
  assert.notEqual(hash1, hash2, 'Hashes should use unique random salts');
  assert.equal(await verifyPin('5678', hash1), true);
  assert.equal(await verifyPin('9999', hash1), false);
});

test('ist: getIstDateString rolls over at midnight IST (18:30 UTC)', () => {
  const beforeMidnightIst = new Date('2026-11-20T18:29:59.000Z'); // 23:59:59 IST on Nov 20
  const afterMidnightIst = new Date('2026-11-20T18:30:01.000Z');  // 00:00:01 IST on Nov 21
  assert.equal(getIstDateString(beforeMidnightIst), '2026-11-20');
  assert.equal(getIstDateString(afterMidnightIst), '2026-11-21');
});

const hasDb = Boolean(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

test('integration: full auth, RBAC, availability, employee management & privacy suite', { skip: !hasDb }, async () => {
  const { getPool } = await import('../netlify/functions/_lib/db.js');
  const { handler: loginHandler } = await import('../netlify/functions/auth-login.js');
  const { handler: meHandler } = await import('../netlify/functions/auth-me.js');
  const { handler: changePinHandler } = await import('../netlify/functions/auth-change-pin.js');
  const { handler: logoutHandler } = await import('../netlify/functions/auth-logout.js');
  const { handler: publicAvailHandler } = await import('../netlify/functions/availability-public.js');
  const { handler: updateAvailHandler } = await import('../netlify/functions/availability-update.js');
  const { handler: supAvailHandler } = await import('../netlify/functions/supervisor-availability.js');
  const { handler: supEmpHandler } = await import('../netlify/functions/supervisor-employees.js');

  const pool = getPool();

  // Clean slate for test run
  await pool.query('TRUNCATE TABLE audit_logs, sessions, webauthn_challenges, passkey_credentials, daily_availability, employees RESTART IDENTITY CASCADE');

  // Seed 2 supervisors
  const sup1Hash = await hashPin('1111');
  const sup2Hash = await hashPin('2222');
  await pool.query(
    `INSERT INTO employees (full_name, employee_id, role, pin_hash, is_active, must_change_pin)
     VALUES ('Supervisor One', 'SUP-01', 'supervisor', $1, true, false),
            ('Supervisor Two', 'SUP-02', 'supervisor', $2, true, false)`,
    [sup1Hash, sup2Hash],
  );

  const makeEvent = (method, body = null, cookie = '', extraHeaders = {}) => ({
    httpMethod: method,
    headers: {
      host: 'localhost:8888',
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
  });

  const extractCookie = (res) => {
    const setCookie = res.headers?.['Set-Cookie'] || '';
    return setCookie.split(';')[0];
  };

  // 1. Unauthenticated checks
  const unauthSup = await supAvailHandler(makeEvent('GET'));
  assert.equal(unauthSup.statusCode, 401);
  const unauthUpdate = await updateAvailHandler(makeEvent('POST', { status: 'office' }));
  assert.equal(unauthUpdate.statusCode, 401);

  // 2. Supervisor 1 & 2 login & Employee Management
  const sup1Login = await loginHandler(makeEvent('POST', { employeeId: 'SUP-01', pin: '1111' }));
  assert.equal(sup1Login.statusCode, 200);
  const sup1Cookie = extractCookie(sup1Login);

  const sup2Login = await loginHandler(makeEvent('POST', { employeeId: 'SUP-02', pin: '2222' }));
  assert.equal(sup2Login.statusCode, 200);
  const sup2Cookie = extractCookie(sup2Login);

  // Add Employee A and Employee B
  const addA = await supEmpHandler(
    makeEvent('POST', { fullName: 'Employee A', employeeId: 'EMP-A', initialPin: '4321', role: 'employee' }, sup1Cookie),
  );
  assert.equal(addA.statusCode, 201);

  const addB = await supEmpHandler(
    makeEvent('POST', { fullName: 'Employee B', employeeId: 'EMP-B', initialPin: '5678', role: 'employee' }, sup2Cookie),
  );
  assert.equal(addB.statusCode, 201);

  // Reject duplicate Employee ID
  const dupEmp = await supEmpHandler(
    makeEvent('POST', { fullName: 'Dup', employeeId: 'EMP-A', initialPin: '9999', role: 'employee' }, sup1Cookie),
  );
  assert.equal(dupEmp.statusCode, 409);

  // 3. New day starts with all active accounts as not-updated
  const pubInit = JSON.parse((await publicAvailHandler(makeEvent('GET'))).body);
  assert.equal(pubInit.counts.total, 4);
  assert.equal(pubInit.counts.notUpdated, 4);
  assert.equal(pubInit.counts.office, 0);

  // 4. Employee A logs in, must change PIN first
  const empALogin = await loginHandler(makeEvent('POST', { employeeId: 'EMP-A', pin: '4321' }));
  assert.equal(empALogin.statusCode, 200);
  assert.equal(JSON.parse(empALogin.body).user.mustChangePin, true);
  const empACookie = extractCookie(empALogin);

  // Blocked from updating status until initial PIN is changed
  const blockedUpdate = await updateAvailHandler(makeEvent('POST', { status: 'office' }, empACookie));
  assert.equal(blockedUpdate.statusCode, 403);

  // Change PIN
  const changed = await changePinHandler(makeEvent('POST', { currentPin: '4321', newPin: '7788' }, empACookie));
  assert.equal(changed.statusCode, 200);

  // Employee A tries to access supervisor endpoint -> 403
  const empAccessSup = await supAvailHandler(makeEvent('GET', null, empACookie));
  assert.equal(empAccessSup.statusCode, 403);

  // Employee A updates status to Leave without reason -> 400
  const leaveNoReason = await updateAvailHandler(makeEvent('POST', { status: 'leave', leaveReason: '' }, empACookie));
  assert.equal(leaveNoReason.statusCode, 400);

  // Employee A updates status to Leave WITH reason (and tries to spoof employeeId: 'EMP-B')
  const leaveOk = await updateAvailHandler(
    makeEvent('POST', { employeeId: 'EMP-B', status: 'leave', leaveReason: 'Sick Leave — Fever' }, empACookie),
  );
  assert.equal(leaveOk.statusCode, 200);

  // Public API shows EMP-A as leave, EMP-B still not-updated, and NEVER exposes leaveReason
  const pubAfterLeave = JSON.parse((await publicAvailHandler(makeEvent('GET'))).body);
  const pubEmpA = pubAfterLeave.employees.find((e) => e.employeeId === 'EMP-A');
  const pubEmpB = pubAfterLeave.employees.find((e) => e.employeeId === 'EMP-B');
  assert.equal(pubEmpA.status, 'leave');
  assert.equal('leaveReason' in pubEmpA, false);
  assert.equal(pubEmpB.status, 'not-updated');

  // Supervisor 2 sees EMP-A's confidential leave reason
  const sup2View = JSON.parse((await supAvailHandler(makeEvent('GET', null, sup2Cookie))).body);
  const supEmpA = sup2View.employees.find((e) => e.employeeId === 'EMP-A');
  assert.equal(supEmpA.leaveReason, 'Sick Leave — Fever');

  // Employee A can update status again same day (Office)
  const officeOk = await updateAvailHandler(makeEvent('POST', { status: 'office' }, empACookie));
  assert.equal(officeOk.statusCode, 200);

  // 5. Rate limit / Lockout on Employee B
  for (let i = 0; i < 4; i++) {
    const failRes = await loginHandler(makeEvent('POST', { employeeId: 'EMP-B', pin: '0000' }));
    assert.equal(failRes.statusCode, 401);
  }
  const lockedRes = await loginHandler(makeEvent('POST', { employeeId: 'EMP-B', pin: '0000' }));
  assert.equal(lockedRes.statusCode, 429);

  // 6. Deactivate Employee A -> revokes active session & removes from public dashboard
  const empAUuid = JSON.parse(addA.body).employee.id;
  const deactRes = await supEmpHandler(
    makeEvent('PATCH', { id: empAUuid, action: 'deactivate' }, sup1Cookie),
  );
  assert.equal(deactRes.statusCode, 200);

  const meAfterDeact = JSON.parse((await meHandler(makeEvent('GET', null, empACookie))).body);
  assert.equal(meAfterDeact.user, null);

  const loginAfterDeact = await loginHandler(makeEvent('POST', { employeeId: 'EMP-A', pin: '7788' }));
  assert.equal(loginAfterDeact.statusCode, 403);

  const pubAfterDeact = JSON.parse((await publicAvailHandler(makeEvent('GET'))).body);
  assert.equal(pubAfterDeact.employees.some((e) => e.employeeId === 'EMP-A'), false);

  // 7. Reactivate Employee A with new temp PIN -> must change PIN again
  const reactRes = await supEmpHandler(
    makeEvent('PATCH', { id: empAUuid, action: 'reactivate', newPin: '9090' }, sup1Cookie),
  );
  assert.equal(reactRes.statusCode, 200);

  const loginAfterReact = await loginHandler(makeEvent('POST', { employeeId: 'EMP-A', pin: '9090' }));
  assert.equal(loginAfterReact.statusCode, 200);
  assert.equal(JSON.parse(loginAfterReact.body).user.mustChangePin, true);

  // 8. Yesterday's availability does not carry forward
  const empBUuid = JSON.parse(addB.body).employee.id;
  await pool.query(
    `INSERT INTO daily_availability (employee_id, availability_date, status)
     VALUES ($1, (CURRENT_DATE - INTERVAL '2 days')::date, 'wfh')`,
    [empBUuid],
  );
  const pubYesterdayCheck = JSON.parse((await publicAvailHandler(makeEvent('GET'))).body);
  assert.equal(pubYesterdayCheck.employees.find((e) => e.employeeId === 'EMP-B').status, 'not-updated');

  await logoutHandler(makeEvent('POST', null, sup1Cookie));
  await pool.end();
});
