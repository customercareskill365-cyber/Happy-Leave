import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { formatIstTimestamp } from '../lib/ist.js';
import { renderIcons } from '../lib/icons.js';
import { renderAccountModal, renderOneTimePasswordModal } from './masterAdmin.js';

const BADGE_MAP = {
  office: { label: 'Office', badge: 'bg-available-container text-on-available-container', dot: 'bg-available', row: 'hover:bg-light-surface-container-low/60' },
  wfh: { label: 'WFH', badge: 'bg-light-tertiary-container text-light-on-tertiary-container', dot: 'bg-light-tertiary', row: 'hover:bg-light-surface-container-low/60' },
  leave: { label: 'On Leave', badge: 'bg-leave-container text-on-leave-container', dot: 'bg-leave', row: 'bg-leave-container/15 hover:bg-leave-container/25' },
  'not-updated': { label: 'Not Updated', badge: 'bg-light-surface-container text-light-on-surface-variant', dot: 'bg-light-outline', row: 'bg-light-surface-container-low/40 hover:bg-light-surface-container-low' },
};

function formatDateTimeIst(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' IST'
  );
}

export function renderSupervisorView(state) {
  const {
    user,
    supTab = 'availability',
    supData,
    supEmployees,
    supAuditLogs = [],
    supLoading,
    supError,
    supFilter = 'all',
    supSearch = '',
    empSearch = '',
    empStatusFilter = 'active',
    supModal,
    oneTimePasswordModal,
    supNotice,
  } = state;

  if (!user || (user.role !== 'supervisor' && user.role !== 'master_admin')) {
    return `
      <div class="max-w-xl mx-auto w-full bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 md:p-8 shadow-sm flex flex-col items-center text-center gap-4">
        <div class="w-12 h-12 rounded-full bg-light-primary-container text-light-on-primary-container flex items-center justify-center">
          <i data-lucide="shield-alert" class="w-6 h-6" aria-hidden="true"></i>
        </div>
        <div>
          <h2 class="font-headline text-headline-md text-light-on-surface">Supervisor Access Required</h2>
          <p class="font-body text-body-md text-light-on-surface-variant mt-1">Only authenticated supervisors can view confidential leave reasons and manage employee accounts.</p>
        </div>
        <a href="/login?next=/supervisor" data-link class="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
          <i data-lucide="shield-check" class="w-4 h-4" aria-hidden="true"></i>
          <span class="font-label text-label-lg">Sign In</span>
        </a>
      </div>
    `;
  }

  const subTabClass = (active) =>
    active
      ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded bg-light-primary text-light-on-primary font-label text-label-md transition-colors duration-state-change'
      : 'inline-flex items-center gap-2 px-4 py-2.5 rounded bg-light-surface-container-lowest border border-light-outline-variant text-light-on-surface-variant hover:bg-light-surface-container-low font-label text-label-md transition-colors duration-state-change';

  const noticeHtml = supNotice
    ? `<div role="status" class="bg-available-container border border-available/40 rounded-md px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <i data-lucide="check-circle-2" class="w-4 h-4 text-available shrink-0"></i>
          <span class="font-body text-body-sm text-on-available-container">${escapeHtml(supNotice)}</span>
        </div>
        <button type="button" data-action="dismiss-sup-notice" class="text-on-available-container font-label text-label-sm hover:underline">Dismiss</button>
      </div>`
    : '';

  const errorHtml = supError
    ? `<div role="alert" class="bg-error-container border border-light-error/30 rounded-md px-4 py-3 flex items-center gap-2.5">
        <i data-lucide="alert-circle" class="w-4 h-4 text-light-error shrink-0"></i>
        <span class="font-body text-body-sm text-light-on-error-container">${escapeHtml(supError)}</span>
      </div>`
    : '';

  let tabBody = '';

  if (supLoading && !supData) {
    tabBody = `
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-10 text-center flex flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-full border-2 border-light-primary border-t-transparent animate-spin"></div>
        <p class="font-body text-body-md text-light-on-surface-variant">Loading supervisor dashboard...</p>
      </div>
    `;
  } else if (supTab === 'availability') {
    const rows = supData?.employees || [];
    const counts = supData?.counts || { total: 0, office: 0, wfh: 0, leave: 0, notUpdated: 0 };

    const filterBtn = (key, label, count) => {
      const active = supFilter === key;
      const cls = active
        ? 'px-3 py-2 min-h-10 rounded bg-light-primary text-light-on-primary font-label text-label-md'
        : 'px-3 py-2 min-h-10 rounded bg-light-surface-container-low text-light-on-surface-variant border border-light-outline-variant font-label text-label-md';
      return `<button type="button" data-sup-filter="${key}" class="${cls}">${escapeHtml(label)} (${count})</button>`;
    };

    const filtered = rows.filter((r) => {
      const matchesFilter = supFilter === 'all' || r.status === supFilter;
      const q = supSearch.trim().toLowerCase();
      const matchesSearch = !q || r.fullName.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });

    tabBody = `
      <section aria-label="Team Availability Overview" class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 md:p-6 shadow-sm flex flex-col gap-5">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Team Availability Overview</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Daily status across ${counts.total} active team members • Resets 12:00 AM IST</p>
          </div>
          <button type="button" id="exportCsvBtn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-11 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change shrink-0">
            <i data-lucide="download" class="w-4 h-4" aria-hidden="true"></i>
            <span class="font-label text-label-lg">Export Daily Report</span>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 items-stretch">
          <div class="col-span-2 sm:col-span-1 p-4 rounded bg-light-surface-container-low border border-light-outline-variant flex items-center justify-between gap-2">
            <div><p class="font-label text-label-sm text-light-on-surface-variant">Total Active</p><p class="font-headline text-display-lg-mobile md:text-display-lg text-light-on-surface tabular-nums">${counts.total}</p></div>
            <i data-lucide="users" class="w-5 h-5 text-light-primary shrink-0"></i>
          </div>
          <div class="p-4 rounded bg-available-container/40 border border-available/30 flex items-center justify-between gap-2">
            <div><p class="font-label text-label-sm text-on-available-container">Office</p><p class="font-headline text-display-lg-mobile md:text-display-lg text-available tabular-nums">${counts.office}</p></div>
            <i data-lucide="building-2" class="w-5 h-5 text-available shrink-0"></i>
          </div>
          <div class="p-4 rounded bg-light-tertiary-container/60 border border-light-tertiary/30 flex items-center justify-between gap-2">
            <div><p class="font-label text-label-sm text-light-on-tertiary-container">WFH</p><p class="font-headline text-display-lg-mobile md:text-display-lg text-light-tertiary tabular-nums">${counts.wfh}</p></div>
            <i data-lucide="laptop" class="w-5 h-5 text-light-tertiary shrink-0"></i>
          </div>
          <div class="p-4 rounded bg-leave-container/40 border border-leave/30 flex items-center justify-between gap-2">
            <div><p class="font-label text-label-sm text-on-leave-container">On Leave</p><p class="font-headline text-display-lg-mobile md:text-display-lg text-leave tabular-nums">${counts.leave}</p></div>
            <i data-lucide="user-x" class="w-5 h-5 text-leave shrink-0"></i>
          </div>
          <div class="p-4 rounded bg-light-surface-container border border-light-outline-variant flex items-center justify-between gap-2">
            <div><p class="font-label text-label-sm text-light-on-surface-variant">Not Updated</p><p class="font-headline text-display-lg-mobile md:text-display-lg text-light-on-surface-variant tabular-nums">${counts.notUpdated}</p></div>
            <i data-lucide="clock" class="w-5 h-5 text-light-on-surface-variant shrink-0"></i>
          </div>
        </div>
      </section>

      <section aria-label="Daily Availability Report" class="flex flex-col gap-4">
        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="w-full sm:w-72 relative flex items-center">
            <i data-lucide="search" class="w-4 h-4 absolute left-3.5 text-light-on-surface-variant"></i>
            <input id="supSearchInput" type="search" value="${escapeHtml(supSearch)}" placeholder="Search name or ID..." class="w-full pl-10 pr-3.5 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${filterBtn('all', 'All', counts.total)}
            ${filterBtn('office', 'Office', counts.office)}
            ${filterBtn('wfh', 'WFH', counts.wfh)}
            ${filterBtn('leave', 'On Leave', counts.leave)}
            ${filterBtn('not-updated', 'Not Updated', counts.notUpdated)}
          </div>
        </div>

        <div class="w-full overflow-x-auto bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm">
          <table class="w-full text-left border-collapse">
            <thead class="bg-light-surface-container-low border-b border-light-outline-variant">
              <tr>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Employee</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Status</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Leave Reason (Supervisor Only)</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-light-outline-variant">
              ${
                filtered.length > 0
                  ? filtered
                      .map((row) => {
                        const cfg = BADGE_MAP[row.status] || BADGE_MAP['not-updated'];
                        const isLeave = row.status === 'leave';
                        return `
                          <tr class="${cfg.row}">
                            <td class="px-5 py-3.5">
                              <div class="font-body text-body-md text-light-on-surface">${escapeHtml(row.fullName)}</div>
                              <div class="font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(row.employeeId)}</div>
                            </td>
                            <td class="px-5 py-3.5">
                              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.badge}">
                                <span class="w-2 h-2 rounded-full ${cfg.dot}"></span>
                                <span class="font-label text-label-sm">${cfg.label}</span>
                              </span>
                            </td>
                            <td class="px-5 py-3.5 font-body text-body-md ${isLeave ? 'text-on-leave-container font-medium' : 'text-light-on-surface-variant'}">${isLeave && row.leaveReason ? escapeHtml(row.leaveReason) : '—'}</td>
                            <td class="px-5 py-3.5 text-right font-mono text-mono-sm text-light-on-surface-variant">${row.updatedAt ? escapeHtml(formatIstTimestamp(row.updatedAt)) : '—'}</td>
                          </tr>
                        `;
                      })
                      .join('')
                  : `<tr><td colspan="4" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No matching employees found.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  } else if (supTab === 'employees') {
    const list = supEmployees || [];
    const q = empSearch.trim().toLowerCase();
    const filteredList = list.filter((e) => {
      const matchesStatus = empStatusFilter === 'all' || (empStatusFilter === 'active' ? e.isActive : !e.isActive);
      const matchesSearch = !q || e.fullName.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    tabBody = `
      <section aria-label="Employee Management" class="flex flex-col gap-4">
        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Employee Management</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Create, edit, reset passwords, deactivate or reactivate employee accounts.</p>
          </div>
          <button type="button" data-open-sup-modal="add-employee" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-11 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            <span class="font-label text-label-lg">Add Employee</span>
          </button>
        </div>

        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="w-full sm:w-72 relative flex items-center">
            <i data-lucide="search" class="w-4 h-4 absolute left-3.5 text-light-on-surface-variant"></i>
            <input id="empSearchInput" type="search" value="${escapeHtml(empSearch)}" placeholder="Search employee..." class="w-full pl-10 pr-3.5 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
          </div>
          <div class="flex items-center gap-2">
            ${['active', 'inactive', 'all']
              .map((k) => {
                const active = empStatusFilter === k;
                const label = k === 'active' ? 'Active' : k === 'inactive' ? 'Deactivated' : 'All';
                return `<button type="button" data-emp-filter="${k}" class="px-3 py-2 min-h-10 rounded font-label text-label-md ${active ? 'bg-light-primary text-light-on-primary' : 'bg-light-surface-container-low text-light-on-surface-variant border border-light-outline-variant'}">${label}</button>`;
              })
              .join('')}
          </div>
        </div>

        <div class="w-full overflow-x-auto bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm">
          <table class="w-full text-left border-collapse">
            <thead class="bg-light-surface-container-low border-b border-light-outline-variant">
              <tr>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Employee</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Account</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Password State</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Last Login</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-light-outline-variant">
              ${
                filteredList.length > 0
                  ? filteredList
                      .map(
                        (emp) => `
                        <tr class="hover:bg-light-surface-container-low/60">
                          <td class="px-5 py-3.5">
                            <div class="font-body text-body-md text-light-on-surface">${escapeHtml(emp.fullName)}</div>
                            <div class="font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(emp.employeeId)}</div>
                          </td>
                          <td class="px-5 py-3.5">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label text-label-sm ${emp.isActive ? 'bg-available-container text-on-available-container' : 'bg-leave-container text-on-leave-container'}">
                              <span class="w-1.5 h-1.5 rounded-full ${emp.isActive ? 'bg-available' : 'bg-leave'}"></span>
                              ${emp.isActive ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td class="px-5 py-3.5 font-body text-body-sm ${emp.mustChangePin ? 'text-warning font-semibold' : 'text-light-on-surface-variant'}">${emp.mustChangePin ? 'Pending Password Change' : 'Verified'}</td>
                          <td class="px-5 py-3.5 font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(formatDateTimeIst(emp.lastLoginAt))}</td>
                          <td class="px-5 py-3.5 text-right">
                            <div class="inline-flex items-center justify-end gap-2 flex-wrap">
                              <button type="button" data-open-sup-modal="edit-account" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant font-label text-label-sm hover:bg-light-surface-container-low">Edit</button>
                              <button type="button" data-open-sup-modal="reset-password" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant font-label text-label-sm hover:bg-light-surface-container-low">Reset Password</button>
                              ${
                                emp.isActive
                                  ? `<button type="button" data-open-sup-modal="deactivate" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-leave/40 text-leave font-label text-label-sm hover:bg-leave-container/30">Deactivate</button>`
                                  : `<button type="button" data-open-sup-modal="reactivate" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-available/40 text-available font-label text-label-sm hover:bg-available-container/30">Reactivate</button>`
                              }
                            </div>
                          </td>
                        </tr>
                      `,
                      )
                      .join('')
                  : `<tr><td colspan="5" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No employee accounts match this filter.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  } else if (supTab === 'audit') {
    tabBody = `
      <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm overflow-hidden">
        <div class="p-5 border-b border-light-outline-variant">
          <h2 class="font-headline text-headline-md text-light-on-surface">Employee Activity Logs</h2>
          <p class="font-body text-body-sm text-light-on-surface-variant">Recent employee account and availability events.</p>
        </div>
        <div class="w-full overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-light-surface-container-low border-b border-light-outline-variant">
              <tr>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Timestamp (IST)</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Actor</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Action</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Target</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-light-outline-variant">
              ${
                supAuditLogs.length > 0
                  ? supAuditLogs
                      .map(
                        (log) => `
                        <tr class="hover:bg-light-surface-container-low/50">
                          <td class="px-5 py-3 font-mono text-mono-sm text-light-on-surface-variant whitespace-nowrap">${escapeHtml(formatDateTimeIst(log.createdAt))}</td>
                          <td class="px-5 py-3 font-body text-body-sm text-light-on-surface">${log.actorId ? `${escapeHtml(log.actorName)} (${escapeHtml(log.actorId)})` : 'System'}</td>
                          <td class="px-5 py-3"><span class="px-2.5 py-0.5 rounded-full bg-light-surface-container font-mono text-mono-sm">${escapeHtml(log.action)}</span></td>
                          <td class="px-5 py-3 font-body text-body-sm text-light-on-surface">${log.targetId ? `${escapeHtml(log.targetName)} (${escapeHtml(log.targetId)})` : '—'}</td>
                        </tr>
                      `,
                      )
                      .join('')
                  : `<tr><td colspan="4" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No activity logs yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  return `
    <div class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-sup-tab="availability" class="${subTabClass(supTab === 'availability')}">
          <i data-lucide="clipboard-list" class="w-4 h-4"></i>
          <span>Daily Availability</span>
        </button>
        <button type="button" data-sup-tab="employees" class="${subTabClass(supTab === 'employees')}">
          <i data-lucide="users" class="w-4 h-4"></i>
          <span>Employee Management</span>
        </button>
        <button type="button" data-sup-tab="audit" class="${subTabClass(supTab === 'audit')}">
          <i data-lucide="file-text" class="w-4 h-4"></i>
          <span>Activity Logs</span>
        </button>
      </div>

      ${noticeHtml}
      ${errorHtml}
      ${tabBody}
      ${supModal ? renderAccountModal(supModal, supEmployees || [], false) : ''}
      ${oneTimePasswordModal ? renderOneTimePasswordModal(oneTimePasswordModal) : ''}
    </div>
  `;
}

export function bindSupervisorEvents(root, state, { refreshSupervisor, refreshPublic, onStateChange }) {
  root.querySelectorAll('[data-sup-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supTab = btn.dataset.supTab;
      onStateChange();
    });
  });

  root.querySelectorAll('[data-sup-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supFilter = btn.dataset.supFilter;
      onStateChange();
    });
  });

  const supSearchInput = root.querySelector('#supSearchInput');
  if (supSearchInput) {
    supSearchInput.addEventListener('input', (e) => {
      state.supSearch = e.target.value;
      onStateChange({ preserveFocusId: 'supSearchInput', cursorPos: e.target.selectionStart });
    });
  }

  const empSearchInput = root.querySelector('#empSearchInput');
  if (empSearchInput) {
    empSearchInput.addEventListener('input', (e) => {
      state.empSearch = e.target.value;
      onStateChange({ preserveFocusId: 'empSearchInput', cursorPos: e.target.selectionStart });
    });
  }

  root.querySelectorAll('[data-emp-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.empStatusFilter = btn.dataset.empFilter;
      onStateChange();
    });
  });

  const dismissBtn = root.querySelector('[data-action="dismiss-sup-notice"]');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      state.supNotice = '';
      onStateChange();
    });
  }

  const exportBtn = root.querySelector('#exportCsvBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = state.supData?.employees || [];
      const dateStr = state.supData?.availabilityDate || 'today';
      const csvCell = (val) => {
        const s = String(val ?? '');
        const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const lines = [
        ['Employee ID', 'Full Name', 'Status', 'Leave Reason', 'Last Updated (IST)'].map(csvCell).join(','),
        ...rows.map((r) =>
          [r.employeeId, r.fullName, r.status, r.status === 'leave' ? r.leaveReason || '' : '', r.updatedAt ? formatIstTimestamp(r.updatedAt) : '']
            .map(csvCell)
            .join(','),
        ),
      ];
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team-availability-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      state.supNotice = `Daily availability report exported (${dateStr}).`;
      onStateChange();
    });
  }

  root.querySelectorAll('[data-open-sup-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supModal = { type: btn.dataset.openSupModal, empId: btn.dataset.empId || null, error: '' };
      onStateChange();
    });
  });

  root.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supModal = null;
      onStateChange();
    });
  });

  const autoChk = root.querySelector('#autoGenPwdChk');
  const manualGroup = root.querySelector('#manualPwdGroup');
  const manualInput = root.querySelector('#manualPwdInput');
  if (autoChk && manualGroup) {
    autoChk.addEventListener('change', () => {
      if (autoChk.checked) {
        manualGroup.classList.add('hidden');
        manualGroup.classList.remove('flex');
        if (manualInput) manualInput.required = false;
      } else {
        manualGroup.classList.remove('hidden');
        manualGroup.classList.add('flex');
        if (manualInput) manualInput.required = true;
      }
    });
  }

  const modalForm = root.querySelector('#accountModalForm');
  if (modalForm && state.supModal) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(modalForm);
      const modal = state.supModal;
      modal.error = '';

      try {
        if (modal.type === 'add-employee') {
          const gen = Boolean(fd.get('generatePassword'));
          const empId = fd.get('employeeId').toString().trim().toUpperCase();
          const res = await api.createAccount({
            fullName: fd.get('fullName').toString().trim(),
            employeeId: empId,
            role: 'employee',
            generatePassword: gen,
            initialPassword: gen ? '' : fd.get('initialPassword').toString(),
            isActive: fd.get('isActive') === 'true',
          });
          state.supNotice = `Employee ${empId} created.`;
          if (res.temporaryPassword) {
            state.oneTimePasswordModal = { employeeId: empId, password: res.temporaryPassword };
          }
        } else if (modal.type === 'edit-account') {
          await api.updateAccount(modal.empId, {
            action: 'edit',
            fullName: fd.get('fullName').toString().trim(),
            employeeId: fd.get('employeeId').toString().trim().toUpperCase(),
          });
          state.supNotice = 'Employee details updated.';
        } else if (modal.type === 'reset-password' || modal.type === 'reactivate') {
          const gen = Boolean(fd.get('generatePassword'));
          const targetAcc = (state.supEmployees || []).find((x) => x.id === modal.empId);
          const res = await api.updateAccount(modal.empId, {
            action: modal.type === 'reactivate' ? 'reactivate' : 'reset_password',
            generatePassword: gen,
            newPassword: gen ? '' : fd.get('newPassword').toString(),
          });
          state.supNotice = modal.type === 'reactivate' ? 'Employee reactivated.' : 'Temporary password reset.';
          if (res.temporaryPassword) {
            state.oneTimePasswordModal = { employeeId: targetAcc?.employeeId || 'Employee', password: res.temporaryPassword };
          }
        } else if (modal.type === 'deactivate') {
          await api.updateAccount(modal.empId, { action: 'deactivate' });
          state.supNotice = 'Employee deactivated and active sessions revoked.';
        }
        state.supModal = null;
        await Promise.all([refreshSupervisor(), refreshPublic()]);
        onStateChange();
      } catch (err) {
        modal.error = err.message || 'Operation failed.';
        onStateChange();
      }
    });
  }

  const copyBtn = root.querySelector('#copyOneTimePwdBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const val = root.querySelector('#oneTimePwdValue')?.textContent || '';
      navigator.clipboard?.writeText(val).catch(() => {});
      copyBtn.textContent = 'Copied';
    });
  }
  const closeOneTimeBtn = root.querySelector('[data-close-one-time-pwd]');
  if (closeOneTimeBtn) {
    closeOneTimeBtn.addEventListener('click', () => {
      state.oneTimePasswordModal = null;
      onStateChange();
    });
  }

  renderIcons(root);
}
