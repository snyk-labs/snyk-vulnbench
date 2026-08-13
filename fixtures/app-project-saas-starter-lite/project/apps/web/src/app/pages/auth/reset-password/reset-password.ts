import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { getErrorMessage } from '../../../shared/utils/error';
import { InputComponent } from '../../../shared/components/input/input';
import { ButtonComponent } from '../../../shared/components/button/button';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, InputComponent, ButtonComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-primary-50 dark:from-slate-900 dark:to-slate-800 px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-primary-600 dark:text-primary-400">SaaS Starter Lite</h1>
          <p class="mt-2 text-slate-600 dark:text-slate-400">Set a new password</p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <app-input formControlName="newPassword" type="password" label="New Password" placeholder="Min. 8 characters" />
            @if (form.get('newPassword')?.touched && form.get('newPassword')?.hasError('required')) {
              <p class="mt-1 text-xs text-danger-500" aria-live="polite">Password is required</p>
            }
            @if (form.get('newPassword')?.touched && form.get('newPassword')?.hasError('minlength')) {
              <p class="mt-1 text-xs text-danger-500" aria-live="polite">Password must be at least 8 characters</p>
            }
            <app-input formControlName="confirmPassword" type="password" label="Confirm Password" placeholder="Confirm password" />
            @if (form.get('confirmPassword')?.touched && form.get('newPassword')?.value !== form.get('confirmPassword')?.value) {
              <p class="mt-1 text-xs text-danger-500" aria-live="polite">Passwords do not match</p>
            }
            @if (error()) {
              <div class="mb-4 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400 text-sm">{{ error() }}</div>
            }
            <app-button type="submit" [loading]="loading()" [disabled]="form.invalid" [fullWidth]="true">
              Reset Password
            </app-button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class ResetPasswordPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  form = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });
  loading = signal(false);
  error = signal('');

  async onSubmit() {
    if (this.form.invalid) return;
    const { newPassword, confirmPassword } = this.form.getRawValue();
    if (newPassword !== confirmPassword) { this.error.set('Passwords do not match'); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const token = this.route.snapshot.queryParams['token'];
      await this.authService.resetPassword(token, newPassword);
      this.toast.success('Password reset! Please log in.');
      this.router.navigate(['/login']);
    } catch (err: unknown) {
      this.error.set(getErrorMessage(err, 'Reset failed. Link may have expired.'));
    } finally { this.loading.set(false); }
  }
}
