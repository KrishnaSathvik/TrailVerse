import { expect, test } from '@playwright/test';

const V2_ID = /^guest_v2_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARED_CONTEXT_OPTIONS = {
  userAgent: 'Trailie Isolation Browser/1.0',
  extraHTTPHeaders: { 'Accept-Language': 'en-US' },
};

async function storedGuest(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('anonymousSession')));
}

async function openPlanAi(page) {
  await page.goto('/plan-ai');
  await expect.poll(async () => (await storedGuest(page))?.anonymousId || null).toMatch(V2_ID);
}

test.describe('Phase 8D.1 anonymous browser isolation (no model dispatch)', () => {
  test('reload and a new page in one browser context preserve one guest bearer', async ({ browser }) => {
    const context = await browser.newContext(SHARED_CONTEXT_OPTIONS);
    const page = await context.newPage();
    await openPlanAi(page);
    const initialId = (await storedGuest(page)).anonymousId;

    await page.reload();
    await expect.poll(async () => (await storedGuest(page))?.anonymousId).toBe(initialId);

    const secondPage = await context.newPage();
    await openPlanAi(secondPage);
    expect((await storedGuest(secondPage)).anonymousId).toBe(initialId);
    await context.close();
  });

  test('two clean contexts with identical browser headers receive distinct bearers', async ({ browser }) => {
    const contextA = await browser.newContext(SHARED_CONTEXT_OPTIONS);
    const contextB = await browser.newContext(SHARED_CONTEXT_OPTIONS);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await Promise.all([openPlanAi(pageA), openPlanAi(pageB)]);
    const guestA = await storedGuest(pageA);
    const guestB = await storedGuest(pageB);

    expect(guestA.anonymousId).not.toBe(guestB.anonymousId);
    expect(guestA.messageCount).toBe(0);
    expect(guestB.messageCount).toBe(0);
    expect(guestB.activeTripContext).toBeUndefined();
    await Promise.all([contextA.close(), contextB.close()]);
  });

  test('a legacy browser rotates once and drops local conversation authority', async ({ browser }) => {
    const context = await browser.newContext(SHARED_CONTEXT_OPTIONS);
    await context.addInitScript(() => {
      if (localStorage.getItem('phase8d_legacy_seeded') === '1') return;
      localStorage.setItem('phase8d_legacy_seeded', '1');
      localStorage.setItem('anonymousSession', JSON.stringify({
        anonymousId: 'anon_0123456789abcdef_012345',
        messageCount: 4,
        activeTripContext: { parkName: 'Olympic National Park' },
        formData: { parkName: 'Olympic National Park' },
        timestamp: Date.now(),
      }));
      localStorage.setItem('planai-chat-state', JSON.stringify({
        messages: [{ role: 'user', content: 'Plan Olympic' }],
        plan: { days: [1, 2, 3] },
      }));
      localStorage.setItem('trailverse_guest_pending_turn', JSON.stringify({
        anonymousId: 'anon_0123456789abcdef_012345',
        status: 'pending',
      }));
    });
    const page = await context.newPage();
    await openPlanAi(page);
    const rotatedId = (await storedGuest(page)).anonymousId;

    expect(await storedGuest(page)).toEqual(expect.objectContaining({
      anonymousId: rotatedId,
      messageCount: 0,
      canSendMore: true,
    }));
    expect(await page.evaluate(() => localStorage.getItem('planai-chat-state'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('trailverse_guest_pending_turn'))).toBeNull();

    await page.reload();
    await expect.poll(async () => (await storedGuest(page))?.anonymousId).toBe(rotatedId);
    await context.close();
  });

  test('the first AI request already carries the client-minted bearer', async ({ browser }) => {
    const context = await browser.newContext(SHARED_CONTEXT_OPTIONS);
    const page = await context.newPage();
    let submittedBody = null;
    let chatRequests = 0;

    await page.route('**/api/ai/providers-anonymous**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ providers: [{ id: 'synthetic', name: 'Synthetic' }] }),
    }));
    await page.route('**/api/ai/session-status/**', (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Session not found', messageCount: 0, canSendMore: true }),
    }));
    await page.route('**/api/ai/chat-anonymous-stream', async (route) => {
      chatRequests += 1;
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'synthetic_no_model_dispatch' }),
      });
    });

    await openPlanAi(page);
    const mintedId = (await storedGuest(page)).anonymousId;
    await page.getByRole('textbox', { name: 'Message' }).fill('Confirm first-request identity only');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect.poll(() => chatRequests).toBe(1);
    expect(submittedBody.anonymousId).toBe(mintedId);
    expect(submittedBody.anonymousId).toMatch(V2_ID);
    await context.close();
  });
});
