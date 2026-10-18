import { test, expect } from '@playwright/test';

const owner = { _id: 'my-trips-fixture-owner', firstName: 'Alex', lastName: 'Traveler', email: 'alex@example.test', createdAt: '2026-01-01' };
const trip = {
  _id: 'my-trips-fixture-plan', userId: owner._id, title: 'Yellowstone wildlife trip', parkName: 'Yellowstone National Park', status: 'active', updatedAt: '2026-10-15',
  plan: { parkName: 'Yellowstone National Park', days: Array.from({ length: 4 }, (_, index) => ({ dayNumber: index + 1, label: `Explore Yellowstone · Day ${index + 1}`, stops: [], dayStructure: { summary: 'A relaxed day with flexible wildlife viewing.', blocks: [{ kind: 'experience', period: 'morning', title: 'Wildlife viewing' }] } })) },
  conversation: [{ id: 1, role: 'user', content: 'Plan four days in Yellowstone.' }, { id: 2, role: 'assistant', content: 'Here is your Yellowstone trip.' }],
};
const conversation = { _id: 'my-trips-fixture-chat', userId: owner._id, title: 'Acadia or Shenandoah?', status: 'active', updatedAt: '2026-10-14', plan: null, conversation: [{ id: 1, role: 'user', content: 'Which park would suit a relaxed fall weekend?' }, { id: 2, role: 'assistant', content: 'Let’s compare the coast and the mountains.' }] };

for (const width of [1440, 390]) {
  test(`My Trips at ${width}px`, async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await context.addCookies([{ name: 'trailverse_auth_token', value: 'local-fixture-only', url: 'http://127.0.0.1:3000' }]);
    await page.addInitScript(user => {
      localStorage.setItem('token', 'local-fixture-only');
      localStorage.setItem('user', JSON.stringify(user));
    }, owner);
    await page.routeWebSocket(/socket\.io/, socket => {
      socket.send('0{"sid":"fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
      socket.onMessage(message => {
        if (String(message).startsWith('40')) socket.send('40{"sid":"fixture"}');
        if (message === '2') socket.send('3');
      });
    });
    let records = [structuredClone(trip), structuredClone(conversation)];
    let socketReady = false;
    await page.route('**/socket.io/**', async route => {
      const url = new URL(route.request().url());
      let body = 'ok';
      if (route.request().method() === 'GET') {
        if (!url.searchParams.has('sid')) {
          socketReady = false;
          body = '0{"sid":"fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}';
        } else if (!socketReady) {
          socketReady = true;
          body = '40{"sid":"fixture"}\u001e42["authenticated",{"userId":"my-trips-fixture-owner"}]';
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          body = '6';
        }
      }
      await route.fulfill({ contentType: 'text/plain', body });
    });
    await page.route('**/api/**', async route => {
      if (route.request().resourceType() === 'script') {
        await route.fulfill({ contentType: 'application/javascript', body: '' });
        return;
      }
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      let data = [];
      if (path.endsWith('/auth/me')) data = owner;
      else if (path.includes('/trips/user/')) data = records;
      else if (path.endsWith('/metadata')) {
        const id = path.split('/').at(-2);
        records = records.map(record => record._id === id ? { ...record, ...route.request().postDataJSON() } : record);
        data = records.find(record => record._id === id);
      } else if (path.includes('/trips/')) data = records.find(record => record._id === path.split('/').at(-1));
      else if (path.includes('/providers')) {
        await route.fulfill({ json: { success: true, providers: [{ id: 'openai', name: 'OpenAI', available: true }] } });
        return;
      }
      if (/chat-stream|chat-anonymous|plan-itinerary/.test(path) && method === 'POST') throw new Error('No model calls permitted');
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/chat-history');
    await expect(page.getByRole('heading', { name: 'My Trips', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open trip', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Resume conversation', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`my-trips-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Conversations (1)' }).click();
    await expect(page.getByRole('link', { name: 'Open trip', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'All (2)' }).click();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await page.getByRole('article').filter({ hasText: 'Acadia or Shenandoah?' }).getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('button', { name: 'Archived (1)' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByText('Nothing archived here yet')).toBeVisible();
    await page.getByRole('button', { name: 'All (2)' }).click();
    await expect(page.getByRole('link', { name: 'Resume conversation', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Conversations (1)' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Archived (0)' })).toBeFocused();
    await page.getByRole('link', { name: 'Open trip', exact: true }).click();
    await expect(page).toHaveURL(/\/plan-ai\/my-trips-fixture-plan\/plan$/);
    await expect(page.getByRole('tab', { name: 'Map', exact: true })).toBeVisible();
    await page.goto('/chat-history');
    await page.getByRole('link', { name: 'Resume conversation', exact: true }).click();
    await expect(page).toHaveURL(/\/plan-ai\/my-trips-fixture-chat\?chat=true$/);
    await expect(page.getByText('Which park would suit a relaxed fall weekend?', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
