import { test, expect } from '@playwright/test';

test.describe('Parks Exploration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should display parks on explore page', async ({ page }) => {
    await page.click('text=Explore Parks');
    await expect(page).toHaveURL('/explore');
    
    // Should show parks list
    await expect(page.locator('[data-testid="park-card"]')).toHaveCount.greaterThan(0);
    
    // Should show park information
    const firstPark = page.locator('[data-testid="park-card"]').first();
    await expect(firstPark.locator('h3')).toBeVisible();
    await expect(firstPark.locator('p')).toBeVisible();
  });

  test('should filter parks by state', async ({ page }) => {
    await page.goto('/explore');
    
    // Select California from state filter
    await page.selectOption('select[name="state"]', 'CA');
    
    // Wait for results to load
    await page.waitForSelector('[data-testid="park-card"]');
    
    // All displayed parks should be in California
    const parkCards = page.locator('[data-testid="park-card"]');
    const count = await parkCards.count();
    
    for (let i = 0; i < count; i++) {
      const parkCard = parkCards.nth(i);
      await expect(parkCard.locator('text=California')).toBeVisible();
    }
  });

  test('should search parks by name', async ({ page }) => {
    await page.goto('/explore');
    
    // Search for Yosemite
    await page.fill('input[name="search"]', 'yosemite');
    await page.press('input[name="search"]', 'Enter');
    
    // Wait for results to load
    await page.waitForSelector('[data-testid="park-card"]');
    
    // All results should contain 'yosemite' in the name
    const parkCards = page.locator('[data-testid="park-card"]');
    const count = await parkCards.count();
    
    for (let i = 0; i < count; i++) {
      const parkCard = parkCards.nth(i);
      const parkName = await parkCard.locator('h3').textContent();
      expect(parkName.toLowerCase()).toContain('yosemite');
    }
  });

  test('should sort parks by name', async ({ page }) => {
    await page.goto('/explore');
    
    // Select name sorting
    await page.selectOption('select[name="sort"]', 'name');
    
    // Wait for results to load
    await page.waitForSelector('[data-testid="park-card"]');
    
    // Check if parks are sorted alphabetically
    const parkCards = page.locator('[data-testid="park-card"]');
    const count = await parkCards.count();
    
    let previousName = '';
    for (let i = 0; i < count; i++) {
      const parkCard = parkCards.nth(i);
      const parkName = await parkCard.locator('h3').textContent();
      
      if (previousName) {
        expect(parkName.localeCompare(previousName)).toBeGreaterThanOrEqual(0);
      }
      previousName = parkName;
    }
  });

  test('should navigate to park detail page', async ({ page }) => {
    await page.goto('/explore');
    
    // Click on first park
    const firstPark = page.locator('[data-testid="park-card"]').first();
    const parkName = await firstPark.locator('h3').textContent();
    
    await firstPark.click();
    
    // Should navigate to park detail page
    await expect(page).toHaveURL(/\/parks\/[a-z]+/);
    await expect(page.locator('h1')).toContainText(parkName);
  });

  test('should display park details', async ({ page }) => {
    await page.goto('/parks/yose');
    
    // Should show park information
    await expect(page.locator('h1')).toContainText('Yosemite');
    await expect(page.locator('[data-testid="park-description"]')).toBeVisible();
    await expect(page.locator('[data-testid="park-location"]')).toBeVisible();
    
    // Should show park activities
    await expect(page.locator('[data-testid="park-activities"]')).toBeVisible();
    
    // Should show park amenities
    await expect(page.locator('[data-testid="park-amenities"]')).toBeVisible();
  });

  test('should display park weather information', async ({ page }) => {
    await page.goto('/parks/yose');
    
    // Should show weather section
    await expect(page.locator('[data-testid="weather-section"]')).toBeVisible();
    
    // Should show current weather
    await expect(page.locator('[data-testid="current-weather"]')).toBeVisible();
    await expect(page.locator('[data-testid="temperature"]')).toBeVisible();
    await expect(page.locator('[data-testid="condition"]')).toBeVisible();
  });

  test('should display park events', async ({ page }) => {
    await page.goto('/parks/yose');
    
    // Should show events section
    await expect(page.locator('[data-testid="events-section"]')).toBeVisible();
    
    // Should show events list
    await expect(page.locator('[data-testid="event-card"]')).toHaveCount.greaterThan(0);
    
    // Each event should have required information
    const firstEvent = page.locator('[data-testid="event-card"]').first();
    await expect(firstEvent.locator('h4')).toBeVisible();
    await expect(firstEvent.locator('[data-testid="event-date"]')).toBeVisible();
    await expect(firstEvent.locator('[data-testid="event-location"]')).toBeVisible();
  });

  test('should display park reviews', async ({ page }) => {
    await page.goto('/parks/yose');
    
    // Should show reviews section
    await expect(page.locator('[data-testid="reviews-section"]')).toBeVisible();
    
    // Should show reviews list
    await expect(page.locator('[data-testid="review-card"]')).toHaveCount.greaterThan(0);
    
    // Each review should have required information
    const firstReview = page.locator('[data-testid="review-card"]').first();
    await expect(firstReview.locator('[data-testid="review-rating"]')).toBeVisible();
    await expect(firstReview.locator('[data-testid="review-comment"]')).toBeVisible();
    await expect(firstReview.locator('[data-testid="review-author"]')).toBeVisible();
  });

  test('should add park to favorites when logged in', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await expect(page.locator('text=Welcome')).toBeVisible();
    
    // Navigate to park detail
    await page.goto('/parks/yose');
    
    // Click favorite button
    await page.click('[data-testid="favorite-button"]');
    
    // Should show success message
    await expect(page.locator('text=Added to favorites')).toBeVisible();
    
    // Button should show as favorited
    await expect(page.locator('[data-testid="favorite-button"]')).toHaveClass(/favorited/);
  });

  test('should redirect to login when trying to favorite without being logged in', async ({ page }) => {
    await page.goto('/parks/yose');
    
    // Click favorite button
    await page.click('[data-testid="favorite-button"]');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should write a review when logged in', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await expect(page.locator('text=Welcome')).toBeVisible();
    
    // Navigate to park detail
    await page.goto('/parks/yose');
    
    // Scroll to reviews section
    await page.locator('[data-testid="reviews-section"]').scrollIntoViewIfNeeded();
    
    // Click write review button
    await page.click('[data-testid="write-review-button"]');
    
    // Fill review form
    await page.fill('textarea[name="comment"]', 'Amazing park with beautiful scenery!');
    await page.click('[data-testid="rating-5"]');
    
    // Submit review
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('text=Review submitted successfully')).toBeVisible();
    
    // Review should appear in the list
    await expect(page.locator('text=Amazing park with beautiful scenery!')).toBeVisible();
  });

  test('should display park map', async ({ page }) => {
    await page.goto('/parks/yose');
    
    // Should show map section
    await expect(page.locator('[data-testid="park-map"]')).toBeVisible();
    
    // Map should be interactive
    await expect(page.locator('[data-testid="map-container"]')).toBeVisible();
  });

  test('should navigate to map page', async ({ page }) => {
    await page.click('text=Map');
    await expect(page).toHaveURL('/map');
    
    // Should show map
    await expect(page.locator('[data-testid="map-container"]')).toBeVisible();
    
    // Should show park markers
    await expect(page.locator('[data-testid="park-marker"]')).toHaveCount.greaterThan(0);
  });

  test('should filter parks on map page', async ({ page }) => {
    await page.goto('/map');
    
    // Select state filter
    await page.selectOption('select[name="state"]', 'CA');
    
    // Wait for map to update
    await page.waitForTimeout(1000);
    
    // Should show only California parks
    const markers = page.locator('[data-testid="park-marker"]');
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should click park marker to show popup', async ({ page }) => {
    await page.goto('/map');
    
    // Click on first park marker
    const firstMarker = page.locator('[data-testid="park-marker"]').first();
    await firstMarker.click();
    
    // Should show popup with park information
    await expect(page.locator('[data-testid="marker-popup"]')).toBeVisible();
    await expect(page.locator('[data-testid="popup-park-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="popup-park-description"]')).toBeVisible();
  });

  test('should navigate to park detail from map popup', async ({ page }) => {
    await page.goto('/map');
    
    // Click on first park marker
    const firstMarker = page.locator('[data-testid="park-marker"]').first();
    await firstMarker.click();
    
    // Click view details button in popup
    await page.click('[data-testid="view-details-button"]');
    
    // Should navigate to park detail page
    await expect(page).toHaveURL(/\/parks\/[a-z]+/);
  });

  test('should handle park not found error', async ({ page }) => {
    await page.goto('/parks/nonexistent');
    
    // Should show 404 error
    await expect(page.locator('text=Park not found')).toBeVisible();
    await expect(page.locator('text=404')).toBeVisible();
    
    // Should have link back to explore page
    await expect(page.locator('text=Explore Parks')).toBeVisible();
  });

  test('should paginate through parks list', async ({ page }) => {
    await page.goto('/explore');
    
    // Should show pagination controls
    await expect(page.locator('[data-testid="pagination"]')).toBeVisible();
    
    // Click next page
    await page.click('[data-testid="next-page"]');
    
    // Should show different parks
    await expect(page.locator('[data-testid="park-card"]')).toHaveCount.greaterThan(0);
    
    // Should show current page number
    await expect(page.locator('[data-testid="current-page"]')).toContainText('2');
  });

  test('should show loading states', async ({ page }) => {
    // Mock slow API response
    await page.route('**/api/parks', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    await page.goto('/explore');
    
    // Should show loading state
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
    
    // Should hide loading state after data loads
    await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="park-card"]')).toHaveCount.greaterThan(0);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/parks', route => {
      route.abort('failed');
    });
    
    await page.goto('/explore');
    
    // Should show error message
    await expect(page.locator('text=Failed to load parks')).toBeVisible();
    
    // Should show retry button
    await expect(page.locator('text=Try Again')).toBeVisible();
  });
});
