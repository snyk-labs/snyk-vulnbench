import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { getErrorMessage } from '../../../shared/utils/error';
import { InputComponent } from '../../../shared/components/input/input';
import { ButtonComponent } from '../../../shared/components/button/button';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, InputComponent, ButtonComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-primary-50 dark:from-slate-900 dark:to-slate-800 px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-primary-600 dark:text-primary-400">SaaS Starter Lite</h1>
          <p class="mt-2 text-slate-600 dark:text-slate-400">Welcome back</p>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <app-input formControlName="email" type="email" label="Email" placeholder="you@example.com" />
            @if (form.get('email')?.touched && form.get('email')?.hasError('required')) {
              <p class="mt-1 text-xs text-danger-500" aria-live="polite">Email is required</p>
            }
            @if (form.get('email')?.touched && form.get('email')?.hasError('email')) {
              <p class="mt-1 text-xs text-danger-500" aria-live="polite">Enter a valid email address</p>
            }
            <app-input formControlName="password" type="password" label="Password" placeholder="********" />
            @if (form.get('password')?.touched && form.get('password')?.hasError('required')) {
              <p class="mt-1 text-xs text-danger-500" aria-live="polite">Password is required</p>
            }

            <div class="flex items-center justify-between mb-6">
              <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <input type="checkbox" class="rounded border-slate-300" />
                Remember me
              </label>
              <a routerLink="/forgot-password" class="text-sm text-primary-600 hover:text-primary-500">Forgot password?</a>
            </div>

            @if (error()) {
              <div class="mb-4 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400 text-sm">
                {{ error() }}
              </div>
            }

            <app-button type="submit" [loading]="loading()" [disabled]="form.invalid" [fullWidth]="true">
              Sign In
            </app-button>
          </form>

          <div class="mt-6">
            <div class="relative">
              <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-700"></div></div>
              <div class="relative flex justify-center text-sm"><span class="px-2 bg-white dark:bg-slate-800 text-slate-500">Or continue with</span></div>
            </div>

            <button (click)="googleLogin()"
              class="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-sm font-medium text-slate-700 dark:text-slate-300">
              <svg class="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Sign in with Google
            </button>
          </div>

          <p class="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            Don't have an account?
            <a routerLink="/register" class="text-primary-600 hover:text-primary-500 font-medium">Sign up</a>
          </p>
        </div>

        <!-- Pro upsell -->
        <div class="mt-4 text-center">
          <p class="text-xs text-slate-400 dark:text-slate-500">
            Need 2FA, magic links, or Stripe?
            <a href="https://demo.cloudrix.io" class="text-primary-500 hover:text-primary-400">Get the full version</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  loading = signal(false);
  error = signal('');

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.login(email, password);
      this.toast.success('Welcome back!');
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.error.set(getErrorMessage(err, 'Invalid credentials'));
    } finally {
      this.loading.set(false);
    }
  }

  googleLogin() {
    this.authService.googleLogin();
  }
}
