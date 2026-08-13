import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div class="text-center">
        <p class="text-6xl font-bold text-primary-600 dark:text-primary-400 mb-4">404</p>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Page not found</h1>
        <p class="text-slate-600 dark:text-slate-400 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <a routerLink="/" class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition">
          Go Home
        </a>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
