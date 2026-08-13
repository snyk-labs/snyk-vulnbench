import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { User, AuthResponse } from '../models/user.model';

// Lite version: email/password + Google OAuth.
// Full version adds 2FA login, magic links, and more.
// Get it at: https://demo.cloudrix.io

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = environment.apiUrl;

  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => !!this.currentUser());
  isAdmin = computed(() => this.currentUser()?.role === 'admin');

  constructor() {
    if (this.getAccessToken()) {
      this.getProfile().catch(() => this.clearTokens());
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.api}/auth/login`, { email, password }),
    );
    this.setTokens(res.accessToken, res.refreshToken);
    this.currentUser.set(res.user);
    return res;
  }

  async register(email: string, password: string, firstName?: string, lastName?: string) {
    return firstValueFrom(
      this.http.post(`${this.api}/auth/register`, { email, password, firstName, lastName }),
    );
  }

  async getProfile(): Promise<User> {
    const user = await firstValueFrom(
      this.http.get<User>(`${this.api}/auth/me`),
    );
    this.currentUser.set(user);
    return user;
  }

  async refreshToken(): Promise<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    const res = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.api}/auth/refresh`, { refreshToken }),
    );
    this.setTokens(res.accessToken, res.refreshToken);
    this.currentUser.set(res.user);
    return res;
  }

  async forgotPassword(email: string) {
    return firstValueFrom(
      this.http.post(`${this.api}/auth/forgot-password`, { email }),
    );
  }

  async resetPassword(token: string, newPassword: string) {
    return firstValueFrom(
      this.http.post(`${this.api}/auth/reset-password`, { token, newPassword }),
    );
  }

  async verifyEmail(token: string) {
    return firstValueFrom(
      this.http.post(`${this.api}/auth/verify-email`, { token }),
    );
  }

  googleLogin() {
    window.location.href = `${this.api}/auth/google`;
  }

  logout() {
    this.http.post(`${this.api}/auth/logout`, {}).subscribe({ error: () => {} });
    this.clearTokens();
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}
