import { test, expect } from '@playwright/test';

test.describe('Auth Pages', () => {
  test('login page renders with form fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('signup page renders', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account|sign up/i })).toBeVisible();
  });

  test('forgot password page renders and link from login works', async ({ page }) => {
    await page.goto('/login');
    await page.click('a[href="/forgot-password"]');
    await expect(page).toHaveURL('/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
  });

  test('forgot password page renders directly', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByText(/reset your password/i)).toBeVisible();
  });

  test('reset password page renders with token', async ({ page }) => {
    await page.goto('/reset-password/test-token-123');
    await expect(page.getByText(/reset your password/i)).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
  });

  test('verify email page renders', async ({ page }) => {
    await page.goto('/verify-email/test-token-123');
    await expect(page.getByText(/verif/i)).toBeVisible();
  });
});
