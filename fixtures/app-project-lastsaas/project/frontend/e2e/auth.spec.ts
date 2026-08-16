import { test, expect } from '@playwright/test';

test.describe('Authentication flows', () => {
  test('login form shows submit button', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.getByRole('button', { name: /sign in/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').fill('nonexistent@test.com');
    await page.locator('input[type="password"]').fill('WrongPassword1!');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Should show an error message
    await expect(page.getByText(/invalid|error|failed|incorrect/i)).toBeVisible({ timeout: 15_000 });
  });

  test('signup form shows submit button', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.getByRole('button', { name: /sign up|create account/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
  });

  test('protected page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('login page has link to signup', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const signupLink = page.getByRole('link', { name: /sign up/i });
    await expect(signupLink).toBeVisible({ timeout: 10_000 });
  });
});
