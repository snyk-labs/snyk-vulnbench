import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { getErrorMessage } from '../../../shared/utils/error';
import { environment } from '../../../environments/environment';
import { InputComponent } from '../../../shared/components/input/input';
import { ButtonComponent } from '../../../shared/components/button/button';
import { AvatarComponent } from '../../../shared/components/avatar/avatar';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, InputComponent, ButtonComponent, AvatarComponent],
  template: `
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-6">Profile</h1>

      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <div class="flex items-center gap-4 mb-6">
          <app-avatar [name]="authService.currentUser()?.firstName || authService.currentUser()?.email || ''" size="lg" />
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">{{ authService.currentUser()?.email }}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400 capitalize">{{ authService.currentUser()?.role }} account</p>
          </div>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="grid grid-cols-2 gap-4 mb-4">
            <app-input formControlName="firstName" label="First Name" placeholder="John" />
            <app-input formControlName="lastName" label="Last Name" placeholder="Doe" />
          </div>

          @if (error()) {
            <div class="mb-4 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400 text-sm">{{ error() }}</div>
          }

          <app-button type="submit" [loading]="saving()">
            Save Changes
          </app-button>
        </form>
      </div>

      <!-- Change Password -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Change Password</h2>
        <form [formGroup]="passwordForm" (ngSubmit)="onChangePassword()">
          <app-input formControlName="currentPassword" type="password" label="Current Password" placeholder="********" />
          <app-input formControlName="newPassword" type="password" label="New Password" placeholder="Min. 8 characters" />
          <app-input formControlName="confirmPassword" type="password" label="Confirm New Password" placeholder="Confirm" />
          @if (passwordError()) {
            <div class="mb-4 p-3 rounded-lg bg-danger-50 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400 text-sm">{{ passwordError() }}</div>
          }
          <app-button type="submit" [loading]="changingPassword()" variant="secondary">
            Change Password
          </app-button>
        </form>
      </div>
    </div>
  `,
})
export class ProfilePage implements OnInit {
  authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  form = this.fb.nonNullable.group({
    firstName: [''],
    lastName: [''],
  });

  passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  saving = signal(false);
  error = signal('');
  changingPassword = signal(false);
  passwordError = signal('');

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user) {
      this.form.patchValue({ firstName: user.firstName || '', lastName: user.lastName || '' });
    }
  }

  async onSubmit() {
    this.saving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.patch(`${environment.apiUrl}/users/me`, this.form.getRawValue()),
      );
      await this.authService.getProfile();
      this.toast.success('Profile updated!');
    } catch (err: unknown) {
      this.error.set(getErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async onChangePassword() {
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();
    if (newPassword !== confirmPassword) {
      this.passwordError.set('Passwords do not match');
      return;
    }
    this.changingPassword.set(true);
    this.passwordError.set('');
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/change-password`, { currentPassword, newPassword }),
      );
      this.toast.success('Password changed!');
      this.passwordForm.reset();
    } catch (err: unknown) {
      this.passwordError.set(getErrorMessage(err));
    } finally {
      this.changingPassword.set(false);
    }
  }
}
