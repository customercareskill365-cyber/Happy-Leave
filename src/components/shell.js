import { escapeHtml, getInitials } from '../lib/escape.js';
import { formatIstClock, formatIstDate } from '../lib/ist.js';

export function renderShell({
  activeRoute,
  title,
  subtitle,
  user,
  lastSyncedAt,
  isSupervisorBadge = false,
  headerActionsHtml = '',
  contentHtml = '',
}) {
  const navItemClass = (route) =>
    activeRoute === route
      ? 'flex items-center gap-3 px-3 py-2.5 rounded bg-light-primary text-light-on-primary transition-colors duration-state-change'
      : 'flex items-center gap-3 px-3 py-2.5 rounded text-light-on-surface-variant hover:bg-light-surface-container-low transition-colors duration-state-change';

  const mobileNavClass = (route) =>
    activeRoute === route
      ? 'flex flex-col items-center justify-center gap-1 py-2 text-light-primary font-label text-label-sm'
      : 'flex flex-col items-center justify-center gap-1 py-2 text-light-on-surface-variant font-label text-label-sm';

  const supervisorTarget = user?.role === 'supervisor' ? '/supervisor' : '/login?next=/supervisor';

  const userFooter = user
    ? `
      <div class="flex items-center gap-3 px-2">
        <div class="w-9 h-9 rounded-full ${user.role === 'supervisor' ? 'bg-light-primary text-light-on-primary' : 'bg-light-primary-container text-light-on-primary-container'} flex items-center justify-center shrink-0">
          <span class="font-label text-label-md">${escapeHtml(getInitials(user.fullName))}</span>
        </div>
        <div class="min-w-0">
          <p class="font-label text-label-md text-light-on-surface truncate">${escapeHtml(user.fullName)}</p>
          <p class="font-body text-body-sm text-light-on-surface-variant truncate">${user.role === 'supervisor' ? 'Supervisor' : 'Employee'} • ${escapeHtml(user.employeeId)}</p>
        </div>
      </div>
      <button type="button" data-action="logout" class="flex items-center gap-2 px-3 py-2 rounded border border-light-outline-variant text-light-on-surface-variant hover:bg-light-surface-container-low transition-colors duration-state-change">
        <i data-lucide="log-out" class="w-4 h-4" aria-hidden="true"></i>
        <span class="font-label text-label-md">Sign Out</span>
      </button>
    `
    : `
      <div class="px-2">
        <p class="font-label text-label-md text-light-on-surface">Public View</p>
        <p class="font-body text-body-sm text-light-on-surface-variant">Sign in to update status</p>
      </div>
      <a href="/login" data-link class="flex items-center justify-center gap-2 px-3 py-2 rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container transition-colors duration-state-change">
        <i data-lucide="log-in" class="w-4 h-4" aria-hidden="true"></i>
        <span class="font-label text-label-md">Sign In</span>
      </a>
    `;

  const syncText = lastSyncedAt ? `Synced ${formatIstClock(new Date(lastSyncedAt))}` : 'Syncing...';

  return `
    <div class="min-h-screen flex bg-light-surface pb-20 md:pb-0">
      <!-- Persistent Desktop Sidebar -->
      <aside class="hidden md:flex w-64 shrink-0 min-h-screen bg-light-surface-container-lowest border-r border-light-outline-variant flex-col justify-between p-5 sticky top-0 h-screen">
        <div class="flex flex-col gap-6">
          <a href="/" data-link class="flex items-center gap-3 px-2">
            <div class="w-9 h-9 rounded bg-light-primary text-light-on-primary flex items-center justify-center shrink-0">
              <i data-lucide="calendar-check-2" class="w-5 h-5" aria-hidden="true"></i>
            </div>
            <div>
              <p class="font-headline text-headline-sm text-light-on-surface leading-tight">Team Leave</p>
              <p class="font-label text-label-sm text-light-on-surface-variant">Manager PWA</p>
            </div>
          </a>

          <nav aria-label="Primary" class="flex flex-col gap-1.5">
            <a href="/" data-link class="${navItemClass('/')}">
              <i data-lucide="layout-dashboard" class="w-4 h-4 shrink-0" aria-hidden="true"></i>
              <span class="font-label text-label-lg">Team Dashboard</span>
            </a>
            <a href="/update" data-link class="${navItemClass('/update')}">
              <i data-lucide="user-check" class="w-4 h-4 shrink-0" aria-hidden="true"></i>
              <span class="font-label text-label-lg">Update My Status</span>
            </a>
            <a href="${supervisorTarget}" data-link class="${navItemClass('/supervisor')}">
              <i data-lucide="shield-check" class="w-4 h-4 shrink-0" aria-hidden="true"></i>
              <span class="font-label text-label-lg">Supervisor View</span>
            </a>
          </nav>
        </div>

        <div class="pt-4 border-t border-light-outline-variant flex flex-col gap-3">
          ${userFooter}
        </div>
      </aside>

      <!-- Main Content Area -->
      <div class="flex-1 min-w-0 flex flex-col">
        <header class="bg-light-surface-container-lowest border-b border-light-outline-variant px-4 md:px-6 py-3.5 md:py-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="md:hidden w-9 h-9 rounded bg-light-primary text-light-on-primary flex items-center justify-center shrink-0">
              <i data-lucide="calendar-check-2" class="w-5 h-5" aria-hidden="true"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="font-headline text-headline-md md:text-headline-lg text-light-on-surface truncate">${escapeHtml(title)}</h1>
                ${
                  isSupervisorBadge
                    ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-light-primary-container text-light-on-primary-container shrink-0">
                        <i data-lucide="lock" class="w-3 h-3" aria-hidden="true"></i>
                        <span class="font-label text-label-sm">Supervisor Access</span>
                      </span>`
                    : ''
                }
              </div>
              <p class="font-body text-body-sm text-light-on-surface-variant truncate">${escapeHtml(subtitle)}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 md:gap-3 min-w-0">
            <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-light-surface-container-low border border-light-outline-variant">
              <i data-lucide="calendar" class="w-4 h-4 text-light-primary" aria-hidden="true"></i>
              <span id="istDateText" class="font-body text-body-sm text-light-on-surface">${escapeHtml(formatIstDate())}</span>
            </div>
            <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-light-surface-container-low border border-light-outline-variant">
              <i data-lucide="clock" class="w-3.5 h-3.5 text-light-primary" aria-hidden="true"></i>
              <span id="istClockText" class="font-mono text-mono-sm text-light-on-surface tabular-nums">${escapeHtml(formatIstClock())}</span>
            </div>
            <button type="button" data-action="manual-sync" title="Refresh now" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-available-container/60 border border-available/30 hover:bg-available-container transition-colors duration-state-change">
              <span class="w-2 h-2 rounded-full bg-available" aria-hidden="true"></span>
              <span id="syncStatusText" class="font-mono text-mono-sm text-on-available-container tabular-nums">${escapeHtml(syncText)}</span>
            </button>
            ${headerActionsHtml}
          </div>
        </header>

        <main class="p-4 md:p-6 max-w-7xl w-full mx-auto flex flex-col gap-5 md:gap-6">
          ${contentHtml}
        </main>
      </div>

      <!-- Mobile Bottom Navigation -->
      <nav aria-label="Mobile Navigation" class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-light-surface-container-lowest border-t border-light-outline-variant grid grid-cols-3 px-2 pb-[env(safe-area-inset-bottom)]">
        <a href="/" data-link class="${mobileNavClass('/')}">
          <i data-lucide="layout-dashboard" class="w-5 h-5" aria-hidden="true"></i>
          <span>Team</span>
        </a>
        <a href="/update" data-link class="${mobileNavClass('/update')}">
          <i data-lucide="user-check" class="w-5 h-5" aria-hidden="true"></i>
          <span>My Status</span>
        </a>
        <a href="${user ? (user.role === 'supervisor' ? '/supervisor' : '/login') : '/login'}" data-link class="${mobileNavClass(activeRoute === '/supervisor' ? '/supervisor' : '/login')}">
          <i data-lucide="${user?.role === 'supervisor' ? 'shield-check' : 'log-in'}" class="w-5 h-5" aria-hidden="true"></i>
          <span>${user?.role === 'supervisor' ? 'Supervisor' : user ? 'Account' : 'Sign In'}</span>
        </a>
      </nav>
    </div>
  `;
}
