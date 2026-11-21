import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../lib/api.js';
import { escapeHtml, getInitials } from '../lib/escape.js';
import { formatIstTimestamp } from '../lib/ist.js';
import { renderIcons } from '../lib/icons.js';

const CURRENT_BADGE = {
  office: { label: 'Working from Office', badge: 'bg-available-container text-on-available-container', dot: 'bg-available' },
  wfh: { label: 'Working from Home (WFH)', badge: 'bg-light-tertiary-container text-light-on-tertiary-container', dot: 'bg-light-tertiary' },
  leave: { label: 'On Leave', badge: 'bg-leave-container text-on-leave-container', dot: 'bg-leave' },
  'not-updated': { label: 'Not Updated', badge: 'bg-light-surface-container text-light-on-surface-variant', dot: 'bg-light-outline' },
};

const LEAVE_CATEGORIES = ['Sick Leave', 'Personal Work', 'Family Function', 'Emergency'];

export function renderUpdateStatusView(state) {
  const { user, statusForm, passkeySupported } = state;

  if (!user) {
    return `
      <div class="max-w-xl mx-auto w-full bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 md:p-8 shadow-sm flex flex-col items-center text-center gap-4">
        <div class="w-12 h-12 rounded-full bg-light-primary-container text-light-on-primary-container flex items-center justify-center">
          <i data-lucide="lock" class="w-6 h-6" aria-hidden="true"></i>
        </div>
        <div>
          <h2 class="font-headline text-headline-md text-light-on-surface">Employee Verification Required</h2>
          <p class="font-body text-body-md text-light-on-surface-variant mt-1">Sign in with your Employee ID & PIN (or registered Passkey) to update your own daily availability.</p>
        </div>
        <a href="/login?next=/update" data-link class="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
          <i data-lucide="log-in" class="w-4 h-4" aria-hidden="true"></i>
          <span class="font-label text-label-lg">Sign In to Update Status</span>
        </a>
      </div>
    `;
  }

  const currentKey = user.todayStatus || 'not-updated';
  const currentBadge = CURRENT_BADGE[currentKey] || CURRENT_BADGE['not-updated'];
  const selected = statusForm.selectedStatus; // null by default if not-updated!

  const optionCardClass = (key) => {
    const isSelected = selected === key;
    if (key === 'office') {
      return isSelected
        ? 'p-4 md:p-5 rounded-md border-2 border-available bg-available-container/30 text-left flex items-center gap-3.5 cursor-pointer transition-colors duration-state-change'
        : 'p-4 md:p-5 rounded-md border border-light-outline-variant bg-light-surface-container-lowest text-left flex items-center gap-3.5 cursor-pointer hover:bg-available-container/20 transition-colors duration-state-change';
    }
    if (key === 'wfh') {
      return isSelected
        ? 'p-4 md:p-5 rounded-md border-2 border-light-tertiary bg-light-tertiary-container/60 text-left flex items-center gap-3.5 cursor-pointer transition-colors duration-state-change'
        : 'p-4 md:p-5 rounded-md border border-light-outline-variant bg-light-surface-container-lowest text-left flex items-center gap-3.5 cursor-pointer hover:bg-light-tertiary-container/40 transition-colors duration-state-change';
    }
    return isSelected
      ? 'p-4 md:p-5 rounded-md border-2 border-leave bg-leave-container/30 text-left flex items-center gap-3.5 cursor-pointer transition-colors duration-state-change'
      : 'p-4 md:p-5 rounded-md border border-light-outline-variant bg-light-surface-container-lowest text-left flex items-center gap-3.5 cursor-pointer hover:bg-leave-container/20 transition-colors duration-state-change';
  };

  return `
    <div class="max-w-3xl w-full mx-auto flex flex-col gap-5">
      <!-- Employee Identity & Current Status Card -->
      <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 md:p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4 min-w-0">
          <div class="w-12 h-12 rounded-full bg-light-primary-container text-light-on-primary-container flex items-center justify-center shrink-0">
            <span class="font-headline text-headline-md">${escapeHtml(getInitials(user.fullName))}</span>
          </div>
          <div class="min-w-0">
            <h2 class="font-headline text-headline-md text-light-on-surface truncate">${escapeHtml(user.fullName)}</h2>
            <p class="font-mono text-mono-md text-light-on-surface-variant">${escapeHtml(user.employeeId)} • ${user.todayUpdatedAt ? `Updated ${escapeHtml(formatIstTimestamp(user.todayUpdatedAt))}` : 'No update yet today'}</p>
          </div>
        </div>

        <div class="flex flex-col items-start sm:items-end gap-1">
          <span class="font-label text-label-sm text-light-on-surface-variant">Current Status</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${currentBadge.badge}">
            <span class="w-2 h-2 rounded-full ${currentBadge.dot}" aria-hidden="true"></span>
            <span class="font-label text-label-md">${currentBadge.label}</span>
          </span>
        </div>
      </section>

      ${
        statusForm.successMessage
          ? `<div role="status" class="bg-available-container border border-available/40 rounded-md p-4 flex items-start gap-3">
              <i data-lucide="check-circle-2" class="w-5 h-5 text-available shrink-0 mt-0.5" aria-hidden="true"></i>
              <div>
                <p class="font-label text-label-lg text-on-available-container">Status updated for today</p>
                <p class="font-body text-body-sm text-on-available-container">${escapeHtml(statusForm.successMessage)}</p>
              </div>
            </div>`
          : ''
      }

      ${
        statusForm.errorMessage
          ? `<div role="alert" class="bg-error-container border border-light-error/30 rounded-md p-4 flex items-start gap-3">
              <i data-lucide="alert-circle" class="w-5 h-5 text-light-error shrink-0 mt-0.5" aria-hidden="true"></i>
              <p class="font-body text-body-sm text-light-on-error-container">${escapeHtml(statusForm.errorMessage)}</p>
            </div>`
          : ''
      }

      <!-- Status Selection Form (No default Office selection!) -->
      <form id="statusUpdateForm" class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 md:p-6 shadow-sm flex flex-col gap-6">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-headline text-headline-sm text-light-on-surface">Select Today's Work Location or Leave</h3>
            ${!selected ? '<span class="font-label text-label-sm text-warning bg-warning-container px-2.5 py-0.5 rounded-full">Select an option</span>' : ''}
          </div>
          <div class="grid grid-cols-1 gap-3">
            <button type="button" data-select-status="office" class="${optionCardClass('office')}">
              <div class="w-10 h-10 rounded-full ${selected === 'office' ? 'bg-available text-on-available' : 'bg-available-container text-on-available-container'} flex items-center justify-center shrink-0">
                <i data-lucide="building-2" class="w-5 h-5" aria-hidden="true"></i>
              </div>
              <span class="font-headline text-headline-sm text-light-on-surface">Working from Office</span>
            </button>

            <button type="button" data-select-status="wfh" class="${optionCardClass('wfh')}">
              <div class="w-10 h-10 rounded-full ${selected === 'wfh' ? 'bg-light-tertiary text-light-on-tertiary' : 'bg-light-tertiary-container text-light-on-tertiary-container'} flex items-center justify-center shrink-0">
                <i data-lucide="laptop" class="w-5 h-5" aria-hidden="true"></i>
              </div>
              <span class="font-headline text-headline-sm text-light-on-surface">Working from Home (WFH)</span>
            </button>

            <button type="button" data-select-status="leave" class="${optionCardClass('leave')}">
              <div class="w-10 h-10 rounded-full ${selected === 'leave' ? 'bg-leave text-on-leave' : 'bg-leave-container text-on-leave-container'} flex items-center justify-center shrink-0">
                <i data-lucide="calendar-off" class="w-5 h-5" aria-hidden="true"></i>
              </div>
              <span class="font-headline text-headline-sm text-light-on-surface">On Leave</span>
            </button>
          </div>
        </div>

        <!-- Mandatory Leave Reason Section -->
        <div class="${selected === 'leave' ? 'flex' : 'hidden'} flex-col gap-4 pt-4 border-t border-light-outline-variant">
          <div class="flex flex-col gap-1">
            <span class="font-label text-label-lg text-light-on-surface">Leave Reason (Required)</span>
            <p class="font-body text-body-sm text-light-on-surface-variant">Confidential: Accessible only to authenticated supervisors.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${LEAVE_CATEGORIES.map(
              (cat) => `
              <label class="flex items-center gap-3 p-3 rounded border border-light-outline-variant hover:bg-light-surface-container-low cursor-pointer">
                <input type="radio" name="leaveCategory" value="${escapeHtml(cat)}" ${statusForm.leaveCategory === cat ? 'checked' : ''} class="text-light-primary focus:ring-light-primary">
                <span class="font-body text-body-md text-light-on-surface">${escapeHtml(cat)}</span>
              </label>
            `,
            ).join('')}
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="font-label text-label-md text-light-on-surface">Reason Note (Required when On Leave)</span>
            <input id="leaveNoteInput" type="text" maxlength="240" value="${escapeHtml(statusForm.leaveNote)}" placeholder="Enter brief reason for supervisor review..." class="w-full px-3.5 py-2.5 min-h-11 rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-body text-body-md placeholder:text-light-on-surface-variant focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
          </label>
        </div>

        <div class="pt-4 border-t border-light-outline-variant flex flex-wrap items-center justify-between gap-3">
          <span class="font-body text-body-sm text-light-on-surface-variant">Only one status applies per day; you may re-submit anytime today.</span>
          <button type="submit" ${!selected || statusForm.submitting ? 'disabled' : ''} class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 min-h-12 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-50 transition-colors duration-state-change">
            <i data-lucide="send" class="w-4 h-4" aria-hidden="true"></i>
            <span class="font-label text-label-lg">${statusForm.submitting ? 'Submitting...' : 'Submit Status'}</span>
          </button>
        </div>
      </form>

      <!-- Account Security & Device Passkey Card -->
      <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 shadow-sm flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-headline text-headline-sm text-light-on-surface">Account Security</h3>
            <p class="font-body text-body-sm text-light-on-surface-variant">Manage your PIN or register a device passkey for faster sign-in.</p>
          </div>
          ${
            passkeySupported
              ? `<button type="button" id="registerPasskeyBtn" class="inline-flex items-center gap-2 px-4 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface-container-low text-light-on-surface hover:bg-light-surface-container transition-colors duration-state-change">
                  <i data-lucide="fingerprint" class="w-4 h-4 text-light-primary" aria-hidden="true"></i>
                  <span class="font-label text-label-md">Register Passkey</span>
                </button>`
              : ''
          }
        </div>
        ${statusForm.securityMessage ? `<p class="font-body text-body-sm text-on-available-container bg-available-container px-3 py-2 rounded">${escapeHtml(statusForm.securityMessage)}</p>` : ''}
        ${statusForm.securityError ? `<p class="font-body text-body-sm text-light-on-error-container bg-error-container px-3 py-2 rounded">${escapeHtml(statusForm.securityError)}</p>` : ''}
      </section>
    </div>
  `;
}

export function bindUpdateStatusEvents(root, state, { refreshSession, refreshPublic, onStateChange }) {
  root.querySelectorAll('[data-select-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.statusForm.selectedStatus = btn.dataset.selectStatus;
      state.statusForm.errorMessage = '';
      state.statusForm.successMessage = '';
      onStateChange();
    });
  });

  root.querySelectorAll('input[name="leaveCategory"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.statusForm.leaveCategory = e.target.value;
    });
  });

  const noteInput = root.querySelector('#leaveNoteInput');
  if (noteInput) {
    noteInput.addEventListener('input', (e) => {
      state.statusForm.leaveNote = e.target.value;
    });
  }

  const form = root.querySelector('#statusUpdateForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = state.statusForm.selectedStatus;
      if (!status) {
        state.statusForm.errorMessage = 'Please select Working from Office, WFH, or On Leave.';
        onStateChange();
        return;
      }

      let leaveReason = '';
      if (status === 'leave') {
        const cat = state.statusForm.leaveCategory || 'Sick Leave';
        const note = (state.statusForm.leaveNote || '').trim();
        if (!note) {
          state.statusForm.errorMessage = 'Please enter a brief leave reason note.';
          onStateChange();
          return;
        }
        leaveReason = `${cat} — ${note}`;
      }

      state.statusForm.submitting = true;
      state.statusForm.errorMessage = '';
      state.statusForm.successMessage = '';
      onStateChange();

      try {
        await api.updateMyStatus(status, leaveReason);
        await Promise.all([refreshSession(), refreshPublic()]);
        state.statusForm.submitting = false;
        state.statusForm.successMessage = 'Your status has been saved and synced across devices.';
        onStateChange();
      } catch (err) {
        state.statusForm.submitting = false;
        state.statusForm.errorMessage = err.message || 'Could not update status.';
        onStateChange();
      }
    });
  }

  const regPasskeyBtn = root.querySelector('#registerPasskeyBtn');
  if (regPasskeyBtn) {
    regPasskeyBtn.addEventListener('click', async () => {
      state.statusForm.securityMessage = '';
      state.statusForm.securityError = '';
      onStateChange();
      try {
        const options = await api.getPasskeyRegisterOptions();
        const attestation = await startRegistration({ optionsJSON: options });
        await api.verifyPasskeyRegister(attestation);
        state.statusForm.securityMessage = 'Passkey registered on this device. You can now use it to sign in.';
        onStateChange();
      } catch (err) {
        state.statusForm.securityError = err.message || 'Passkey registration cancelled or failed.';
        onStateChange();
      }
    });
  }

  renderIcons(root);
}
