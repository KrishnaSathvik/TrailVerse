import { test, expect } from '@playwright/test';

const staticPages = [
  { path: '/', titlePattern: /trailverse/i },
  { path: '/about', titlePattern: /about/i },
  { path: '/faq', titlePattern: /faq/i },
  { path: '/privacy', titlePattern: /privacy/i },
  { path: '/terms', titlePattern: /terms/i },
  { path: '/features', titlePattern: /features/i },
];

test.describe('Static Page Navigation', () => {
  for (const { path, titlePattern } of staticPages) {
    test(`${path} returns 200 and has correct title`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response.status()).toBe(200);
      await expect(page).toHaveTitle(titlePattern);
    });
  }
});
