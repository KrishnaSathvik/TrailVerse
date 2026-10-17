import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { installSseTee } from '../../scripts/stage14_8a-sse-tee.js';

/**
 * Stage 14.8B.1 §12 — the acceptance browser SSE tee.
 *
 * In Stage 14.8B the tee observed the stream (`responses: 1`, `closed: true`)
 * but parsed ZERO events: when the script was extracted from a template
 * literal into a shared file, its `\n` escapes stayed literal, so it split the
 * buffer on the two-character sequence backslash-n instead of on newlines.
 *
 * The tee is now a normal exported function — Playwright serializes it into
 * the page, and these tests import and run the very same function against a
 * synthetic stream. No provider, no network, no dynamic evaluation.
 */

const TEE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts', 'stage14_8a-sse-tee.js'),
  'utf8'
);

const SSE_FIXTURE = [
  'data: {"type":"thinking","sources":[]}',
  '',
  'data: {"type":"thinking","stage":"itinerary"}',
  '',
  'data: {"type":"chunk","content":"Day 1"}',
  '',
  'data: {"type":"chunk","content":" — Valley Icons"}',
  '',
  'data: {"type":"stream_end"}',
  '',
  'data: {"type":"done","hasItinerary":true,"messageCount":2,"canSendMore":true,"remainingAllowance":3}',
  '',
  '',
].join('\n');

/** Streams the fixture in awkward chunks so frame boundaries are exercised. */
function fixtureResponse(body, chunkSize) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function runTee({ chunkSize = 24, body = SSE_FIXTURE } = {}) {
  window.fetch = async () => fixtureResponse(body, chunkSize);
  installSseTee();

  const res = await window.fetch('http://127.0.0.1:5101/api/ai/chat-anonymous-stream');
  const reader = res.body.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }

  for (let i = 0; i < 200 && !window.__stage14Sse.closed; i += 1) {
    await new Promise((r) => { setTimeout(r, 5); });
  }
  return window.__stage14Sse;
}

describe('Stage 14.8B.1 §12 — SSE tee parses real stream delimiters', () => {
  beforeEach(() => {
    delete window.__stage14Sse;
  });

  it('splits on real newlines, never on a literal backslash-n', () => {
    expect(TEE_SOURCE).toMatch(/split\('\\n\\n'\)/);
    expect(TEE_SOURCE).not.toMatch(/split\('\\\\n/);
  });

  it('parses the full lifecycle from a synthetic stream', async () => {
    const state = await runTee();
    const types = state.events.map((e) => e.type);

    expect({
      responsesObserved: state.responses,
      streamClosed: state.closed,
      parsedEventsGreaterThanZero: state.events.length > 0,
      doneEvents: types.filter((t) => t === 'done').length,
      parserErrors: 0,
    }).toEqual({
      responsesObserved: 1,
      streamClosed: true,
      parsedEventsGreaterThanZero: true,
      doneEvents: 1,
      parserErrors: 0,
    });

    expect(types).toEqual(['thinking', 'thinking', 'chunk', 'chunk', 'stream_end', 'done']);
  });

  it('carries the terminal quota fields through', async () => {
    const state = await runTee();
    expect(state.events.at(-1)).toMatchObject({
      type: 'done', hasItinerary: true, messageCount: 2, canSendMore: true, remainingAllowance: 3,
    });
  });

  it.each([1, 7, 512])('is chunk-boundary independent at chunk size %i', async (chunkSize) => {
    const state = await runTee({ chunkSize });
    expect(state.events.map((e) => e.type)).toEqual([
      'thinking', 'thinking', 'chunk', 'chunk', 'stream_end', 'done',
    ]);
  });

  it('ignores a malformed frame without losing later events', async () => {
    const body = SSE_FIXTURE.replace(
      'data: {"type":"chunk","content":"Day 1"}',
      'data: {"type":"chunk", NOT JSON'
    );
    const state = await runTee({ body });
    expect(state.events.map((e) => e.type)).toEqual([
      'thinking', 'thinking', 'chunk', 'stream_end', 'done',
    ]);
  });

  it('leaves a non-SSE response untouched', async () => {
    window.fetch = async () => new Response('{"ok":true}', {
      status: 200, headers: { 'content-type': 'application/json' },
    });
    installSseTee();
    const res = await window.fetch('http://127.0.0.1:5101/api/ai/providers-anonymous');
    expect(await res.json()).toEqual({ ok: true });
    expect(window.__stage14Sse.responses).toBe(0);
  });
});
