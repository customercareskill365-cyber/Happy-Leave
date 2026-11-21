import './styles/main.css';
import { api } from './lib/api.js';
import { formatIstClock, formatIstDate } from './lib/ist.js';
import { renderIcons } from './lib/icons.js';
import { renderShell } from './components/shell.js';
import { renderDashboardView, bindDashboardEvents } from './views/dashboard.js';
import { renderLoginView, bindLoginEvents } from './views/login.js';
import { renderUpdateStatusView, bindUpdateStatusEvents } from './views/updateStatus.js';
import { renderSupervisorView, bindSupervisorEvents } from './views/supervisor.js';
import { renderMasterAdminView, bindMasterAdminEvents } from './views/masterAdmin.js';

const app = document.getElementById('app');

const state = {
  route: normalizeRoute(window.location.pathname),
  user: null,
  publicData: null,
  publicLoading: true,
  publicError: '',
  lastSyncedAt: null,
  lastFetchedMs: 0,

  dashboardFilter: 'all',
  dashboardSearch: '',

  loginError: '',
  loginSuccess: '',
  loginLoading: false,
  passkeySupported: typeof window !== 'undefined' && Boolean(window.PublicKeyCredential),

  statusForm: {
    selectedStatus: null,
    leaveCategory: 'Sick Leave',
    leaveNote: '',
    submitting: false,
    successMessage: '',
    errorMessage: '',
    securityMessage: '',
    securityError: '',
  },

  supTab: 'availability',
  supData: null,
  supEmployees: null,
  supAuditLogs: [],
  supLoading: false,
  supError: '',
  supFilter: 'all',
  supSearch: '',
  empSearch: '',
  empStatusFilter: 'active',
  supModal: null,
  supNotice: '',

  adminTab: 'dashboard',
  adminEmployees: [],
  adminSupervisors: [],
  auditLogs: [],
  adminSettings: null,
  adminLoading: false,
  adminError: '',
  adminNotice: '',
  adminModal: null,
  oneTimePasswordModal: null,
};

function normalizeRoute(pathname) {
  if (pathname === '/update' || pathname === '/login' || pathname === '/supervisor' || pathname === '/admin') {
    return pathname;
  }
  return '/';
}

function navigate(path) {
  const url = new URL(path, window.location.origin);
  window.history.pushState({}, '', url.pathname + url.search);
  state.route = normalizeRoute(url.pathname);
  if (state.route === '/admin' && state.user?.role === 'master_admin') {
    refreshMasterAdmin();
  } else if (state.route === '/supervisor' && (state.user?.role === 'supervisor' || state.user?.role === 'master_admin')) {
    refreshSupervisor();
  }
  render();
}

async function refreshSession() {
  try {
    const res = await api.getSession();
    state.user = res.user || null;
    if (state.user && state.user.todayStatus && state.user.todayStatus !== 'not-updated') {
      if (!state.statusForm.selectedStatus) {
        state.statusForm.selectedStatus = state.user.todayStatus;
      }
    } else {
      state.statusForm.selectedStatus = null;
    }
  } catch {
    state.user = null;
  }
}

async function refreshPublic() {
  try {
    const data = await api.getPublicAvailability();
    state.publicData = data;
    state.publicError = '';
    state.lastSyncedAt = new Date().toISOString();
    state.lastFetchedMs = Date.now();
  } catch (err) {
    state.publicError = err.message || 'Failed to load availability.';
  } finally {
    state.publicLoading = false;
  }
}

async function refreshSupervisor() {
  if (!state.user || (state.user.role !== 'supervisor' && state.user.role !== 'master_admin')) return;
  state.supLoading = true;
  try {
    const [avail, emps, logs] = await Promise.all([
      api.getSupervisorDashboard(),
      api.getAccounts('employee'),
      api.getAuditLogs(100),
    ]);
    state.supData = avail;
    state.supEmployees = emps.employees || [];
    state.supAuditLogs = logs.logs || [];
    state.supError = '';
    state.lastSyncedAt = new Date().toISOString();
    state.lastFetchedMs = Date.now();
  } catch (err) {
    state.supError = err.message || 'Failed to load supervisor data.';
  } finally {
    state.supLoading = false;
    render();
  }
}

async function refreshMasterAdmin() {
  if (!state.user || state.user.role !== 'master_admin') return;
  state.adminLoading = true;
  try {
    const [avail, emps, sups, logs, settings] = await Promise.all([
      api.getSupervisorDashboard(),
      api.getAccounts('employee'),
      api.getAccounts('supervisor'),
      api.getAuditLogs(150),
      api.getAdminSettings(),
    ]);
    state.supData = avail;
    state.adminEmployees = emps.employees || [];
    state.adminSupervisors = sups.employees || [];
    state.auditLogs = logs.logs || [];
    state.adminSettings = settings.settings || null;
    state.adminError = '';
    state.lastSyncedAt = new Date().toISOString();
    state.lastFetchedMs = Date.now();
  } catch (err) {
    state.adminError = err.message || 'Failed to load Master Admin data.';
  } finally {
    state.adminLoading = false;
    render();
  }
}

function render(opts = {}) {
  if (state.user?.mustChangePin && state.route !== '/login') {
    state.route = '/login';
  }

  if (state.route === '/login') {
    app.innerHTML = renderLoginView(state);
    bindLoginEvents(app, state, {
      navigate,
      refreshSession,
      refreshPublic,
      onStateChange: render,
    });
  } else {
    let title = 'Team Leave Manager';
    let subtitle = 'Public daily work location & availability — Resets 12:00 AM IST';
    let roleBadgeText = '';
    let headerActionsHtml =
      state.user?.role === 'master_admin'
        ? ''
        : `
          <a href="/update" data-link class="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-10 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
            <i data-lucide="user-check" class="w-4 h-4" aria-hidden="true"></i>
            <span class="font-label text-label-md">Update My Status</span>
          </a>
        `;
    let contentHtml = '';

    if (state.route === '/') {
      contentHtml = renderDashboardView(state);
    } else if (state.route === '/update') {
      title = 'Update My Status';
      subtitle = "Verify your identity to set today's work location or leave";
      headerActionsHtml = '';
      contentHtml = renderUpdateStatusView(state);
    } else if (state.route === '/supervisor') {
      title = 'Supervisor Dashboard';
      subtitle = 'Authorized shift oversight, confidential leave reasons & employee management';
      roleBadgeText = 'Supervisor Access';
      headerActionsHtml = '';
      contentHtml = renderSupervisorView(state);
    } else if (state.route === '/admin') {
      title = 'Master Admin Dashboard';
      subtitle = 'Centralized supervisor, employee, availability & security governance';
      roleBadgeText = 'Master Admin';
      headerActionsHtml = '';
      contentHtml = renderMasterAdminView(state);
    }

    app.innerHTML = renderShell({
      activeRoute: state.route,
      title,
      subtitle,
      user: state.user,
      lastSyncedAt: state.lastSyncedAt,
      roleBadgeText,
      headerActionsHtml,
      contentHtml,
    });

    if (state.route === '/') {
      bindDashboardEvents(app, state, { onStateChange: render });
    } else if (state.route === '/update') {
      bindUpdateStatusEvents(app, state, { refreshSession, refreshPublic, onStateChange: render });
    } else if (state.route === '/supervisor') {
      bindSupervisorEvents(app, state, { refreshSupervisor, refreshPublic, onStateChange: render });
    } else if (state.route === '/admin') {
      bindMasterAdminEvents(app, state, { refreshMasterAdmin, refreshPublic, onStateChange: render });
    }
  }

  app.querySelectorAll('a[data-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.getAttribute('href'));
    });
  });

  app.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.logout().catch(() => {});
      state.user = null;
      state.supData = null;
      state.supEmployees = null;
      state.adminEmployees = [];
      state.adminSupervisors = [];
      state.auditLogs = [];
      state.statusForm.selectedStatus = null;
      navigate('/');
    });
  });

  app.querySelectorAll('[data-action="manual-sync"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await refreshPublic();
      if (state.route === '/admin' && state.user?.role === 'master_admin') {
        await refreshMasterAdmin();
      } else if (state.route === '/supervisor' && (state.user?.role === 'supervisor' || state.user?.role === 'master_admin')) {
        await refreshSupervisor();
      } else {
        render();
      }
    });
  });

  renderIcons(app);

  if (opts.preserveFocusId) {
    const el = document.getElementById(opts.preserveFocusId);
    if (el) {
      el.focus();
      if (typeof opts.cursorPos === 'number' && el.setSelectionRange) {
        el.setSelectionRange(opts.cursorPos, opts.cursorPos);
      }
    }
  }
}

// Live IST clock display updater (client-side UI clock only)
setInterval(() => {
  const clockEl = document.getElementById('istClockText');
  const dateEl = document.getElementById('istDateText');
  if (clockEl) clockEl.textContent = formatIstClock();
  if (dateEl) dateEl.textContent = formatIstDate();
}, 15000);

// Credit-friendly focus refresh (only if >= 10 minutes since last fetch, allowing Netlify DB to sleep!)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - state.lastFetchedMs < 10 * 60 * 1000) return;
  await refreshPublic();
  if (state.route === '/admin' && state.user?.role === 'master_admin') {
    await refreshMasterAdmin();
  } else if (state.route === '/supervisor' && (state.user?.role === 'supervisor' || state.user?.role === 'master_admin')) {
    await refreshSupervisor();
  } else if (state.route === '/') {
    render();
  }
});

window.addEventListener('popstate', () => {
  state.route = normalizeRoute(window.location.pathname);
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

(async function init() {
  render();
  await Promise.all([refreshSession(), refreshPublic()]);
  if (state.route === '/admin' && state.user?.role === 'master_admin') {
    await refreshMasterAdmin();
  } else if (state.route === '/supervisor' && (state.user?.role === 'supervisor' || state.user?.role === 'master_admin')) {
    await refreshSupervisor();
  } else {
    render();
  }
})();
