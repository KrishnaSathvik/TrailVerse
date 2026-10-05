import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// authService reads localStorage; stub it so the request has a deterministic token.
vi.mock('@/services/authService', () => ({ getAuthBearerToken: () => 'TESTTOKEN' }));

import aiService from '@/services/aiService';

const FLAG = 'NEXT_PUBLIC_TRAILIE_TRANSPORT_V2';

/** A fetch that captures the request and returns an immediately-complete SSE. */
function stubFetch() {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', content: 'ok' })}\n`);
    let sent = false;
    return {
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })) }) },
    };
  });
  return { calls, fn };
}

let restoreFetch;
beforeEach(() => {
  const { calls, fn } = stubFetch();
  globalThis.__calls = calls;
  restoreFetch = globalThis.fetch;
  globalThis.fetch = fn;
});
afterEach(() => {
  globalThis.fetch = restoreFetch;
  delete process.env[FLAG];
  delete globalThis.__calls;
});

const headerOf = (init, name) => {
  const h = init.headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
};

async function runAuthStream() {
  await aiService.chatStream({ messages: [{ role: 'user', content: 'hi' }], provider: 'claude', onDone: () => {} });
  return globalThis.__calls[0];
}
async function runAnonStream() {
  await aiService.chatAnonymousStream({ messages: [{ role: 'user', content: 'hi' }], provider: 'claude', anonymousId: 'anon-1', onDone: () => {} });
  return globalThis.__calls[0];
}

function stubResetStream() {
  globalThis.fetch = vi.fn(async () => {
    const bytes = new TextEncoder().encode([
      `data: ${JSON.stringify({ type: 'content_delta', content: 'Rejected attempt.' })}\n`,
      `data: ${JSON.stringify({ type: 'content_reset' })}\n`,
      `data: ${JSON.stringify({ type: 'content_delta', content: 'Accepted attempt.' })}\n`,
      `data: ${JSON.stringify({ type: 'done', content: 'Accepted attempt.' })}\n`,
    ].join(''));
    let sent = false;
    return {
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })) }) },
    };
  });
}

describe('WP10F-3 — client sends the v2 negotiation signal ONLY when its own flag is on', () => {
  it('flag OFF → no x-trailie-transport header (auth stream)', async () => {
    delete process.env[FLAG];
    const { init } = await runAuthStream();
    expect(headerOf(init, 'x-trailie-transport')).toBeUndefined();
  });

  it('flag ON → sends x-trailie-transport: v2 (auth stream)', async () => {
    process.env[FLAG] = 'true';
    const { init } = await runAuthStream();
    expect(headerOf(init, 'x-trailie-transport')).toBe('v2');
  });

  it('flag OFF → no header (anonymous stream)', async () => {
    delete process.env[FLAG];
    const { init } = await runAnonStream();
    expect(headerOf(init, 'x-trailie-transport')).toBeUndefined();
  });

  it('flag ON → sends the signal (anonymous stream)', async () => {
    process.env[FLAG] = 'true';
    const { init } = await runAnonStream();
    expect(headerOf(init, 'x-trailie-transport')).toBe('v2');
  });

  it('a non-"true" flag value stays OFF (fail closed)', async () => {
    process.env[FLAG] = '1-ish-yes';
    const { init } = await runAuthStream();
    expect(headerOf(init, 'x-trailie-transport')).toBeUndefined();
  });
});

describe('WP10F-3 — negotiation plumbing does not disturb the rest of the request', () => {
  it('auth headers, body, endpoint, and signal are unchanged whether the flag is on or off', async () => {
    const controller = new AbortController();

    delete process.env[FLAG];
    await aiService.chatStream({
      messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'SYS', provider: 'claude',
      metadata: { parkCode: 'zion' }, signal: controller.signal, onDone: () => {},
    });
    const off = globalThis.__calls[0];

    globalThis.__calls.length = 0;
    process.env[FLAG] = 'true';
    await aiService.chatStream({
      messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'SYS', provider: 'claude',
      metadata: { parkCode: 'zion' }, signal: controller.signal, onDone: () => {},
    });
    const on = globalThis.__calls[0];

    // endpoint + method identical
    expect(on.url).toBe(off.url);
    expect(on.url).toContain('/ai/chat-stream');
    expect(on.init.method).toBe('POST');
    // auth + content-type preserved on both
    expect(headerOf(on.init, 'Authorization')).toBe('Bearer TESTTOKEN');
    expect(headerOf(off.init, 'Authorization')).toBe('Bearer TESTTOKEN');
    expect(headerOf(on.init, 'Content-Type')).toBe('application/json');
    // credentials + abort signal preserved
    expect(on.init.credentials).toBe('include');
    expect(on.init.signal).toBe(controller.signal);
    // body byte-identical — negotiation rides the HEADER, never the body
    expect(on.init.body).toBe(off.init.body);
    // the ONLY difference is the added negotiation header
    expect(headerOf(off.init, 'x-trailie-transport')).toBeUndefined();
    expect(headerOf(on.init, 'x-trailie-transport')).toBe('v2');
  });

  it('anonymous stream keeps its no-auth, session-body shape; only the header is added', async () => {
    process.env[FLAG] = 'true';
    const { url, init } = await runAnonStream();
    expect(url).toContain('/ai/chat-anonymous-stream');
    expect(headerOf(init, 'Authorization')).toBeUndefined(); // anonymous carries no bearer
    const body = JSON.parse(init.body);
    expect(body.anonymousId).toBe('anon-1');
    expect(headerOf(init, 'x-trailie-transport')).toBe('v2');
  });
});

describe('attempt-scoped content reset callback wiring', () => {
  it('forwards content_reset through the authenticated service boundary', async () => {
    stubResetStream();
    const onContentReset = vi.fn();

    await aiService.chatStream({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'claude',
      onContentReset,
      onDone: () => {},
    });

    expect(onContentReset).toHaveBeenCalledOnce();
  });

  it('forwards content_reset through the anonymous service boundary', async () => {
    stubResetStream();
    const onContentReset = vi.fn();

    await aiService.chatAnonymousStream({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'claude',
      anonymousId: 'guest_v2_test',
      onContentReset,
      onDone: () => {},
    });

    expect(onContentReset).toHaveBeenCalledOnce();
  });
});
