export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.code = data.code || 'API_ERROR';
    this.data = data;
  }
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const api = {
  getPublicAvailability: () => request('/api/availability-public'),
  getSession: () => request('/api/auth-me'),
  login: (employeeId, password) =>
    request('/api/auth-login', {
      method: 'POST',
      body: JSON.stringify({ employeeId, password }),
    }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth-change-pin', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  logout: () => request('/api/auth-logout', { method: 'POST' }),

  // Passkeys (WebAuthn)
  getPasskeyRegisterOptions: () => request('/api/passkey-register-options', { method: 'POST' }),
  verifyPasskeyRegister: (attestation) =>
    request('/api/passkey-register-verify', {
      method: 'POST',
      body: JSON.stringify(attestation),
    }),
  getPasskeyLoginOptions: (employeeId) =>
    request('/api/passkey-login-options', {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    }),
  verifyPasskeyLogin: (employeeId, assertion) =>
    request('/api/passkey-login-verify', {
      method: 'POST',
      body: JSON.stringify({ employeeId, assertion }),
    }),

  // Employee self status update
  updateMyStatus: (status, leaveReason) =>
    request('/api/availability-update', {
      method: 'POST',
      body: JSON.stringify({ status, leaveReason }),
    }),

  // Supervisor & Master Admin endpoints
  getSupervisorDashboard: () => request('/api/supervisor-availability'),
  getAccounts: (role) => request(`/api/supervisor-employees${role ? `?role=${encodeURIComponent(role)}` : ''}`),
  createAccount: (payload) =>
    request('/api/supervisor-employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAccount: (id, payload) =>
    request('/api/supervisor-employees', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...payload }),
    }),
  getAuditLogs: (limit = 100) => request(`/api/audit-logs?limit=${limit}`),

  // Master Admin settings
  getAdminSettings: () => request('/api/admin-settings'),
  updateAdminSettings: (payload) =>
    request('/api/admin-settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
