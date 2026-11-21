import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { formatIstClock, formatIstDate } from '../lib/ist.js';
import { renderIcons } from '../lib/icons.js';

export function renderLoginView(state) {
  const { user, loginTab = 'employee', loginError = '', loginSuccess = '', loginLoading = false, passkeySupported } = state;

  // Mandatory PIN change screen
  if (user && user.mustChangePin) {
    return `
      <main class="min-h-screen flex items-center justify-center p-4 md:p-6 bg-light-surface">
        <div class="w-full max-w-md flex flex-col gap-6">
          <div class="flex flex-col items-center text-center gap-3">
            <div class="w-12 h-12 rounded-md bg-light-primary text-light-on-primary flex items-center justify-center shadow-sm">
              <i data-lucide="key-round" class="w-6 h-6" aria-hidden="true"></i>
            </div>
            <div>
              <h1 class="font-headline text-headline-lg text-light-on-surface">Change Initial PIN</h1>
              <p class="font-body text-body-md text-light-outline mt-1">Signed in as <span class="font-mono">${escapeHtml(user.employeeId)}</span> (${escapeHtml(user.fullName)}). Set a personal PIN before continuing.</p>
            </div>
          </div>

          <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-4">
            ${loginError ? `<div role="alert" class="p-3 rounded bg-error-container text-light-on-error-container font-body text-body-sm">${escapeHtml(loginError)}</div>` : ''}
            <form id="forceChangePinForm" class="flex flex-col gap-4">
              <label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">Current Temporary PIN</span>
                <input id="currentPinInput" type="password" inputmode="numeric" required autocomplete="current-password" placeholder="••••" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md tracking-widest focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">New Personal PIN (4–12 digits/chars)</span>
                <input id="newPinInput" type="password" inputmode="numeric" minlength="4" maxlength="12" required autocomplete="new-password" placeholder="Enter new PIN" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md tracking-widest focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">Confirm New PIN</span>
                <input id="confirmPinInput" type="password" inputmode="numeric" minlength="4" maxlength="12" required autocomplete="new-password" placeholder="Re-enter new PIN" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md tracking-widest focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              </label>
              <button type="submit" ${loginLoading ? 'disabled' : ''} class="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 transition-colors duration-state-change">
                <i data-lucide="check-circle-2" class="w-4 h-4" aria-hidden="true"></i>
                <span class="font-label text-label-lg">${loginLoading ? 'Saving PIN...' : 'Save New PIN & Continue'}</span>
              </button>
            </form>
            <button type="button" data-action="logout" class="text-center font-label text-label-md text-light-on-surface-variant hover:text-light-on-surface py-1">Cancel & Sign Out</button>
          </section>
        </div>
      </main>
    `;
  }

  const isSup = loginTab === 'supervisor';
  const tabClass = (active) =>
    active
      ? 'py-2.5 px-3 rounded bg-light-primary text-light-on-primary font-label text-label-md transition-colors duration-state-change'
      : 'py-2.5 px-3 rounded text-light-on-surface-variant hover:text-light-on-surface font-label text-label-md transition-colors duration-state-change';

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
            <p class="font-body text-body-md text-light-outline mt-1">Contact Centre Same-Day Availability Portal</p>
          </div>
        </div>

        <!-- Auth Card -->
        <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-5">
          <div role="tablist" aria-label="Select sign in role" class="grid grid-cols-2 gap-2 p-1 rounded bg-light-surface-container-low border border-light-outline-variant">
            <button type="button" role="tab" data-login-tab="employee" aria-selected="${!isSup}" class="${tabClass(!isSup)}">
              Employee Login
            </button>
            <button type="button" role="tab" data-login-tab="supervisor" aria-selected="${isSup}" class="${tabClass(isSup)}">
              Supervisor Login
            </button>
          </div>

          ${loginError ? `<div role="alert" class="p-3 rounded bg-error-container border border-light-error/30 text-light-on-error-container font-body text-body-sm">${escapeHtml(loginError)}</div>` : ''}
          ${loginSuccess ? `<div role="status" class="p-3 rounded bg-available-container border border-available/30 text-on-available-container font-body text-body-sm">${escapeHtml(loginSuccess)}</div>` : ''}

          <form id="loginPinForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">${isSup ? 'Supervisor ID' : 'Employee ID'}</span>
              <input id="loginEmployeeId" type="text" required autocomplete="username" placeholder="${isSup ? 'e.g. SUP-01' : 'e.g. EMP-101'}" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md uppercase focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">${isSup ? 'Supervisor PIN / Passcode' : 'Employee PIN'}</span>
              <input id="loginPin" type="password" inputmode="numeric" required autocomplete="current-password" maxlength="12" placeholder="••••" class="w-full px-3.5 py-2.5 min-h-[44px] rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-mono text-mono-md tracking-widest focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
              <span class="font-body text-body-sm text-light-outline">
                ${isSup ? 'Separate supervisor credentials required. Includes access to leave reasons & employee management.' : 'Employees see team availability only; leave reasons remain private.'}
              </span>
            </label>

            <button type="submit" ${loginLoading ? 'disabled' : ''} class="mt-1 w-full inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 transition-colors duration-state-change">
              <i data-lucide="${isSup ? 'shield-check' : 'log-in'}" class="w-4 h-4" aria-hidden="true"></i>
              <span class="font-label text-label-lg">${loginLoading ? 'Signing In...' : isSup ? 'Sign In as Supervisor' : 'Sign In as Employee'}</span>
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
  root.querySelectorAll('[data-login-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.loginTab = btn.dataset.loginTab;
      state.loginError = '';
      onStateChange();
    });
  });

  const pinForm = root.querySelector('#loginPinForm');
  if (pinForm) {
    pinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employeeId = root.querySelector('#loginEmployeeId').value.trim().toUpperCase();
      const pin = root.querySelector('#loginPin').value;
      state.loginLoading = true;
      state.loginError = '';
      state.loginSuccess = '';
      onStateChange();

      try {
        const res = await api.loginPin(employeeId, pin);
        await refreshSession();
        if (res.user?.mustChangePin) {
          state.loginLoading = false;
          onStateChange();
          return;
        }
        await refreshPublic();
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        if (next && next.startsWith('/')) {
          navigate(next);
        } else if (res.user?.role === 'supervisor') {
          navigate('/supervisor');
        } else {
          navigate('/update');
        }
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
      const currentPin = root.querySelector('#currentPinInput').value;
      const newPin = root.querySelector('#newPinInput').value;
      const confirmPin = root.querySelector('#confirmPinInput').value;

      if (newPin !== confirmPin) {
        state.loginError = 'New PIN and confirmation do not match.';
        onStateChange();
        return;
      }

      state.loginLoading = true;
      state.loginError = '';
      onStateChange();

      try {
        await api.changePin(currentPin, newPin);
        await refreshSession();
        state.loginLoading = false;
        state.loginSuccess = 'PIN updated successfully.';
        if (state.user?.role === 'supervisor') {
          navigate('/supervisor');
        } else {
          navigate('/update');
        }
      } catch (err) {
        state.loginLoading = false;
        state.loginError = err.message || 'Could not update PIN.';
        onStateChange();
      }
    });
  }

  const passkeyBtn = root.querySelector('#passkeyLoginBtn');
  if (passkeyBtn) {
    passkeyBtn.addEventListener('click', async () => {
      const employeeId = root.querySelector('#loginEmployeeId')?.value.trim().toUpperCase() || '';
      if (!employeeId) {
        state.loginError = 'Enter your Employee ID first to sign in with your passkey.';
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
        if (res.user?.role === 'supervisor') {
          navigate('/supervisor');
        } else {
          navigate('/update');
        }
      } catch (err) {
        state.loginLoading = false;
        state.loginError = err.message || 'Passkey sign-in failed or was cancelled.';
        onStateChange();
      }
    });
  }

  renderIcons(root);
}
