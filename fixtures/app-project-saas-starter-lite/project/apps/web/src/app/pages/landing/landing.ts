import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeaderComponent } from './components/header';
import { FooterComponent } from '../../shared/components/footer/footer';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, HeaderComponent, FooterComponent],
  template: `
    <app-header />

    <!-- Hero -->
    <section class="relative pt-32 pb-20 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-primary-600 via-secondary-600 to-primary-800 dark:from-primary-900 dark:via-secondary-900 dark:to-slate-900"></div>
      <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-40"></div>
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div class="inline-block px-4 py-1.5 mb-6 text-sm font-medium text-primary-200 bg-white/10 rounded-full backdrop-blur">
          Free &amp; Open Source Auth Boilerplate
        </div>
        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
          Auth Done Right.<br />
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-accent-300 to-emerald-300">Start Building Now.</span>
        </h1>
        <p class="max-w-2xl mx-auto text-lg text-primary-100 mb-10">
          Free NestJS + Angular starter with JWT auth, Google OAuth, email verification,
          password reset, dark mode, and a clean dashboard. Clone and start coding in 5 minutes.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a routerLink="/register" class="px-8 py-3.5 bg-white text-primary-700 font-bold rounded-lg hover:bg-primary-50 transition shadow-lg text-lg">
            Try the Demo
          </a>
          <a href="https://demo.cloudrix.io" class="px-8 py-3.5 border-2 border-white/30 text-white font-bold rounded-lg hover:bg-white/10 transition text-lg">
            Get Full Version
          </a>
        </div>
        <p class="mt-6 text-sm text-primary-200">MIT licensed &middot; No credit card &middot; 5-minute setup</p>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="py-20 bg-white dark:bg-slate-900">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">What's Included (Free)</h2>
          <p class="mt-4 text-lg text-slate-600 dark:text-slate-400">Everything you need to get authentication working.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          @for (feature of features; track feature.title) {
            <div class="p-6 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:shadow-lg transition-shadow">
              <div class="w-12 h-12 flex items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-2xl mb-4">
                {{ feature.icon }}
              </div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">{{ feature.title }}</h3>
              <p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{{ feature.description }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- Comparison -->
    <section id="comparison" class="py-20 bg-slate-50 dark:bg-slate-800">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">Lite vs Full Version</h2>
          <p class="mt-4 text-lg text-slate-600 dark:text-slate-400">This is the free version. Ready for more?</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700">
                <th class="text-left p-4 font-semibold text-slate-900 dark:text-white">Feature</th>
                <th class="p-4 font-semibold text-slate-900 dark:text-white text-center">Lite (Free)</th>
                <th class="p-4 font-semibold text-primary-600 dark:text-primary-400 text-center bg-primary-50 dark:bg-primary-900/20">Pro ($249)</th>
              </tr>
            </thead>
            <tbody>
              @for (row of comparisonRows; track row.feature) {
                <tr class="border-b border-slate-100 dark:border-slate-800">
                  <td class="p-4 text-slate-700 dark:text-slate-300">{{ row.feature }}</td>
                  <td class="p-4 text-center">{{ row.lite }}</td>
                  <td class="p-4 text-center bg-primary-50/50 dark:bg-primary-900/10">{{ row.pro }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="text-center mt-8">
          <a href="https://demo.cloudrix.io" class="inline-block px-8 py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition shadow-lg text-lg">
            Get the Full Version
          </a>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="py-20 bg-white dark:bg-slate-900">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 class="text-3xl font-bold text-center text-slate-900 dark:text-white mb-16">Frequently Asked Questions</h2>
        <div class="space-y-4">
          @for (faq of faqs; track faq.q; let i = $index) {
            <div class="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button (click)="toggleFaq(i)" class="w-full flex items-center justify-between p-5 text-left" [attr.aria-expanded]="openFaq() === i">
                <span class="font-semibold text-slate-900 dark:text-white">{{ faq.q }}</span>
                <span class="text-slate-400 text-xl transition-transform" [class.rotate-45]="openFaq() === i">+</span>
              </button>
              @if (openFaq() === i) {
                <div class="px-5 pb-5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{{ faq.a }}</div>
              }
            </div>
          }
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-20 bg-gradient-to-r from-primary-600 to-secondary-700">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h2 class="text-3xl sm:text-4xl font-bold text-white mb-6">Need More Than Auth?</h2>
        <p class="text-lg text-primary-100 mb-10">
          The full SaaS Starter adds Stripe payments, multi-tenancy, Docker, AWS deployment,
          background jobs, file uploads, and more. Save 2-6 weeks of setup.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="https://demo.cloudrix.io" class="px-8 py-3.5 bg-white text-primary-700 font-bold rounded-lg hover:bg-primary-50 transition shadow-lg text-lg">
            Get SaaS Starter Pro
          </a>
          <a routerLink="/register" class="px-8 py-3.5 border-2 border-white/30 text-white font-bold rounded-lg hover:bg-white/10 transition text-lg">
            Try Lite Demo
          </a>
        </div>
      </div>
    </section>

    <app-footer />
  `,
})
export class LandingPage {
  openFaq = signal<number | null>(null);

  toggleFaq(index: number) {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }

  features = [
    { icon: '\uD83D\uDD10', title: 'JWT Authentication', description: 'Email/password login with access + refresh token rotation, bcrypt hashing, and automatic token refresh.' },
    { icon: '\uD83C\uDF10', title: 'Google OAuth', description: 'One-click Google sign-in with automatic account linking and new user creation.' },
    { icon: '\u2709\uFE0F', title: 'Email Verification', description: 'Verification emails via Resend with expiring tokens. Password reset flow included.' },
    { icon: '\uD83C\uDF19', title: 'Dark Mode', description: 'System-aware dark mode with manual toggle. Persists across sessions via localStorage.' },
    { icon: '\uD83D\uDCCA', title: 'Dashboard', description: 'Clean user dashboard with profile management, sidebar navigation, and responsive design.' },
    { icon: '\uD83D\uDEE1\uFE0F', title: 'Security', description: 'Helmet headers, rate limiting, CORS, input validation, and global exception handling.' },
  ];

  comparisonRows = [
    { feature: 'JWT Auth + Google OAuth', lite: 'Yes', pro: 'Yes' },
    { feature: 'Email Verification & Password Reset', lite: 'Yes', pro: 'Yes' },
    { feature: 'User Dashboard + Profile', lite: 'Yes', pro: 'Yes' },
    { feature: 'Dark Mode', lite: 'Yes', pro: 'Yes' },
    { feature: 'Swagger API Docs', lite: 'Yes', pro: 'Yes' },
    { feature: 'Stripe Payments', lite: '--', pro: 'Yes' },
    { feature: '2FA + Magic Links', lite: '--', pro: 'Yes' },
    { feature: 'Multi-tenancy (Organizations)', lite: '--', pro: 'Yes' },
    { feature: 'RBAC (4 Roles)', lite: '--', pro: 'Yes' },
    { feature: 'BullMQ Job Queues', lite: '--', pro: 'Yes' },
    { feature: 'S3 File Uploads', lite: '--', pro: 'Yes' },
    { feature: 'Docker Compose (Full Stack)', lite: 'DB only', pro: 'Yes' },
    { feature: 'AWS Terraform + CI/CD', lite: '--', pro: 'Enterprise' },
    { feature: 'Audit Logging + API Keys', lite: '--', pro: 'Enterprise' },
  ];

  faqs = [
    { q: 'Is this really free?', a: 'Yes, 100% free and MIT licensed. Use it for any project, personal or commercial. The full version with payments, multi-tenancy, and infrastructure costs money, but this lite version is yours forever.' },
    { q: 'Can I use this in production?', a: 'The auth code is production-quality (bcrypt, JWT rotation, rate limiting, input validation). For a full production SaaS, you\'ll likely want the Pro version which adds Stripe, Docker, and deployment tooling.' },
    { q: 'How is this different from the paid version?', a: 'This lite version covers authentication only. The paid version adds Stripe payments, organizations/multi-tenancy, BullMQ jobs, S3 uploads, Docker Compose (full stack), AWS Terraform, GitHub Actions CI/CD, audit logging, and more.' },
    { q: 'What tech stack does this use?', a: 'NestJS 11 (backend), Angular 21 (frontend), PostgreSQL (database), TypeORM (ORM), Tailwind CSS v4 (styling), Passport.js (auth strategies), Resend (email), and Swagger (API docs).' },
    { q: 'Can I upgrade to the full version later?', a: 'Yes! The full version follows the same architecture. You can start with lite and upgrade anytime without rewriting your code.' },
  ];
}
