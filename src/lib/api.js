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
  loginPin: (employeeId, pin) =>
    request('/api/auth-login', {
      method: 'POST',
      body: JSON.stringify({ employeeId, pin }),
    }),
  changePin: (currentPin, newPin) =>
    request('/api/auth-change-pin', {
      method: 'POST',
      body: JSON.stringify({ currentPin, newPin }),
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

  // Supervisor endpoints
  getSupervisorDashboard: () => request('/api/supervisor-availability'),
  getEmployees: () => request('/api/supervisor-employees'),
  createEmployee: (payload) =>
    request('/api/supervisor-employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateEmployee: (id, payload) =>
    request('/api/supervisor-employees', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...payload }),
    }),
};
