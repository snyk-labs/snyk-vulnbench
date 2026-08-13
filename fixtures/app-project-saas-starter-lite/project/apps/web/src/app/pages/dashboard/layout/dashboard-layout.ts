import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle';
import { AvatarComponent } from '../../../shared/components/avatar/avatar';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent, AvatarComponent],
  template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      <!-- Sidebar -->
      <aside
        class="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col fixed h-full z-30 transition-transform md:translate-x-0"
        [style.transform]="sidebarOpen() ? 'translateX(0)' : 'translateX(-100%)'">
        <div class="p-6 border-b border-slate-200 dark:border-slate-700">
          <a routerLink="/" class="text-xl font-bold text-primary-600 dark:text-primary-400">SaaS Starter Lite</a>
        </div>
        <nav class="flex-1 p-4 space-y-1">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
              [routerLinkActiveOptions]="{exact: item.exact}"
              class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
              <span>{{ item.icon }}</span>
              {{ item.label }}
            </a>
          }
        </nav>
        <!-- Pro upsell in sidebar -->
        <div class="p-4 border-t border-slate-200 dark:border-slate-700">
          <a href="https://demo.cloudrix.io" class="block px-4 py-2.5 rounded-lg text-xs text-center text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition">
            Need billing, orgs, settings? Get Pro
          </a>
        </div>
        <div class="p-4 border-t border-slate-200 dark:border-slate-700">
          <button (click)="authService.logout()"
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition">
            Logout
          </button>
        </div>
      </aside>

      @if (sidebarOpen()) {
        <div (click)="sidebarOpen.set(false)" class="fixed inset-0 bg-black/50 z-20 md:hidden"></div>
      }

      <!-- Main content -->
      <div class="flex-1 md:ml-64">
        <header class="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 sticky top-0 z-10">
          <button (click)="sidebarOpen.set(!sidebarOpen())" class="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Toggle sidebar" [attr.aria-expanded]="sidebarOpen()">
            <svg class="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <div class="flex-1"></div>
          <div class="flex items-center gap-4">
            <app-theme-toggle />
            <app-avatar [name]="authService.currentUser()?.firstName || authService.currentUser()?.email || ''" size="sm" />
          </div>
        </header>

        <main class="p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class DashboardLayout {
  authService = inject(AuthService);
  sidebarOpen = signal(false);

  navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '\uD83C\uDFE0', exact: true },
    { path: '/dashboard/profile', label: 'Profile', icon: '\uD83D\uDC64', exact: false },
  ];
}
