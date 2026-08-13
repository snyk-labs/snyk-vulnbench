import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-1">
        Welcome back, {{ authService.currentUser()?.firstName || 'there' }}!
      </h1>
      <p class="text-slate-600 dark:text-slate-400 mb-8">Here's an overview of your account.</p>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">Account</p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white capitalize">{{ authService.currentUser()?.role || 'User' }}</p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">Email Verified</p>
          <p class="text-2xl font-bold" [class]="authService.currentUser()?.isEmailVerified ? 'text-success-600' : 'text-danger-600'">
            {{ authService.currentUser()?.isEmailVerified ? 'Yes' : 'No' }}
          </p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">Plan</p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">Free (Lite)</p>
        </div>
      </div>

      <!-- Quick Actions -->
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <a routerLink="/dashboard/profile" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:border-primary-300 dark:hover:border-primary-600 transition group">
          <h3 class="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 mb-1">Complete Profile</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Add your name and update your details</p>
        </a>
        <a href="https://demo.cloudrix.io" class="bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 rounded-xl border border-primary-200 dark:border-primary-800 p-6 hover:shadow-lg transition group">
          <h3 class="font-semibold text-primary-700 dark:text-primary-300 group-hover:text-primary-600 mb-1">Upgrade to Pro</h3>
          <p class="text-sm text-primary-600/70 dark:text-primary-400/70">Get Stripe payments, organizations, Docker, AWS, and more</p>
        </a>
      </div>
    </div>
  `,
})
export class DashboardHome {
  authService = inject(AuthService);
}
