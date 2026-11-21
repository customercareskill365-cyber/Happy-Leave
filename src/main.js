import './styles/main.css';
import { api } from './lib/api.js';
import { formatIstClock, formatIstDate } from './lib/ist.js';
import { renderIcons } from './lib/icons.js';
import { renderShell } from './components/shell.js';
import { renderDashboardView, bindDashboardEvents } from './views/dashboard.js';
import { renderLoginView, bindLoginEvents } from './views/login.js';
import { renderUpdateStatusView, bindUpdateStatusEvents } from './views/updateStatus.js';
import { renderSupervisorView, bindSupervisorEvents } from './views/supervisor.js';

const app = document.getElementById('app');

const state = {
  route: normalizeRoute(window.location.pathname),
  user: null,
  publicData: null,
  publicLoading: true,
  publicError: '',
  lastSyncedAt: null,

  dashboardFilter: 'all',
  dashboardSearch: '',

  loginTab: 'employee',
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
  supLoading: false,
  supError: '',
  supFilter: 'all',
  supSearch: '',
  empSearch: '',
  empStatusFilter: 'active',
  supModal: null,
  supNotice: '',
};

function normalizeRoute(pathname) {
  if (pathname === '/update' || pathname === '/login' || pathname === '/supervisor') {
    return pathname;
  }
  return '/';
}

function navigate(path) {
  const url = new URL(path, window.location.origin);
  window.history.pushState({}, '', url.pathname + url.search);
  state.route = normalizeRoute(url.pathname);
  if (state.route === '/supervisor' && state.user?.role === 'supervisor') {
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
  } catch (err) {
    state.publicError = err.message || 'Failed to load availability.';
  } finally {
    state.publicLoading = false;
  }
}

async function refreshSupervisor() {
  if (!state.user || state.user.role !== 'supervisor') return;
  state.supLoading = true;
  try {
    const [avail, emps] = await Promise.all([api.getSupervisorDashboard(), api.getEmployees()]);
    state.supData = avail;
    state.supEmployees = emps.employees || [];
    state.supError = '';
    state.lastSyncedAt = new Date().toISOString();
  } catch (err) {
    state.supError = err.message || 'Failed to load supervisor data.';
  } finally {
    state.supLoading = false;
    render();
  }
}

function render(opts = {}) {
  // Enforce mandatory PIN change if logged in with temporary PIN
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
    let isSupervisorBadge = false;
    let headerActionsHtml = `
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
      isSupervisorBadge = true;
      headerActionsHtml = '';
      contentHtml = renderSupervisorView(state);
    }

    app.innerHTML = renderShell({
      activeRoute: state.route,
      title,
      subtitle,
      user: state.user,
      lastSyncedAt: state.lastSyncedAt,
      isSupervisorBadge,
      headerActionsHtml,
      contentHtml,
    });

    if (state.route === '/') {
      bindDashboardEvents(app, state, { onStateChange: render });
    } else if (state.route === '/update') {
      bindUpdateStatusEvents(app, state, { refreshSession, refreshPublic, onStateChange: render });
    } else if (state.route === '/supervisor') {
      bindSupervisorEvents(app, state, { refreshSupervisor, refreshPublic, onStateChange: render });
    }
  }

  // Global delegated link & logout & manual-sync handlers
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
      state.statusForm.selectedStatus = null;
      navigate('/');
    });
  });

  app.querySelectorAll('[data-action="manual-sync"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await refreshPublic();
      if (state.route === '/supervisor' && state.user?.role === 'supervisor') {
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

// Live IST clock updater (every 15s)
setInterval(() => {
  const clockEl = document.getElementById('istClockText');
  const dateEl = document.getElementById('istDateText');
  if (clockEl) clockEl.textContent = formatIstClock();
  if (dateEl) dateEl.textContent = formatIstDate();
}, 15000);

// 60-second smart polling (pauses when tab is hidden)
setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  await refreshPublic();
  if (state.route === '/supervisor' && state.user?.role === 'supervisor') {
    await refreshSupervisor();
  } else if (state.route === '/') {
    render();
  }
}, 60000);

window.addEventListener('popstate', () => {
  state.route = normalizeRoute(window.location.pathname);
  render();
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Initial boot
(async function init() {
  render();
  await Promise.all([refreshSession(), refreshPublic()]);
  if (state.route === '/supervisor' && state.user?.role === 'supervisor') {
    await refreshSupervisor();
  } else {
    render();
  }
})();
