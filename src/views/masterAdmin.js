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

export function renderMasterAdminView(state) {
  const {
    user,
    adminTab = 'dashboard',
    supData,
    adminEmployees = [],
    adminSupervisors = [],
    auditLogs = [],
    adminSettings = null,
    adminLoading = false,
    adminError = '',
    adminNotice = '',
    oneTimePasswordModal = null,
    adminModal = null,
    supFilter = 'all',
    supSearch = '',
    empSearch = '',
    empStatusFilter = 'active',
  } = state;

  if (!user || user.role !== 'master_admin') {
    return `
      <div class="max-w-xl mx-auto w-full bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 md:p-8 shadow-sm flex flex-col items-center text-center gap-4">
        <div class="w-12 h-12 rounded-full bg-light-primary-container text-light-on-primary-container flex items-center justify-center">
          <i data-lucide="shield-alert" class="w-6 h-6" aria-hidden="true"></i>
        </div>
        <div>
          <h2 class="font-headline text-headline-md text-light-on-surface">Master Admin Access Required</h2>
          <p class="font-body text-body-md text-light-on-surface-variant mt-1">Only the Master Admin can access Supervisor Management, Audit Logs, and System Settings.</p>
        </div>
        <a href="/login?next=/admin" data-link class="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
          <i data-lucide="log-in" class="w-4 h-4" aria-hidden="true"></i>
          <span class="font-label text-label-lg">Sign In</span>
        </a>
      </div>
    `;
  }

  const tabs = [
    ['dashboard', 'Dashboard', 'layout-dashboard'],
    ['employees', 'Employee Management', 'users'],
    ['supervisors', 'Supervisor Management', 'shield-check'],
    ['availability', 'Daily Availability', 'clipboard-list'],
    ['audit', 'Audit Logs', 'file-text'],
    ['settings', 'Account Settings', 'settings'],
  ];

  const tabBtn = (key, label, icon) => {
    const active = adminTab === key;
    return `
      <button type="button" data-admin-tab="${key}" class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded font-label text-label-md transition-colors duration-state-change ${
        active
          ? 'bg-light-primary text-light-on-primary'
          : 'bg-light-surface-container-lowest border border-light-outline-variant text-light-on-surface-variant hover:bg-light-surface-container-low'
      }">
        <i data-lucide="${icon}" class="w-4 h-4" aria-hidden="true"></i>
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  };

  const counts = supData?.counts || {
    activeEmployees: 0,
    activeSupervisors: 0,
    office: 0,
    wfh: 0,
    leave: 0,
    notUpdated: 0,
    total: 0,
  };

  let bodyHtml = '';

  if (adminLoading && !supData) {
    bodyHtml = `
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-10 text-center flex flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-full border-2 border-light-primary border-t-transparent animate-spin"></div>
        <p class="font-body text-body-md text-light-on-surface-variant">Loading Master Admin workspace...</p>
      </div>
    `;
  } else if (adminTab === 'dashboard') {
    bodyHtml = `
      <section aria-label="Master Admin Summary" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${summaryCard('Total Active Employees', counts.activeEmployees, 'Active employee accounts', 'users', 'border-light-outline-variant', 'text-light-on-surface', 'bg-light-surface-container text-light-primary')}
        ${summaryCard('Total Active Supervisors', counts.activeSupervisors, 'Active supervisor accounts', 'shield-check', 'border-light-primary/30', 'text-light-primary', 'bg-light-primary-container text-light-on-primary-container')}
        ${summaryCard('Working from Office', counts.office, 'Checked in at office', 'building-2', 'border-available/30', 'text-available', 'bg-available-container text-on-available-container')}
        ${summaryCard('Working from Home', counts.wfh, 'Working remotely today', 'laptop', 'border-light-tertiary/30', 'text-light-tertiary', 'bg-light-tertiary-container text-light-on-tertiary-container')}
        ${summaryCard('On Leave', counts.leave, 'Unavailable today', 'user-x', 'border-leave/30', 'text-leave', 'bg-leave-container text-on-leave-container')}
        ${summaryCard('Not Updated', counts.notUpdated, 'Pending check-in', 'clock', 'border-light-outline-variant', 'text-light-on-surface-variant', 'bg-light-surface-container text-light-on-surface-variant')}
      </section>

      <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="font-headline text-headline-md text-light-on-surface">Quick Administration</h2>
          <p class="font-body text-body-sm text-light-on-surface-variant">Manage supervisors, provision employee accounts, or inspect security audit trails.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-open-admin-modal="add-supervisor" class="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-light-primary text-light-on-primary font-label text-label-md">
            <i data-lucide="shield-plus" class="w-4 h-4"></i>
            Add Supervisor
          </button>
          <button type="button" data-open-admin-modal="add-employee" class="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-light-outline-variant bg-light-surface-container-low text-light-on-surface font-label text-label-md">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            Add Employee
          </button>
        </div>
      </section>
    `;
  } else if (adminTab === 'supervisors') {
    bodyHtml = `
      <section class="flex flex-col gap-4">
        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Supervisor Management</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Master Admin exclusive: create, edit, reset passwords, deactivate or reactivate Supervisors.</p>
          </div>
          <button type="button" data-open-admin-modal="add-supervisor" class="inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            Add Supervisor
          </button>
        </div>

        <div class="w-full overflow-x-auto bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm">
          <table class="w-full text-left border-collapse">
            <thead class="bg-light-surface-container-low border-b border-light-outline-variant">
              <tr>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Supervisor</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Status</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Created</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Last Login</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-light-outline-variant">
              ${
                adminSupervisors.length > 0
                  ? adminSupervisors
                      .map(
                        (sup) => `
                        <tr class="hover:bg-light-surface-container-low/60">
                          <td class="px-5 py-3.5">
                            <div class="font-body text-body-md text-light-on-surface">${escapeHtml(sup.fullName)}</div>
                            <div class="font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(sup.employeeId)}</div>
                          </td>
                          <td class="px-5 py-3.5">
                            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label text-label-sm ${sup.isActive ? 'bg-available-container text-on-available-container' : 'bg-leave-container text-on-leave-container'}">
                              <span class="w-1.5 h-1.5 rounded-full ${sup.isActive ? 'bg-available' : 'bg-leave'}"></span>
                              ${sup.isActive ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td class="px-5 py-3.5 font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(formatDateTimeIst(sup.createdAt))}</td>
                          <td class="px-5 py-3.5 font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(formatDateTimeIst(sup.lastLoginAt))}</td>
                          <td class="px-5 py-3.5 text-right">
                            <div class="inline-flex items-center justify-end gap-2 flex-wrap">
                              <button type="button" data-open-admin-modal="edit-account" data-emp-id="${escapeHtml(sup.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant font-label text-label-sm hover:bg-light-surface-container-low">Edit</button>
                              <button type="button" data-open-admin-modal="reset-password" data-emp-id="${escapeHtml(sup.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant font-label text-label-sm hover:bg-light-surface-container-low">Reset Password</button>
                              ${
                                sup.isActive
                                  ? `<button type="button" data-open-admin-modal="deactivate" data-emp-id="${escapeHtml(sup.id)}" class="px-2.5 py-1.5 rounded border border-leave/40 text-leave font-label text-label-sm hover:bg-leave-container/30">Deactivate</button>`
                                  : `<button type="button" data-open-admin-modal="reactivate" data-emp-id="${escapeHtml(sup.id)}" class="px-2.5 py-1.5 rounded border border-available/40 text-available font-label text-label-sm hover:bg-available-container/30">Reactivate</button>`
                              }
                            </div>
                          </td>
                        </tr>
                      `,
                      )
                      .join('')
                  : `<tr><td colspan="5" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No supervisor accounts found.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  } else if (adminTab === 'employees') {
    const q = empSearch.trim().toLowerCase();
    const filtered = adminEmployees.filter((e) => {
      const matchesStatus = empStatusFilter === 'all' || (empStatusFilter === 'active' ? e.isActive : !e.isActive);
      const matchesSearch = !q || e.fullName.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });

    bodyHtml = `
      <section class="flex flex-col gap-4">
        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Employee Management</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Provision, edit, reset passwords, deactivate or reactivate employee accounts.</p>
          </div>
          <button type="button" data-open-admin-modal="add-employee" class="inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            Add Employee
          </button>
        </div>

        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="w-full sm:w-72 relative flex items-center">
            <i data-lucide="search" class="w-4 h-4 absolute left-3.5 text-light-on-surface-variant"></i>
            <input id="adminEmpSearch" type="search" value="${escapeHtml(empSearch)}" placeholder="Search employee..." class="w-full pl-10 pr-3.5 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
          </div>
          <div class="flex items-center gap-2">
            ${['active', 'inactive', 'all']
              .map((k) => {
                const active = empStatusFilter === k;
                const label = k === 'active' ? 'Active' : k === 'inactive' ? 'Deactivated' : 'All';
                return `<button type="button" data-admin-emp-filter="${k}" class="px-3 py-2 min-h-10 rounded font-label text-label-md ${active ? 'bg-light-primary text-light-on-primary' : 'bg-light-surface-container-low text-light-on-surface-variant border border-light-outline-variant'}">${label}</button>`;
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
                filtered.length > 0
                  ? filtered
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
                              <button type="button" data-open-admin-modal="edit-account" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant font-label text-label-sm hover:bg-light-surface-container-low">Edit</button>
                              <button type="button" data-open-admin-modal="reset-password" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-light-outline-variant font-label text-label-sm hover:bg-light-surface-container-low">Reset Password</button>
                              ${
                                emp.isActive
                                  ? `<button type="button" data-open-admin-modal="deactivate" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-leave/40 text-leave font-label text-label-sm hover:bg-leave-container/30">Deactivate</button>`
                                  : `<button type="button" data-open-admin-modal="reactivate" data-emp-id="${escapeHtml(emp.id)}" class="px-2.5 py-1.5 rounded border border-available/40 text-available font-label text-label-sm hover:bg-available-container/30">Reactivate</button>`
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
  } else if (adminTab === 'availability') {
    const rows = supData?.employees || [];
    const q = supSearch.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const matchesFilter = supFilter === 'all' || r.status === supFilter;
      const matchesSearch = !q || r.fullName.toLowerCase().includes(q) || r.employeeId.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });

    bodyHtml = `
      <section class="flex flex-col gap-4">
        <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="w-full sm:w-72 relative flex items-center">
            <i data-lucide="search" class="w-4 h-4 absolute left-3.5 text-light-on-surface-variant"></i>
            <input id="adminAvailSearch" type="search" value="${escapeHtml(supSearch)}" placeholder="Search name or ID..." class="w-full pl-10 pr-3.5 py-2 min-h-10 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${['all', 'office', 'wfh', 'leave', 'not-updated']
              .map((k) => {
                const label = k === 'all' ? 'All' : k === 'office' ? 'Office' : k === 'wfh' ? 'WFH' : k === 'leave' ? 'On Leave' : 'Not Updated';
                const active = supFilter === k;
                return `<button type="button" data-admin-avail-filter="${k}" class="px-3 py-2 min-h-10 rounded font-label text-label-md ${active ? 'bg-light-primary text-light-on-primary' : 'bg-light-surface-container-low text-light-on-surface-variant border border-light-outline-variant'}">${label}</button>`;
              })
              .join('')}
            <button type="button" id="adminExportCsvBtn" class="inline-flex items-center gap-2 px-4 py-2 min-h-10 rounded bg-light-primary text-light-on-primary font-label text-label-md">
              <i data-lucide="download" class="w-4 h-4"></i>
              Export CSV
            </button>
          </div>
        </div>

        <div class="w-full overflow-x-auto bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm">
          <table class="w-full text-left border-collapse">
            <thead class="bg-light-surface-container-low border-b border-light-outline-variant">
              <tr>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Team Member</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Role</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Status</th>
                <th class="px-5 py-3.5 font-label text-label-md text-light-on-surface-variant">Confidential Leave Reason</th>
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
                            <td class="px-5 py-3.5 font-label text-label-sm uppercase text-light-on-surface-variant">${escapeHtml(row.role)}</td>
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
                  : `<tr><td colspan="5" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No matching team members.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  } else if (adminTab === 'audit') {
    bodyHtml = `
      <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-sm overflow-hidden">
        <div class="p-5 border-b border-light-outline-variant">
          <h2 class="font-headline text-headline-md text-light-on-surface">Security & Activity Audit Logs</h2>
          <p class="font-body text-body-sm text-light-on-surface-variant">Tracks account provisioning, edits, password resets, deactivations, and login activity. Passwords and tokens are never logged.</p>
        </div>
        <div class="w-full overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-light-surface-container-low border-b border-light-outline-variant">
              <tr>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Timestamp (IST)</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Actor</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Action</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Target</th>
                <th class="px-5 py-3 font-label text-label-md text-light-on-surface-variant">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-light-outline-variant">
              ${
                auditLogs.length > 0
                  ? auditLogs
                      .map(
                        (log) => `
                        <tr class="hover:bg-light-surface-container-low/50">
                          <td class="px-5 py-3 font-mono text-mono-sm text-light-on-surface-variant whitespace-nowrap">${escapeHtml(formatDateTimeIst(log.createdAt))}</td>
                          <td class="px-5 py-3 font-body text-body-sm text-light-on-surface">${log.actorId ? `${escapeHtml(log.actorName)} (${escapeHtml(log.actorId)})` : 'System'}</td>
                          <td class="px-5 py-3"><span class="px-2.5 py-0.5 rounded-full bg-light-surface-container font-mono text-mono-sm text-light-on-surface">${escapeHtml(log.action)}</span></td>
                          <td class="px-5 py-3 font-body text-body-sm text-light-on-surface">${log.targetId ? `${escapeHtml(log.targetName)} (${escapeHtml(log.targetId)})` : '—'}</td>
                          <td class="px-5 py-3 font-mono text-mono-sm text-light-on-surface-variant">${escapeHtml(JSON.stringify(log.metadata || {}))}</td>
                        </tr>
                      `,
                      )
                      .join('')
                  : `<tr><td colspan="5" class="px-5 py-8 text-center font-body text-body-md text-light-on-surface-variant">No audit logs recorded yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  } else if (adminTab === 'settings') {
    bodyHtml = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Application Settings</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Master Admin system configuration.</p>
          </div>
          <form id="adminSettingsForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">Application Title</span>
              <input name="appTitle" type="text" maxlength="60" value="${escapeHtml(adminSettings?.appTitle || 'Team Leave Manager')}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
            </label>
            <label class="flex items-center gap-3 p-3 rounded border border-light-outline-variant cursor-pointer">
              <input name="allowPasskeys" type="checkbox" ${adminSettings?.allowPasskeys !== false ? 'checked' : ''} class="rounded text-light-primary">
              <span class="font-body text-body-md text-light-on-surface">Allow WebAuthn Device Passkeys</span>
            </label>
            <div class="text-xs font-mono text-light-on-surface-variant bg-light-surface-container-low p-3 rounded border border-light-outline-variant">
              Initial Master Admin Provisioning Lock: <strong>${adminSettings?.initialSetupCompleted ? 'LOCKED (Completed)' : 'Pending'}</strong>
            </div>
            <button type="submit" class="self-start px-4 py-2.5 rounded bg-light-primary text-light-on-primary font-label text-label-md">Save Settings</button>
          </form>
        </section>

        <section class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-6 shadow-sm flex flex-col gap-4">
          <div>
            <h2 class="font-headline text-headline-md text-light-on-surface">Change Master Admin Password</h2>
            <p class="font-body text-body-sm text-light-on-surface-variant">Update your own Master Admin credentials.</p>
          </div>
          <form id="adminSelfPasswordForm" class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">Current Password</span>
              <input name="currentPassword" type="password" required class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono">
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="font-label text-label-md text-light-on-surface">New Password (4–64 chars, no spaces)</span>
              <input name="newPassword" type="password" minlength="4" maxlength="64" required class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono">
            </label>
            <button type="submit" class="self-start px-4 py-2.5 rounded bg-light-primary text-light-on-primary font-label text-label-md">Update Password</button>
          </form>
        </section>
      </div>
    `;
  }

  return `
    <div class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center gap-2">
        ${tabs.map(([k, l, i]) => tabBtn(k, l, i)).join('')}
      </div>

      ${
        adminNotice
          ? `<div role="status" class="bg-available-container border border-available/40 rounded-md px-4 py-3 flex items-center justify-between gap-3">
              <span class="font-body text-body-sm text-on-available-container">${escapeHtml(adminNotice)}</span>
              <button type="button" data-action="dismiss-admin-notice" class="font-label text-label-sm text-on-available-container hover:underline">Dismiss</button>
            </div>`
          : ''
      }
      ${
        adminError
          ? `<div role="alert" class="bg-error-container border border-light-error/30 rounded-md px-4 py-3">
              <span class="font-body text-body-sm text-light-on-error-container">${escapeHtml(adminError)}</span>
            </div>`
          : ''
      }

      ${bodyHtml}
      ${adminModal ? renderAccountModal(adminModal, [...adminEmployees, ...adminSupervisors], true) : ''}
      ${oneTimePasswordModal ? renderOneTimePasswordModal(oneTimePasswordModal) : ''}
    </div>
  `;
}

function summaryCard(title, val, sub, icon, borderCls, valCls, iconCls) {
  return `
    <article class="bg-light-surface-container-lowest border ${borderCls} rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
      <div class="flex flex-col gap-0.5 min-w-0">
        <span class="font-label text-label-md text-light-on-surface-variant">${escapeHtml(title)}</span>
        <span class="font-headline text-display-lg text-${valCls.replace('text-', '')} ${valCls} tabular-nums">${val}</span>
        <span class="font-body text-body-sm text-light-on-surface-variant">${escapeHtml(sub)}</span>
      </div>
      <div class="w-11 h-11 rounded-md ${iconCls} flex items-center justify-center shrink-0">
        <i data-lucide="${icon}" class="w-5 h-5" aria-hidden="true"></i>
      </div>
    </article>
  `;
}

export function renderAccountModal(modal, accounts, isMasterAdmin) {
  const emp = modal.empId ? accounts.find((e) => e.id === modal.empId) : null;
  let title = '';
  let body = '';

  if (modal.type === 'add-employee' || modal.type === 'add-supervisor') {
    const isSup = modal.type === 'add-supervisor';
    title = isSup ? 'Add New Supervisor' : 'Add New Employee';
    body = `
      <form id="accountModalForm" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Full Name</span>
          <input name="fullName" type="text" required placeholder="${isSup ? 'e.g. Priya Nair' : 'e.g. Ananya Rao'}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">${isSup ? 'Unique Supervisor ID' : 'Unique Employee ID'}</span>
          <input name="employeeId" type="text" required placeholder="${isSup ? 'e.g. SUP-03' : 'e.g. EMP-113'}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md uppercase">
        </label>
        <label class="flex items-center gap-2.5 text-sm cursor-pointer">
          <input id="autoGenPwdChk" name="generatePassword" type="checkbox" checked class="rounded text-light-primary">
          <span class="font-label text-label-md text-light-on-surface">Auto-generate secure temporary password (shown once)</span>
        </label>
        <label id="manualPwdGroup" class="hidden flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Initial Temporary Password / PIN (4–64 chars)</span>
          <input id="manualPwdInput" name="initialPassword" type="password" minlength="4" maxlength="64" placeholder="Enter initial password" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Account Status</span>
          <select name="isActive" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
            <option value="true" selected>Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-light-primary text-light-on-primary font-label text-label-md">Create Account</button>
        </div>
      </form>
    `;
  } else if (modal.type === 'edit-account' && emp) {
    title = `Edit ${emp.fullName}`;
    body = `
      <form id="accountModalForm" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Full Name</span>
          <input name="fullName" type="text" required value="${escapeHtml(emp.fullName)}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">User ID</span>
          <input name="employeeId" type="text" required value="${escapeHtml(emp.employeeId)}" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md uppercase">
        </label>
        ${
          isMasterAdmin
            ? `<label class="flex flex-col gap-1.5">
                <span class="font-label text-label-md text-light-on-surface">Role</span>
                <select name="role" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-body text-body-md">
                  <option value="employee" ${emp.role === 'employee' ? 'selected' : ''}>Employee</option>
                  <option value="supervisor" ${emp.role === 'supervisor' ? 'selected' : ''}>Supervisor</option>
                </select>
              </label>`
            : ''
        }
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-light-primary text-light-on-primary font-label text-label-md">Save Changes</button>
        </div>
      </form>
    `;
  } else if ((modal.type === 'reset-password' || modal.type === 'reactivate') && emp) {
    const isReactivate = modal.type === 'reactivate';
    title = isReactivate ? `Reactivate ${emp.fullName}` : `Reset Password — ${emp.fullName}`;
    body = `
      <form id="accountModalForm" class="flex flex-col gap-4">
        <p class="font-body text-body-sm text-light-on-surface-variant">
          ${isReactivate ? 'Reactivating requires a fresh temporary password.' : 'Resetting the password will revoke active sessions and require a password change on next login.'}
        </p>
        <label class="flex items-center gap-2.5 text-sm cursor-pointer">
          <input id="autoGenPwdChk" name="generatePassword" type="checkbox" checked class="rounded text-light-primary">
          <span class="font-label text-label-md text-light-on-surface">Auto-generate temporary password (shown once)</span>
        </label>
        <label id="manualPwdGroup" class="hidden flex-col gap-1.5">
          <span class="font-label text-label-md text-light-on-surface">Temporary Password / PIN (4–64 chars)</span>
          <input id="manualPwdInput" name="newPassword" type="password" minlength="4" maxlength="64" class="px-3.5 py-2.5 rounded border border-light-outline-variant bg-light-surface font-mono text-mono-md">
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded ${isReactivate ? 'bg-available text-on-available' : 'bg-light-primary text-light-on-primary'} font-label text-label-md">${isReactivate ? 'Reactivate Account' : 'Reset Password'}</button>
        </div>
      </form>
    `;
  } else if (modal.type === 'deactivate' && emp) {
    title = `Deactivate ${emp.fullName}?`;
    body = `
      <form id="accountModalForm" class="flex flex-col gap-4">
        <p class="font-body text-body-md text-light-on-surface-variant">Deactivating <strong>${escapeHtml(emp.employeeId)}</strong> will immediately revoke login access and active sessions while preserving audit history.</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="px-4 py-2 rounded border border-light-outline-variant font-label text-label-md">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded bg-leave text-on-leave font-label text-label-md">Confirm Deactivation</button>
        </div>
      </form>
    `;
  }

  return `
    <div class="fixed inset-0 z-50 bg-light-scrim/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-lg w-full max-w-md p-6 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-headline text-headline-md text-light-on-surface">${escapeHtml(title)}</h3>
          <button type="button" data-close-modal class="p-1 text-light-on-surface-variant hover:text-light-on-surface" aria-label="Close"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        ${modal.error ? `<div role="alert" class="p-3 rounded bg-error-container text-light-on-error-container font-body text-body-sm">${escapeHtml(modal.error)}</div>` : ''}
        ${body}
      </div>
    </div>
  `;
}

export function renderOneTimePasswordModal(info) {
  return `
    <div class="fixed inset-0 z-50 bg-light-scrim/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md shadow-lg w-full max-w-md p-6 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-warning-container text-warning flex items-center justify-center shrink-0">
            <i data-lucide="key-round" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="font-headline text-headline-md text-light-on-surface">Temporary Password (Shown Once)</h3>
            <p class="font-body text-body-sm text-light-on-surface-variant">Share this privately with <strong>${escapeHtml(info.employeeId)}</strong>. It cannot be retrieved again.</p>
          </div>
        </div>
        <div class="p-4 rounded bg-light-surface-container-low border border-light-outline-variant flex items-center justify-between gap-3">
          <code id="oneTimePwdValue" class="font-mono text-headline-sm text-light-on-surface select-all">${escapeHtml(info.password)}</code>
          <button type="button" id="copyOneTimePwdBtn" class="px-3 py-1.5 rounded bg-light-primary text-light-on-primary font-label text-label-sm">Copy</button>
        </div>
        <button type="button" data-close-one-time-pwd class="w-full py-2.5 rounded border border-light-outline-variant font-label text-label-md hover:bg-light-surface-container-low">I have saved this password</button>
      </div>
    </div>
  `;
}

export function bindMasterAdminEvents(root, state, { refreshMasterAdmin, refreshPublic, onStateChange }) {
  root.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminTab = btn.dataset.adminTab;
      onStateChange();
    });
  });

  const empSearch = root.querySelector('#adminEmpSearch');
  if (empSearch) {
    empSearch.addEventListener('input', (e) => {
      state.empSearch = e.target.value;
      onStateChange({ preserveFocusId: 'adminEmpSearch', cursorPos: e.target.selectionStart });
    });
  }

  const availSearch = root.querySelector('#adminAvailSearch');
  if (availSearch) {
    availSearch.addEventListener('input', (e) => {
      state.supSearch = e.target.value;
      onStateChange({ preserveFocusId: 'adminAvailSearch', cursorPos: e.target.selectionStart });
    });
  }

  root.querySelectorAll('[data-admin-emp-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.empStatusFilter = btn.dataset.adminEmpFilter;
      onStateChange();
    });
  });

  root.querySelectorAll('[data-admin-avail-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.supFilter = btn.dataset.adminAvailFilter;
      onStateChange();
    });
  });

  const dismissBtn = root.querySelector('[data-action="dismiss-admin-notice"]');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      state.adminNotice = '';
      onStateChange();
    });
  }

  const exportBtn = root.querySelector('#adminExportCsvBtn');
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
        ['User ID', 'Full Name', 'Role', 'Status', 'Leave Reason', 'Last Updated (IST)'].map(csvCell).join(','),
        ...rows.map((r) =>
          [r.employeeId, r.fullName, r.role, r.status, r.status === 'leave' ? r.leaveReason || '' : '', r.updatedAt ? formatIstTimestamp(r.updatedAt) : '']
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
    });
  }

  root.querySelectorAll('[data-open-admin-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminModal = { type: btn.dataset.openAdminModal, empId: btn.dataset.empId || null, error: '' };
      onStateChange();
    });
  });

  root.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.adminModal = null;
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
  if (modalForm && state.adminModal) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(modalForm);
      const modal = state.adminModal;
      modal.error = '';

      try {
        if (modal.type === 'add-employee' || modal.type === 'add-supervisor') {
          const gen = Boolean(fd.get('generatePassword'));
          const empId = fd.get('employeeId').toString().trim().toUpperCase();
          const res = await api.createAccount({
            fullName: fd.get('fullName').toString().trim(),
            employeeId: empId,
            role: modal.type === 'add-supervisor' ? 'supervisor' : 'employee',
            generatePassword: gen,
            initialPassword: gen ? '' : fd.get('initialPassword').toString(),
            isActive: fd.get('isActive') === 'true',
          });
          state.adminNotice = `${modal.type === 'add-supervisor' ? 'Supervisor' : 'Employee'} ${empId} created.`;
          if (res.temporaryPassword) {
            state.oneTimePasswordModal = { employeeId: empId, password: res.temporaryPassword };
          }
        } else if (modal.type === 'edit-account') {
          await api.updateAccount(modal.empId, {
            action: 'edit',
            fullName: fd.get('fullName').toString().trim(),
            employeeId: fd.get('employeeId').toString().trim().toUpperCase(),
            role: fd.get('role').toString(),
          });
          state.adminNotice = 'Account details updated.';
        } else if (modal.type === 'reset-password' || modal.type === 'reactivate') {
          const gen = Boolean(fd.get('generatePassword'));
          const targetAcc = [...(state.adminEmployees || []), ...(state.adminSupervisors || [])].find((x) => x.id === modal.empId);
          const res = await api.updateAccount(modal.empId, {
            action: modal.type === 'reactivate' ? 'reactivate' : 'reset_password',
            generatePassword: gen,
            newPassword: gen ? '' : fd.get('newPassword').toString(),
          });
          state.adminNotice = modal.type === 'reactivate' ? 'Account reactivated.' : 'Password reset and sessions revoked.';
          if (res.temporaryPassword) {
            state.oneTimePasswordModal = { employeeId: targetAcc?.employeeId || 'Account', password: res.temporaryPassword };
          }
        } else if (modal.type === 'deactivate') {
          await api.updateAccount(modal.empId, { action: 'deactivate' });
          state.adminNotice = 'Account deactivated and active sessions revoked.';
        }

        state.adminModal = null;
        await Promise.all([refreshMasterAdmin(), refreshPublic()]);
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

  const settingsForm = root.querySelector('#adminSettingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(settingsForm);
      try {
        await api.updateAdminSettings({
          appTitle: fd.get('appTitle').toString().trim(),
          allowPasskeys: Boolean(fd.get('allowPasskeys')),
        });
        state.adminNotice = 'Application settings updated.';
        await refreshMasterAdmin();
        onStateChange();
      } catch (err) {
        state.adminError = err.message || 'Failed to update settings.';
        onStateChange();
      }
    });
  }

  const selfPwdForm = root.querySelector('#adminSelfPasswordForm');
  if (selfPwdForm) {
    selfPwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(selfPwdForm);
      try {
        await api.changePassword(fd.get('currentPassword').toString(), fd.get('newPassword').toString());
        state.adminNotice = 'Master Admin password updated.';
        state.adminError = '';
        selfPwdForm.reset();
        onStateChange();
      } catch (err) {
        state.adminError = err.message || 'Could not update password.';
        onStateChange();
      }
    });
  }

  renderIcons(root);
}
