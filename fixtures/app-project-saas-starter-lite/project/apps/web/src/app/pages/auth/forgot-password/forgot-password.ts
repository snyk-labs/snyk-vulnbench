import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { InputComponent } from '../../../shared/components/input/input';
import { ButtonComponent } from '../../../shared/components/button/button';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, InputComponent, ButtonComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-primary-50 dark:from-slate-900 dark:to-slate-800 px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-primary-600 dark:text-primary-400">SaaS Starter Lite</h1>
          <p class="mt-2 text-slate-600 dark:text-slate-400">Reset your password</p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          @if (sent()) {
            <div class="text-center">
              <div class="text-4xl mb-4">&#9993;</div>
              <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-2">Check your email</h2>
              <p class="text-slate-600 dark:text-slate-400 mb-6">If an account exists, we've sent a password reset link.</p>
              <a routerLink="/login" class="text-primary-600 hover:text-primary-500 font-medium">Back to login</a>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="onSubmit()">
              <app-input formControlName="email" type="email" label="Email address" placeholder="you@example.com" />
              @if (form.get('email')?.touched && form.get('email')?.hasError('required')) {
                <p class="mt-1 text-xs text-danger-500" aria-live="polite">Email is required</p>
              }
              @if (form.get('email')?.touched && form.get('email')?.hasError('email')) {
                <p class="mt-1 text-xs text-danger-500" aria-live="polite">Enter a valid email address</p>
              }
              <app-button type="submit" [loading]="loading()" [disabled]="form.invalid" [fullWidth]="true">
                Send Reset Link
              </app-button>
            </form>
            <p class="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
              <a routerLink="/login" class="text-primary-600 hover:text-primary-500 font-medium">Back to login</a>
            </p>
          }
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  loading = signal(false);
  sent = signal(false);

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    try {
      await this.authService.forgotPassword(this.form.getRawValue().email);
      this.sent.set(true);
    } catch { this.sent.set(true); }
    finally { this.loading.set(false); }
  }
}
