import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('landing page or login loads', async ({ page }) => {
    await page.goto('/');
    // App either shows landing page or redirects to /login (or /setup if not bootstrapped)
    await expect(page).toHaveURL(/\/(login|setup)?$/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Should have email and password inputs (using placeholder selectors)
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
  });

  test('signup page is accessible', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');
    // Should have registration form fields
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
  });
});
