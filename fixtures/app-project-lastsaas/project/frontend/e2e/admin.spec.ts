import { test, expect } from '@playwright/test';

test.describe('Admin panel access', () => {
  test('admin routes redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/last');
    // Should eventually redirect to login since not authenticated
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('admin users page requires authentication', async ({ page }) => {
    await page.goto('/last/users');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('admin tenants page requires authentication', async ({ page }) => {
    await page.goto('/last/tenants');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('admin logs page requires authentication', async ({ page }) => {
    await page.goto('/last/logs');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
