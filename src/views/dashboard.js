import { escapeHtml, getInitials } from '../lib/escape.js';
import { formatIstTimestamp } from '../lib/ist.js';
import { renderIcons } from '../lib/icons.js';

const STATUS_CFG = {
  office: {
    label: 'Office',
    cardStyle: 'bg-light-surface-container-lowest border-light-outline-variant',
    avatarStyle: 'bg-available-container text-on-available-container',
    badgeStyle: 'bg-available-container text-on-available-container',
    dotStyle: 'bg-available',
  },
  wfh: {
    label: 'WFH',
    cardStyle: 'bg-light-surface-container-lowest border-light-tertiary/30',
    avatarStyle: 'bg-light-tertiary-container text-light-on-tertiary-container',
    badgeStyle: 'bg-light-tertiary-container text-light-on-tertiary-container',
    dotStyle: 'bg-light-tertiary',
  },
  leave: {
    label: 'On Leave',
    cardStyle: 'bg-leave-container/25 border-leave/50',
    avatarStyle: 'bg-leave-container text-on-leave-container',
    badgeStyle: 'bg-leave-container text-on-leave-container',
    dotStyle: 'bg-leave',
  },
  'not-updated': {
    label: 'Not Updated',
    cardStyle: 'bg-light-surface-container-low/60 border-light-outline-variant',
    avatarStyle: 'bg-light-surface-container text-light-on-surface-variant',
    badgeStyle: 'bg-light-surface-container text-light-on-surface-variant',
    dotStyle: 'bg-light-outline',
  },
};

export function renderDashboardView(state) {
  const { publicData, publicLoading, publicError, dashboardFilter, dashboardSearch } = state;

  if (publicLoading && !publicData) {
    return `
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-10 text-center flex flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-full border-2 border-light-primary border-t-transparent animate-spin"></div>
        <p class="font-body text-body-md text-light-on-surface-variant">Loading today's team availability...</p>
      </div>
    `;
  }

  if (publicError && !publicData) {
    return `
      <div class="bg-error-container border border-light-error/30 rounded-md p-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <i data-lucide="alert-circle" class="w-5 h-5 text-light-error shrink-0"></i>
          <div>
            <p class="font-label text-label-lg text-light-on-error-container">Unable to load team availability</p>
            <p class="font-body text-body-sm text-light-on-error-container">${escapeHtml(publicError)}</p>
          </div>
        </div>
        <button type="button" data-action="manual-sync" class="px-4 py-2 rounded bg-light-primary text-light-on-primary font-label text-label-md">Retry</button>
      </div>
    `;
  }

  const employees = publicData?.employees || [];
  const counts = publicData?.counts || { total: 0, office: 0, wfh: 0, leave: 0, notUpdated: 0 };

  const filterBtn = (key, label, count) => {
    const active = dashboardFilter === key;
    const cls = active
      ? 'px-3 py-2 min-h-10 rounded bg-light-primary text-light-on-primary font-label text-label-md transition-colors duration-state-change'
      : 'px-3 py-2 min-h-10 rounded bg-light-surface-container-low text-light-on-surface-variant border border-light-outline-variant hover:bg-light-surface-container font-label text-label-md transition-colors duration-state-change';
    return `<button type="button" data-filter="${key}" class="${cls}">${escapeHtml(label)} (${count})</button>`;
  };

  const filtered = employees.filter((emp) => {
    const matchesFilter = dashboardFilter === 'all' || emp.status === dashboardFilter;
    const q = dashboardSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      emp.fullName.toLowerCase().includes(q) ||
      emp.employeeId.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const cardsHtml =
    filtered.length > 0
      ? `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 md:gap-4 items-stretch">
        ${filtered
          .map((emp) => {
            const cfg = STATUS_CFG[emp.status] || STATUS_CFG['not-updated'];
            const updatedText = emp.updatedAt ? formatIstTimestamp(emp.updatedAt) : 'Pending';
            return `
              <article class="${cfg.cardStyle} border rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-full ${cfg.avatarStyle} flex items-center justify-center shrink-0">
                    <span class="font-headline text-headline-sm">${escapeHtml(getInitials(emp.fullName))}</span>
                  </div>
                  <div class="min-w-0">
                    <h2 class="font-headline text-headline-sm text-light-on-surface truncate">${escapeHtml(emp.fullName)}</h2>
                    <p class="font-mono text-mono-sm text-light-on-surface-variant tabular-nums truncate">${escapeHtml(emp.employeeId)} • ${escapeHtml(updatedText)}</p>
                  </div>
                </div>
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.badgeStyle} shrink-0">
                  <span class="w-2 h-2 rounded-full ${cfg.dotStyle}" aria-hidden="true"></span>
                  <span class="font-label text-label-sm">${cfg.label}</span>
                </span>
              </article>
            `;
          })
          .join('')}
      </div>
    `
      : `
      <div class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-10 text-center flex flex-col items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-light-surface-container text-light-on-surface-variant flex items-center justify-center">
          <i data-lucide="users" class="w-6 h-6" aria-hidden="true"></i>
        </div>
        <h2 class="font-headline text-headline-md text-light-on-surface">No matching employees</h2>
        <p class="font-body text-body-md text-light-on-surface-variant max-w-md">
          ${employees.length === 0 ? 'No active employees have been added yet.' : 'Try clearing your search query or switching back to All.'}
        </p>
      </div>
    `;

  return `
    <!-- Summary KPI Cards -->
    <section aria-label="Team Availability Summary" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 items-stretch">
      <article class="col-span-2 sm:col-span-1 bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="font-label text-label-md text-light-on-surface-variant">Total Active</span>
          <span class="font-headline text-display-lg-mobile md:text-display-lg text-light-on-surface tabular-nums">${counts.total}</span>
          <span class="font-body text-body-sm text-light-on-surface-variant">Active team</span>
        </div>
        <div class="w-11 h-11 rounded-md bg-light-surface-container text-light-primary flex items-center justify-center shrink-0">
          <i data-lucide="users" class="w-5 h-5" aria-hidden="true"></i>
        </div>
      </article>

      <article class="bg-light-surface-container-lowest border border-available/30 rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="font-label text-label-md text-on-available-container">Office</span>
          <span class="font-headline text-display-lg-mobile md:text-display-lg text-available tabular-nums">${counts.office}</span>
          <span class="font-body text-body-sm text-light-on-surface-variant">From Office</span>
        </div>
        <div class="w-11 h-11 rounded-md bg-available-container text-on-available-container flex items-center justify-center shrink-0">
          <i data-lucide="building-2" class="w-5 h-5" aria-hidden="true"></i>
        </div>
      </article>

      <article class="bg-light-surface-container-lowest border border-light-tertiary/30 rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="font-label text-label-md text-light-on-tertiary-container">WFH</span>
          <span class="font-headline text-display-lg-mobile md:text-display-lg text-light-tertiary tabular-nums">${counts.wfh}</span>
          <span class="font-body text-body-sm text-light-on-surface-variant">From Home</span>
        </div>
        <div class="w-11 h-11 rounded-md bg-light-tertiary-container text-light-on-tertiary-container flex items-center justify-center shrink-0">
          <i data-lucide="laptop" class="w-5 h-5" aria-hidden="true"></i>
        </div>
      </article>

      <article class="bg-light-surface-container-lowest border border-leave/30 rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="font-label text-label-md text-on-leave-container">On Leave</span>
          <span class="font-headline text-display-lg-mobile md:text-display-lg text-leave tabular-nums">${counts.leave}</span>
          <span class="font-body text-body-sm text-light-on-surface-variant">Unavailable</span>
        </div>
        <div class="w-11 h-11 rounded-md bg-leave-container text-on-leave-container flex items-center justify-center shrink-0">
          <i data-lucide="user-x" class="w-5 h-5" aria-hidden="true"></i>
        </div>
      </article>

      <article class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex items-center justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="font-label text-label-md text-light-on-surface-variant">Not Updated</span>
          <span class="font-headline text-display-lg-mobile md:text-display-lg text-light-on-surface-variant tabular-nums">${counts.notUpdated}</span>
          <span class="font-body text-body-sm text-light-on-surface-variant">Pending</span>
        </div>
        <div class="w-11 h-11 rounded-md bg-light-surface-container text-light-on-surface-variant flex items-center justify-center shrink-0">
          <i data-lucide="clock" class="w-5 h-5" aria-hidden="true"></i>
        </div>
      </article>
    </section>

    <!-- Search, Filters & Status Legend -->
    <section aria-label="Employee Availability Controls" class="bg-light-surface-container-lowest border border-light-outline-variant rounded-md p-4 shadow-sm flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="w-full sm:w-80 relative flex items-center">
          <span aria-hidden="true" class="absolute left-3.5 text-light-on-surface-variant pointer-events-none">
            <i data-lucide="search" class="w-4 h-4"></i>
          </span>
          <input id="dashboardSearchInput" type="search" value="${escapeHtml(dashboardSearch)}" aria-label="Search employees by name or ID" placeholder="Search employees by name or ID..." class="w-full pl-10 pr-3.5 py-2.5 min-h-11 rounded border border-light-outline-variant bg-light-surface text-light-on-surface font-body text-body-md placeholder:text-light-on-surface-variant focus:border-light-primary focus:ring-2 focus:ring-light-primary/20 focus:outline-none">
        </div>

        <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by daily status">
          ${filterBtn('all', 'All', counts.total)}
          ${filterBtn('office', 'Office', counts.office)}
          ${filterBtn('wfh', 'WFH', counts.wfh)}
          ${filterBtn('leave', 'On Leave', counts.leave)}
          ${filterBtn('not-updated', 'Not Updated', counts.notUpdated)}
        </div>
      </div>

      <div class="pt-3 border-t border-light-outline-variant flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-4">
          <span class="font-label text-label-sm text-light-on-surface-variant">Status Legend:</span>
          <span class="inline-flex items-center gap-1.5 font-body text-body-sm text-light-on-surface"><span class="w-2.5 h-2.5 rounded-full bg-available"></span>Office</span>
          <span class="inline-flex items-center gap-1.5 font-body text-body-sm text-light-on-surface"><span class="w-2.5 h-2.5 rounded-full bg-light-tertiary"></span>WFH</span>
          <span class="inline-flex items-center gap-1.5 font-body text-body-sm text-light-on-surface"><span class="w-2.5 h-2.5 rounded-full bg-leave"></span>On Leave</span>
          <span class="inline-flex items-center gap-1.5 font-body text-body-sm text-light-on-surface"><span class="w-2.5 h-2.5 rounded-full bg-light-outline"></span>Not Updated</span>
        </div>
        <span class="font-body text-body-sm text-light-on-surface-variant">Leave reasons are confidential and restricted to supervisors</span>
      </div>
    </section>

    <!-- Employee Availability Grid -->
    <section aria-label="Team Roster">
      ${cardsHtml}
    </section>
  `;
}

export function bindDashboardEvents(root, state, { onStateChange }) {
  const searchInput = root.querySelector('#dashboardSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.dashboardSearch = e.target.value;
      onStateChange({ preserveFocusId: 'dashboardSearchInput', cursorPos: e.target.selectionStart });
    });
  }

  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.dashboardFilter = btn.dataset.filter;
      onStateChange();
    });
  });

  renderIcons(root);
}
