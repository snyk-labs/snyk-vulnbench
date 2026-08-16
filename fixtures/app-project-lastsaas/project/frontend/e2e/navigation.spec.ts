import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('unknown routes redirect to dashboard or login', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    // Should redirect: either to /login (unauthenticated) or /dashboard (authenticated)
    await expect(page).toHaveURL(/\/(login|dashboard)/, { timeout: 10_000 });
  });

  test('login page navigates to signup via link', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const signupLink = page.getByRole('link', { name: /sign up/i });
    await expect(signupLink).toBeVisible({ timeout: 10_000 });
    await signupLink.click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test('signup page navigates to login via link', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');
    const loginLink = page.getByRole('link', { name: /sign in|log in/i });
    await expect(loginLink).toBeVisible({ timeout: 10_000 });
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('direct URL access to auth pages works', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
