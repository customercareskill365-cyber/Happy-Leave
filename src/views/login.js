import { startAuthentication } from '@simplewebauthn/browser';
import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { formatIstClock, formatIstDate } from '../lib/ist.js';
import { renderIcons } from '../lib/icons.js';

function getRoleRedirect(role, nextParam) {
  if (nextParam && nextParam.startsWith('/')) {
    if (nextParam === '/admin' && role !== 'master_admin') return role === 'supervisor' ? '/supervisor' : '/update';
    if (nextParam === '/supervisor' && role !== 'supervisor' && role !== 'master_admin') return '/update';
    return nextParam;
  }
  if (role === 'master_admin') return '/admin';
  if (role === 'supervisor') return '/supervisor';
  return '/update';
}

export function renderLoginView(state) {
  const { user, loginError = '', loginSuccess = '', loginLoading = false, passkeySupported } = state;

  // Mandatory initial password change screen
  if (user && user.mustChangePin) {
    return `
      <main class="min-h-screen flex items-center justify-center p-4 md:p-6 bg-light-surface">
        <div class="w-full max-w-md flex flex-col gap-6">
          <div class="flex flex-col items-center text-center gap-3">
            <div class="w-12 h-12 rounded-md bg-light-primary text-light-on-primary flex items-center justify-center shadow-sm">
              <i data-lucide="key-round" class="w-6 h-6" aria-hidden="true"></i>
            </div>
            <div>
              <h1 class="font-headline text-headline-lg text-light-on-surface">Change Initial Password</h1>
              <p class="font-body text-body-md text-light-outline mt-1">Signed in as <span class="font-mono">${escapeHtml(user.employeeId)}</span> (${escapeHtml(user.fullName)}). Set a personal password/PIN before continuing.</p>
            </div>
          </div>

          <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-4">
            ${loginError ? `<div role="alert" class="p-3 rounded bg-error-container text-light-on-error-container font-body text-body-sm">${escapeHtml(loginError)}</div>` : ''}
            <form id="forceChangePinForm" class="flex flex-col gap-4">
              <label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">Current Temporary Password / PIN</span>
                <input id="currentPinInput" type="password" required autocomplete="current-password" placeholder="Enter temporary password" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">New Password / PIN (4–64 chars, no spaces)</span>
                <input id="newPinInput" type="password" minlength="4" maxlength="64" required autocomplete="new-password" placeholder="Enter new password" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">Confirm New Password / PIN</span>
                <input id="confirmPinInput" type="password" minlength="4" maxlength="64" required autocomplete="new-password" placeholder="Re-enter new password" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              </label>
              <button type="submit" ${loginLoading ? 'disabled' : ''} class="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 transition-colors duration-state-change">
                <i data-lucide="check-circle-2" class="w-4 h-4" aria-hidden="true"></i>
                <span class="font-label text-label-lg">${loginLoading ? 'Saving...' : 'Save Password & Continue'}</span>
              </button>
            </form>
            <button type="button" data-action="logout" class="text-center font-label text-label-md text-light-on-surface-variant hover:text-light-on-surface py-1">Cancel & Sign Out</button>
          </section>
        </div>
      </main>
    `;
  }

  return `
    <main class="min-h-screen flex items-center justify-center p-4 md:p-6 bg-light-surface">
      <div class="w-full max-w-md flex flex-col gap-6">
        <!-- Brand Header -->
        <div class="flex flex-col items-center text-center gap-3">
          <a href="/" data-link class="w-12 h-12 rounded-md bg-light-primary text-light-on-primary flex items-center justify-center shadow-sm">
            <i data-lucide="calendar-check-2" class="w-6 h-6" aria-hidden="true"></i>
          </a>
          <div>
            <h1 class="font-headline text-headline-lg text-light-on-surface">Team Leave Manager</h1>
            <p class="font-body text-body-md text-light-outline mt-1">Sign in with your assigned User ID & Password</p>
          </div>
        </div>

        <!-- Unified Auth Card (Role determined strictly by backend) -->
        <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-5">
          ${loginError ? `<div role="alert" class="p-3 rounded bg-error-container border border-light-error/30 text-light-on-error-container font-body text-body-sm">${escapeHtml(loginError)}</div>` : ''}
          ${loginSuccess ? `<div role="status" class="p-3 rounded bg-available-container border border-available/30 text-on-available-container font-body text-body-sm">${escapeHtml(loginSuccess)}</div>` : ''}

          <form id="loginPinForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">User ID</span>
              <input id="loginEmployeeId" type="text" required autocomplete="username" placeholder="e.g. EMP-101, SUP-01, or ADM-01" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md uppercase focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">Password / PIN</span>
              <input id="loginPin" type="password" required autocomplete="current-password" maxlength="64" placeholder="Enter your password or PIN" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              <span class="font-body text-body-sm text-light-outline">Accounts are provisioned by administrators. Your workspace is assigned automatically based on your role.</span>
            </label>

            <button type="submit" ${loginLoading ? 'disabled' : ''} class="mt-1 w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 transition-colors duration-state-change">
              <i data-lucide="log-in" class="w-4 h-4" aria-hidden="true"></i>
              <span class="font-label text-label-lg">${loginLoading ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>

          ${
            passkeySupported
              ? `
            <div class="relative flex items-center py-1">
              <div class="flex-grow border-t border-light-outline-variant"></div>
              <span class="px-3 font-label text-label-sm text-light-outline">OR</span>
              <div class="flex-grow border-t border-light-outline-variant"></div>
            </div>
            <button type="button" id="passkeyLoginBtn" ${loginLoading ? 'disabled' : ''} class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface-container-low text-light-on-surface hover:bg-light-surface-container disabled:opacity-60 transition-colors duration-state-change">
              <i data-lucide="fingerprint" class="w-4 h-4 text-light-primary" aria-hidden="true"></i>
              <span class="font-label text-label-md">Sign In with Device Passkey</span>
            </button>
          `
              : ''
          }

          <div class="pt-2 border-t border-light-outline-variant flex items-center justify-between">
            <a href="/" data-link class="inline-flex items-center gap-1.5 font-label text-label-md text-light-primary hover:underline">
              <i data-lucide="arrow-left" class="w-4 h-4" aria-hidden="true"></i>
              Back to Public Dashboard
            </a>
          </div>
        </section>

        <p class="text-center font-mono text-mono-sm text-light-outline tabular-nums">
          ${escapeHtml(formatIstDate())} • ${escapeHtml(formatIstClock())}
        </p>
      </div>
    </main>
  `;
}

export function bindLoginEvents(root, state, { navigate, refreshSession, refreshPublic, onStateChange }) {
  const pinForm = root.querySelector('#loginPinForm');
  if (pinForm) {
    pinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employeeId = root.querySelector('#loginEmployeeId').value.trim().toUpperCase();
      const password = root.querySelector('#loginPin').value;
      state.loginLoading = true;
      state.loginError = '';
      state.loginSuccess = '';
      onStateChange();

      try {
        const res = await api.login(employeeId, password);
        await refreshSession();
        if (res.user?.mustChangePin) {
          state.loginLoading = false;
          onStateChange();
          return;
        }
        await refreshPublic();
        const params = new URLSearchParams(window.location.search);
        navigate(getRoleRedirect(res.user?.role, params.get('next')));
      } catch (err) {
        state.loginLoading = false;
        state.loginError = err.message || 'Invalid credentials.';
        onStateChange();
      }
    });
  }

  const forceChangeForm = root.querySelector('#forceChangePinForm');
  if (forceChangeForm) {
    forceChangeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = root.querySelector('#currentPinInput').value;
      const newPassword = root.querySelector('#newPinInput').value;
      const confirmPassword = root.querySelector('#confirmPinInput').value;

      if (newPassword !== confirmPassword) {
        state.loginError = 'New password and confirmation do not match.';
        onStateChange();
        return;
      }

      state.loginLoading = true;
      state.loginError = '';
      onStateChange();

      try {
        await api.changePassword(currentPassword, newPassword);
        await refreshSession();
        state.loginLoading = false;
        state.loginSuccess = 'Password updated successfully.';
        navigate(getRoleRedirect(state.user?.role, null));
      } catch (err) {
        state.loginLoading = false;
        state.loginError = err.message || 'Could not update password.';
        onStateChange();
      }
    });
  }

  const passkeyBtn = root.querySelector('#passkeyLoginBtn');
  if (passkeyBtn) {
    passkeyBtn.addEventListener('click', async () => {
      const employeeId = root.querySelector('#loginEmployeeId')?.value.trim().toUpperCase() || '';
      if (!employeeId) {
        state.loginError = 'Enter your User ID first to sign in with your passkey.';
        onStateChange();
        return;
      }
      state.loginLoading = true;
      state.loginError = '';
      onStateChange();

      try {
        const options = await api.getPasskeyLoginOptions(employeeId);
        const assertion = await startAuthentication({ optionsJSON: options });
        const res = await api.verifyPasskeyLogin(employeeId, assertion);
        await refreshSession();
        await refreshPublic();
        state.loginLoading = false;
        navigate(getRoleRedirect(res.user?.role, null));
      } catch (err) {
        state.loginLoading = false;
        state.loginError = err.message || 'Passkey sign-in failed or was cancelled.';
        onStateChange();
      }
    });
  }

  renderIcons(root);
}
