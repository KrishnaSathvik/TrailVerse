import http from 'node:http';
import { expect, test } from '@playwright/test';

function startControlledSse({ beforeDone, done }) {
  let releaseDone;
  let beforeDoneSent;
  const beforeDoneReached = new Promise((resolve) => { beforeDoneSent = resolve; });
  const doneReleased = new Promise((resolve) => { releaseDone = resolve; });

  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const submitted = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
    });
    for (const event of beforeDone) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    beforeDoneSent();
    await doneReleased;
    response.write(`data: ${JSON.stringify({
      type: 'stream_end',
    })}\n\n`);
    response.write(`data: ${JSON.stringify({
      type: 'done',
      provider: 'openai',
      model: 'deterministic-fixture',
      anonymousId: submitted.anonymousId,
      messageCount: 1,
      canSendMore: true,
      remainingAllowance: 4,
      ...done,
    })}\n\n`);
    response.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        beforeDoneReached,
        close: () => new Promise((closed) => server.close(closed)),
        releaseDone,
        url: `http://127.0.0.1:${address.port}/api/ai/chat-anonymous-stream`,
      });
    });
  });
}

async function preparePlanAi(page, fixtureUrl) {
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
  await page.route('**/api/parks**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [] }),
  }));
  await page.route('**/api/analytics/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }));
  await page.route('**/api/ai/chat-anonymous-stream', (route) => route.continue({ url: fixtureUrl }));

  await page.goto('/plan-ai');
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
}

async function submit(page) {
  await page.getByRole('textbox', { name: 'Message' }).fill('Exercise attempt ownership');
  await page.getByRole('button', { name: 'Send message' }).click();
}

test.describe('Phase 8D.4.1 attempt-scoped provisional prose', () => {
  test('rapid A → reset → B removes A before B is rendered and finalizes exactly to B', async ({ page }) => {
    const fixture = await startControlledSse({
      beforeDone: [
        { type: 'chunk', content: 'Rejected attempt.' },
        { type: 'content_reset' },
        { type: 'chunk', content: 'Accepted attempt.' },
      ],
      done: { content: 'Accepted attempt.', contentUnchanged: true },
    });

    try {
      await preparePlanAi(page, fixture.url);
      await submit(page);
      await fixture.beforeDoneReached;

      const assistant = page.getByRole('article', { name: 'Assistant message' });
      await expect(assistant).toContainText('Accepted attempt.');
      await expect(assistant).not.toContainText('Rejected attempt.');

      fixture.releaseDone();
      await expect(assistant).toHaveText(/Trailie\s*Accepted attempt\./);
      await expect(assistant).not.toContainText('Rejected attempt.');
      await expect(assistant).toHaveCount(1);
      await expect(page.getByText('Exercise attempt ownership', { exact: true })).toBeVisible();
    } finally {
      fixture.releaseDone();
      await fixture.close();
    }
  });

  test('terminal accepted content replaces deliberately stale provisional content', async ({ page }) => {
    const fixture = await startControlledSse({
      beforeDone: [{ type: 'chunk', content: 'Stale provisional prose.' }],
      done: { content: 'Authoritative accepted prose.', contentUnchanged: true },
    });

    try {
      await preparePlanAi(page, fixture.url);
      await submit(page);
      await fixture.beforeDoneReached;

      const assistant = page.getByRole('article', { name: 'Assistant message' });
      await expect(assistant).toContainText('Stale provisional prose.');

      fixture.releaseDone();
      await expect(assistant).toContainText('Authoritative accepted prose.');
      await expect(assistant).not.toContainText('Stale provisional prose.');
    } finally {
      fixture.releaseDone();
      await fixture.close();
    }
  });

  test('first-attempt success keeps ordinary streaming behavior', async ({ page }) => {
    const fixture = await startControlledSse({
      beforeDone: [{ type: 'chunk', content: 'First attempt succeeds.' }],
      done: { content: 'First attempt succeeds.', contentUnchanged: true },
    });

    try {
      await preparePlanAi(page, fixture.url);
      await submit(page);
      await fixture.beforeDoneReached;

      const assistant = page.getByRole('article', { name: 'Assistant message' });
      await expect(assistant).toContainText('First attempt succeeds.');

      fixture.releaseDone();
      await expect(assistant).toHaveText(/Trailie\s*First attempt succeeds\./);
      await expect(assistant).toHaveCount(1);
    } finally {
      fixture.releaseDone();
      await fixture.close();
    }
  });

  test('empty reset plus two rejected attempts leaves only attempt C', async ({ page }) => {
    const fixture = await startControlledSse({
      beforeDone: [
        { type: 'content_reset' },
        { type: 'chunk', content: 'Attempt A.' },
        { type: 'content_reset' },
        { type: 'chunk', content: 'Attempt B.' },
        { type: 'content_reset' },
        { type: 'chunk', content: 'Attempt C.' },
      ],
      done: { content: 'Attempt C.', contentUnchanged: true },
    });

    try {
      await preparePlanAi(page, fixture.url);
      await submit(page);
      await fixture.beforeDoneReached;

      const assistant = page.getByRole('article', { name: 'Assistant message' });
      await expect(assistant).toContainText('Attempt C.');
      await expect(assistant).not.toContainText('Attempt A.');
      await expect(assistant).not.toContainText('Attempt B.');

      fixture.releaseDone();
      await expect(assistant).toHaveText(/Trailie\s*Attempt C\./);
      await expect(assistant).toHaveCount(1);
    } finally {
      fixture.releaseDone();
      await fixture.close();
    }
  });

  test('all rejected attempts leave terminal failure UX in sole ownership', async ({ page }) => {
    const fixture = await startControlledSse({
      beforeDone: [
        { type: 'chunk', content: 'Attempt A.' },
        { type: 'content_reset' },
        { type: 'chunk', content: 'Attempt B.' },
        { type: 'content_reset' },
        { type: 'chunk', content: 'Attempt C.' },
        { type: 'content_reset' },
      ],
      done: {
        content: 'Raw terminal failure detail.',
        contentUnchanged: false,
        trailieV2: { status: 'failed', terminalReason: 'generation_exhausted' },
      },
    });

    try {
      await preparePlanAi(page, fixture.url);
      await submit(page);
      await fixture.beforeDoneReached;

      await expect(page.getByText('Attempt A.', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Attempt B.', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Attempt C.', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Exercise attempt ownership', { exact: true })).toBeVisible();

      fixture.releaseDone();
      const assistant = page.getByRole('article', { name: 'Assistant message' });
      await expect(assistant).toContainText("I couldn't finish that one.");
      await expect(assistant).not.toContainText('Attempt A.');
      await expect(assistant).not.toContainText('Attempt B.');
      await expect(assistant).not.toContainText('Attempt C.');
      await expect(assistant).not.toContainText('Raw terminal failure detail.');
      await expect(assistant).toHaveCount(1);
    } finally {
      fixture.releaseDone();
      await fixture.close();
    }
  });
});
