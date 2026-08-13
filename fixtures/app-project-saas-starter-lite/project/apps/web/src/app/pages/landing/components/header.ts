import { Component, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, ThemeToggleComponent],
  template: `
    <header class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      [class]="scrolled() ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm' : 'bg-transparent'">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <a routerLink="/" class="text-xl font-bold text-primary-600 dark:text-primary-400">SaaS Starter Lite</a>

          <nav class="hidden md:flex items-center gap-8">
            <a href="#features" class="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-primary-600 transition">Features</a>
            <a href="#comparison" class="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-primary-600 transition">Compare</a>
            <a href="#faq" class="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-primary-600 transition">FAQ</a>
          </nav>

          <div class="hidden md:flex items-center gap-4">
            <app-theme-toggle />
            <a routerLink="/login" class="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-primary-600 transition">Log in</a>
            <a routerLink="/register" class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition">Get Started</a>
          </div>

          <button (click)="mobileOpen.set(!mobileOpen())" class="md:hidden p-2" aria-label="Toggle menu" [attr.aria-expanded]="mobileOpen()">
            <svg class="w-6 h-6 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>

        @if (mobileOpen()) {
          <div class="md:hidden pb-4 border-t border-slate-200 dark:border-slate-700">
            <div class="flex flex-col gap-2 pt-4">
              <a href="#features" class="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">Features</a>
              <a href="#comparison" class="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">Compare</a>
              <a href="#faq" class="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">FAQ</a>
              <a routerLink="/login" class="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">Log in</a>
              <a routerLink="/register" class="mx-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg text-center">Get Started</a>
            </div>
          </div>
        }
      </div>
    </header>
  `,
})
export class HeaderComponent implements OnDestroy {
  scrolled = signal(false);
  mobileOpen = signal(false);

  private scrollHandler = () => this.scrolled.set(window.scrollY > 20);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.scrollHandler);
    }
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.scrollHandler);
  }
}
