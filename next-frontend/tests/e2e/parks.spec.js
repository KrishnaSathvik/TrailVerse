import { test, expect } from '@playwright/test';

test.describe('Park Detail Pages', () => {
  test('park detail page loads with content', async ({ page }) => {
    await page.goto('/parks/yell');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(/overview|about/i).first()).toBeVisible();
  });

  test('SEO meta tags present', async ({ page }) => {
    await page.goto('/parks/yell');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDescription).toBeTruthy();
  });

  test('tab switching works', async ({ page }) => {
    await page.goto('/parks/yell');
    // Wait for content to load
    await expect(page.locator('h1')).toBeVisible();

    // Click camping tab
    await page.getByRole('button', { name: /camping/i }).click();
    await expect(page.getByText(/camping/i).first()).toBeVisible();

    // Click alerts tab
    await page.getByRole('button', { name: /alerts/i }).click();
    await expect(page.getByText(/alerts|notices/i).first()).toBeVisible();
  });

  test('invalid park code shows 404', async ({ page }) => {
    await page.goto('/parks/invalid-park-xyz-999');
    await expect(page.getByText(/not found/i)).toBeVisible();
  });

  test('structured data JSON-LD present', async ({ page }) => {
    await page.goto('/parks/yell');
    const ldJson = await page.locator('script[type="application/ld+json"]').textContent();
    const data = JSON.parse(ldJson);
    expect(data['@type']).toBe('TouristAttraction');
    expect(data.name).toBeTruthy();
  });
});
