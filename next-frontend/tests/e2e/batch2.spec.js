import { test, expect } from '@playwright/test';

test.describe('Batch 2 Migration Routes', () => {
  test('404 page renders for nonexistent path', async ({ page }) => {
    const response = await page.goto('/nonexistent-path-xyz');
    expect(response.status()).toBe(404);
    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=Lost in the Wilderness')).toBeVisible();
  });

  test('Testimonials page loads', async ({ page }) => {
    const response = await page.goto('/testimonials');
    expect(response.status()).toBe(200);
    await expect(page.locator('h1:has-text("Community Testimonials")')).toBeVisible();
  });

  test('Unsubscribe page loads with email param', async ({ page }) => {
    const response = await page.goto('/unsubscribe?email=test@test.com');
    expect(response.status()).toBe(200);
    await expect(page.locator('h1:has-text("Email Preferences")')).toBeVisible();
  });

  test('Compare page loads', async ({ page }) => {
    const response = await page.goto('/compare');
    expect(response.status()).toBe(200);
    await expect(page.locator('h1:has-text("Compare National Parks")')).toBeVisible();
  });

  test('Home page redirects to login without auth', async ({ page }) => {
    const response = await page.goto('/home');
    // Proxy should redirect unauthenticated users to /login
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
  });

  test('Explore page loads with park grid', async ({ page }) => {
    const response = await page.goto('/explore');
    expect(response.status()).toBe(200);
    await expect(page.locator('h1:has-text("Explore National Parks")')).toBeVisible();
  });
});
