import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/escape.js';
import { formatIstTimestamp } from '../lib/ist.js';
import { renderIcons } from '../lib/icons.js';

const BADGE_MAP = {
  office: { label: 'Office', badge: 'bg-available-container text-on-available-container', dot: 'bg-available', row: 'hover:bg-light-surface-container-low/60' },
  wfh: { label: 'WFH', badge: 'bg-light-tertiary-container text-light-on-tertiary-container', dot: 'bg-light-tertiary', row: 'hover:bg-light-surface-container-low/60' },
  leave: { label: 'On Leave', badge: 'bg-leave-container text-on-leave-container', dot: 'bg-leave', row: 'bg-leave-container/15 hover:bg-leave-container/25' },
  'not-updated': { label: 'Not Updated', badge: 'bg-light-surface-container text-light-on-surface-variant', dot: 'bg-light-outline', row: 'bg-light-surface-container-low/40 hover:bg-light-surface-container-low' },
};

export function renderSupervisorView(state) {
  const { user, supTab = 'availability', supData, supEmployees, supLoading, supError, supFilter = 'all', supSearch = '', empSearch = '', empStatusFilter = 'active', supModal, supNotice } = state;

  if (!user || user.role !== 'supervisor') {
    return `
      <div class="max-w-xl mx-auto w-full bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 md:p-8 shadow-sm flex flex-col items-center text-center gap-4">
        <div class="w-12 h-12 rounded-full bg-light-primary-container text-light-on-primary-container flex items-center justify-center">
          <i data-lucide="shield-alert" class="w-6 h-6" aria-hidden="true"></i>
        </div>
        <div>
          <h2 class="font-headline text-headline-md text-light-on-surface">Supervisor Access Required</h2>
          <p class="font-body text-body-md text-light-on-surface-variant mt-1">Only authenticated supervisors can view confidential leave reasons and manage team accounts.</p>
        </div>
        <a href="/login?next=/supervisor" data-link class="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
          <i data-lucide="shield-check" class="w-4 h-4" aria-hidden="true"></i>
          <span class="font-label text-label-lg">Sign In as Supervisor</span>
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
      <!-- Team Availability Overview (5 Summary Cards) -->
      <section aria-label="Team Availability Overview" class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 md:p-6 shadow-sm flex flex-col gap-5">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Team Availability Overview</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Daily status across ${counts.total} active employees • Resets 12:00 AM IST</p>
          </div>
          <button type="button" id="exportCsvBtn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-11 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change shrink-0">
            <i data-lucide="download" class="w-4 h-4" aria-hidden="true"></i>
            <span class="font-label text-label-lg">Export Daily Report</span>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 items-stretch">
          <div class="col-span-2 sm:col-span-1 p-4 rounded bg-light-surface-container-low border border-light-outline-variant flex items-center justify-between gap-2">
            <div>
              <p class="font-label text-label-sm text-light-on-surface-variant">Total Active</p>
              <p class="font-headline text-display-lg-mobile md:text-display-lg text-light-on-surface tabular-nums">${counts.total}</p>
            </div>
            <i data-lucide="users" class="w-5 h-5 text-light-primary shrink-0" aria-hidden="true"></i>
          </div>
          <div class="p-4 rounded bg-available-container/40 border border-available/30 flex items-center justify-between gap-2">
            <div>
              <p class="font-label text-label-sm text-on-available-container">Office</p>
              <p class="font-headline text-display-lg-mobile md:text-display-lg text-available tabular-nums">${counts.office}</p>
            </div>
            <i data-lucide="building-2" class="w-5 h-5 text-available shrink-0" aria-hidden="true"></i>
          </div>
          <div class="p-4 rounded bg-light-tertiary-container/60 border border-light-tertiary/30 flex items-center justify-between gap-2">
            <div>
              <p class="font-label text-label-sm text-light-on-tertiary-container">WFH</p>
              <p class="font-headline text-display-lg-mobile md:text-display-lg text-light-tertiary tabular-nums">${counts.wfh}</p>
            </div>
            <i data-lucide="laptop" class="w-5 h-5 text-light-tertiary shrink-0" aria-hidden="true"></i>
          </div>
          <div class="p-4 rounded bg-leave-container/40 border border-leave/30 flex items-center justify-between gap-2">
            <div>
              <p class="font-label text-label-sm text-on-leave-container">On Leave</p>
              <p class="font-headline text-display-lg-mobile md:text-display-lg text-leave tabular-nums">${counts.leave}</p>
            </div>
            <i data-lucide="user-x" class="w-5 h-5 text-leave shrink-0" aria-hidden="true"></i>
          </div>
          <div class="p-4 rounded bg-light-surface-container border border-light-outline-variant flex items-center justify-between gap-2">
            <div>
              <p class="font-label text-label-sm text-light-on-surface-variant">Not Updated</p>
              <p class="font-headline text-display-lg-mobile md:text-display-lg text-light-on-surface-variant tabular-nums">${counts.notUpdated}</p>
            </div>
            <i data-lucide="clock" class="w-5 h-5 text-light-on-surface-variant shrink-0" aria-hidden="true"></i>
          </div>
        </div>
      </section>

      <!-- Filters + Daily Report Table -->
      <section aria-label="Daily Availability Report" class="flex flex-col gap-4">
        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="w-full sm:w-72 relative flex items-center">
            <span aria-hidden="true" class="absolute left-3.5 text-light-on-surface-variant pointer-events-none">
              <i data-lucide="search" class="w-4 h-4"></i>
            </span>
            <input id="supSearchInput" type="search" value="${escapeHtml(supSearch)}" placeholder="Search name or ID..." class="w-full pl-10 pr-3.5 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-body text-body-md focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
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
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Employee</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Status</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Leave Reason (Supervisor Only)</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant text-right">Last Updated</th>
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
                          <tr class="${cfg.row} transition-colors duration-state-change">
                            <td class="px-5 py-3.5">
                              <div class="flex flex-col">
                                <span class="font-body text-body-md text-light-on-surface">${escapeHtml(row.fullName)}</span>
                                <span class="font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(row.employeeId)}</span>
                              </div>
                            </td>
                            <td class="px-5 py-3.5">
                              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.badge}">
                                <span class="w-2 h-2 rounded-full ${cfg.dot}" aria-hidden="true"></span>
                                <span class="font-label text-label-sm">${cfg.label}</span>
                              </span>
                            </td>
                            <td class="px-5 py-3.5">
                              <span class="font-body text-body-md ${isLeave ? 'text-on-leave-container font-medium' : 'text-light-on-surface-variant'}">${isLeave && row.leaveReason ? escapeHtml(row.leaveReason) : '—'}</span>
                            </td>
                            <td class="px-5 py-3.5 text-right">
                              <span class="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">${row.updatedAt ? escapeHtml(formatIstTimestamp(row.updatedAt)) : '—'}</span>
                            </td>
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
  } else {
    // Employee Management Tab
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
            <p class="font-body text-body-sm text-light-on-surface-variant">Add, edit, reset PINs, deactivate, or reactivate team accounts. Records are never permanently deleted.</p>
          </div>
          <button type="button" data-open-modal="add" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-11 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
            <i data-lucide="user-plus" class="w-4 h-4" aria-hidden="true"></i>
            <span class="font-label text-label-lg">Add Employee</span>
          </button>
        </div>

        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="w-full sm:w-72 relative flex items-center">
            <span aria-hidden="true" class="absolute left-3.5 text-light-on-surface-variant pointer-events-none">
              <i data-lucide="search" class="w-4 h-4"></i>
            </span>
            <input id="empSearchInput" type="search" value="${escapeHtml(empSearch)}" placeholder="Search employee..." class="w-full pl-10 pr-3.5 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-body text-body-md focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
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
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Employee</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Role</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Account</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">PIN State</th>
                <th scope="col" class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-light-outline-variant">
              ${
                filteredList.length > 0
                  ? filteredList
                      .map(
                        (emp) => `
                        <tr class="hover:bg-light-surface-container-low/60 transition-colors duration-state-change">
                          <td class="px-5 py-3.5">
                            <div class="flex flex-col">
                              <span class="font-body text-body-md text-light-on-surface">${escapeHtml(emp.fullName)}</span>
                              <span class="font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(emp.employeeId)}</span>
                            </div>
                          </td>
                          <td class="px-5 py-3.5">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full font-label text-label-sm ${emp.role === 'supervisor' ? 'bg-light-primary-container text-light-on-primary-container' : 'bg-light-surface-container text-light-on-surface-variant'}">${emp.role === 'supervisor' ? 'Supervisor' : 'Employee'}</span>
                          </td>
                          <td class="px-5 py-3.5">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label text-label-sm ${emp.isActive ? 'bg-available-container text-on-available-container' : 'bg-leave-container text-on-leave-container'}">
                              <span class="w-1.5 h-1.5 rounded-full ${emp.isActive ? 'bg-available' : 'bg-leave'}"></span>
                              ${emp.isActive ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td class="px-5 py-3.5">
                            <span class="font-body text-body-sm ${emp.mustChangePin ? 'text-warning font-semibold' : 'text-light-on-surface-variant'}">${emp.mustChangePin ? 'Pending PIN Change' : 'Verified'}</span>
                          </td>
                          <td class="px-5 py-3.5 text-right">
                            <div class="inline-flex items-center justify-end gap-2 flex-wrap">
                              <button type="button" data-open-modal="edit" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant text-light-on-surface hover:bg-light-surface-container-low font-label text-label-sm">Edit</button>
                              <button type="button" data-open-modal="reset-pin" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant text-light-on-surface hover:bg-light-surface-container-low font-label text-label-sm">Reset PIN</button>
                              ${
                                emp.isActive
                                  ? `<button type="button" data-open-modal="deactivate" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-leave/40 text-leave hover:bg-leave-container/30 font-label text-label-sm">Deactivate</button>`
                                  : `<button type="button" data-open-modal="reactivate" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-available/40 text-available hover:bg-available-container/30 font-label text-label-sm">Reactivate</button>`
                              }
                            </div>
                          </td>
                        </tr>
                      `,
                      )
                      .join('')
                  : `<tr><td colspan="5" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No accounts match this filter.</td></tr>`
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
          <i data-lucide="clipboard-list" class="w-4 h-4" aria-hidden="true"></i>
          <span>Daily Availability</span>
        </button>
        <button type="button" data-sup-tab="employees" class="${subTabClass(supTab === 'employees')}">
          <i data-lucide="users-cog" class="w-4 h-4" aria-hidden="true"></i>
          <span>Employee Management</span>
        </button>
      </div>

      ${noticeHtml}
      ${errorHtml}
      ${tabBody}
      ${supModal ? renderSupervisorModal(supModal, supEmployees || []) : ''}
    </div>
  `;
}

function renderSupervisorModal(modal, employees) {
  const emp = modal.empId ? employees.find((e) => e.id === modal.empId) : null;

  let title = '';
  let body = '';

  if (modal.type === 'add') {
    title = 'Add New Employee';
    body = `
      <form id="supModalForm" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Full Name</span>
          <input name="fullName" type="text" required placeholder="e.g. Priya Sharma" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Unique Employee ID</span>
          <input name="employeeId" type="text" required placeholder="e.g. EMP-113" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md uppercase">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Initial Temporary PIN (4–12 chars/digits)</span>
          <input name="initialPin" type="password" inputmode="numeric" minlength="4" maxlength="12" required placeholder="Employee must change on first login" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Role</span>
          <select name="role" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
            <option value="employee" selected>Employee</option>
            <option value="supervisor">Supervisor</option>
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-light-primary text-light-on-primary font-label text-label-md">Create Account</button>
        </div>
      </form>
    `;
  } else if (modal.type === 'edit' && emp) {
    title = `Edit ${emp.fullName}`;
    body = `
      <form id="supModalForm" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Full Name</span>
          <input name="fullName" type="text" required value="${escapeHtml(emp.fullName)}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Employee ID</span>
          <input name="employeeId" type="text" required value="${escapeHtml(emp.employeeId)}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md uppercase">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Role</span>
          <select name="role" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
            <option value="employee" ${emp.role === 'employee' ? 'selected' : ''}>Employee</option>
            <option value="supervisor" ${emp.role === 'supervisor' ? 'selected' : ''}>Supervisor</option>
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-light-primary text-light-on-primary font-label text-label-md">Save Changes</button>
        </div>
      </form>
    `;
  } else if (modal.type === 'reset-pin' && emp) {
    title = `Reset PIN — ${emp.fullName}`;
    body = `
      <form id="supModalForm" class="flex flex-col gap-4">
        <p class="font-body text-body-sm text-light-on-surface-variant">Setting a temporary PIN will require ${escapeHtml(emp.fullName)} to change it on their next login and will revoke active sessions.</p>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">New Temporary PIN (4–12 chars/digits)</span>
          <input name="newPin" type="password" inputmode="numeric" minlength="4" maxlength="12" required class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md">
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-light-primary text-light-on-primary font-label text-label-md">Reset PIN</button>
        </div>
      </form>
    `;
  } else if (modal.type === 'deactivate' && emp) {
    title = `Deactivate ${emp.fullName}?`;
    body = `
      <form id="supModalForm" class="flex flex-col gap-4">
        <p class="font-body text-body-md text-light-on-surface-variant">Deactivating <strong>${escapeHtml(emp.employeeId)}</strong> will immediately revoke login access and active sessions, and remove them from the active public dashboard. Historical records will be preserved.</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-leave text-on-leave font-label text-label-md">Confirm Deactivation</button>
        </div>
      </form>
    `;
  } else if (modal.type === 'reactivate' && emp) {
    title = `Reactivate ${emp.fullName}`;
    body = `
      <form id="supModalForm" class="flex flex-col gap-4">
        <p class="font-body text-body-sm text-light-on-surface-variant">Provide a fresh temporary PIN so ${escapeHtml(emp.fullName)} can verify and set a new personal PIN on login.</p>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Temporary PIN (4–12 chars/digits)</span>
          <input name="newPin" type="password" inputmode="numeric" minlength="4" maxlength="12" required class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md">
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-available text-on-available font-label text-label-md">Reactivate Account</button>
        </div>
      </form>
    `;
  }

  return `
    <div class="fixed inset-0 z-50 bg-light-scrim/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-lg w-full max-w-md p-6 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-headline text-headline-md text-light-on-surface">${escapeHtml(title)}</h3>
          <button type="button" data-close-modal class="p-1 text-light-on-surface-variant hover:text-light-on-surface" aria-label="Close">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        ${modal.error ? `<div role="alert" class="p-3 rounded bg-error-container text-light-on-error-container font-body text-body-sm">${escapeHtml(modal.error)}</div>` : ''}
        ${body}
      </div>
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
      const csvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      const lines = [
        ['Employee ID', 'Full Name', 'Status', 'Leave Reason', 'Last Updated (IST)'].map(csvCell).join(','),
        ...rows.map((r) =>
          [
            r.employeeId,
            r.fullName,
            r.status,
            r.status === 'leave' ? r.leaveReason || '' : '',
            r.updatedAt ? formatIstTimestamp(r.updatedAt) : '',
          ]
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

  root.querySelectorAll('[data-open-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supModal = { type: btn.dataset.openModal, empId: btn.dataset.empId || null, error: '' };
      onStateChange();
    });
  });

  root.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supModal = null;
      onStateChange();
    });
  });

  const modalForm = root.querySelector('#supModalForm');
  if (modalForm && state.supModal) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(modalForm);
      const modal = state.supModal;
      modal.error = '';

      try {
        if (modal.type === 'add') {
          await api.createEmployee({
            fullName: fd.get('fullName').toString().trim(),
            employeeId: fd.get('employeeId').toString().trim().toUpperCase(),
            initialPin: fd.get('initialPin').toString(),
            role: fd.get('role').toString(),
          });
          state.supNotice = 'Employee account created.';
        } else if (modal.type === 'edit') {
          await api.updateEmployee(modal.empId, {
            action: 'edit',
            fullName: fd.get('fullName').toString().trim(),
            employeeId: fd.get('employeeId').toString().trim().toUpperCase(),
            role: fd.get('role').toString(),
          });
          state.supNotice = 'Employee details updated.';
        } else if (modal.type === 'reset-pin') {
          await api.updateEmployee(modal.empId, {
            action: 'reset_pin',
            newPin: fd.get('newPin').toString(),
          });
          state.supNotice = 'Temporary PIN reset. User must change PIN on next login.';
        } else if (modal.type === 'deactivate') {
          await api.updateEmployee(modal.empId, { action: 'deactivate' });
          state.supNotice = 'Employee deactivated and active sessions revoked.';
        } else if (modal.type === 'reactivate') {
          await api.updateEmployee(modal.empId, {
            action: 'reactivate',
            newPin: fd.get('newPin').toString(),
          });
          state.supNotice = 'Employee account reactivated with a temporary PIN.';
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

  renderIcons(root);
}
