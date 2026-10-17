'use strict';

/**
 * Stage 14.7F1 §3/§4/§8 — the narrow empty-content rule.
 *
 * The defect this locks down: `content` was unconditionally `required: true`,
 * and Mongoose treats `''` as absent. The canonical revision-1 assistant shell
 * emitted by `itinerary_ready` therefore could not be stored at all, so a new
 * trip could never be created from the early-delivery checkpoint.
 *
 * These tests use schema validation directly (no connection): the rule under
 * test is the schema's, and the HTTP-level proof lives in the route suites.
 */

const mongoose = require('mongoose');
const TripPlan = require('../TripPlan');

const userId = new mongoose.Types.ObjectId();

const baseTrip = (conversation) => ({
  userId,
  parkCode: 'grca',
  parkName: 'Grand Canyon National Park',
  plan: { days: [{ stops: [{ name: 'South Rim' }] }] },
  conversation,
});

/** The exact canonical revision-1 shell. */
const revisionOneShell = (overrides = {}) => ({
  id: 1770000000000,
  role: 'assistant',
  content: '',
  responseId: 'resp-abc',
  responseVersion: 1,
  responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  itineraryHash: 'itin-hash-1',
  ...overrides,
});

const validate = async (conversation) => {
  const doc = new TripPlan(baseTrip(conversation));
  try {
    await doc.validate();
    return { ok: true, paths: [] };
  } catch (error) {
    return { ok: false, paths: Object.keys(error.errors).map((k) => k.split('.').pop()) };
  }
};

describe('§3 — the canonical revision-1 shell is storable', () => {
  test('empty content is accepted for the exact revision-1 shell', async () => {
    const result = await validate([revisionOneShell()]);
    expect(result.ok).toBe(true);
  });

  test('it is accepted alongside the user message that produced it', async () => {
    const result = await validate([
      { id: 1769999999999, role: 'user', content: 'Plan a 3-day trip to the Grand Canyon.' },
      revisionOneShell(),
    ]);
    expect(result.ok).toBe(true);
  });

  test('no placeholder text is required to make it valid', async () => {
    // Guards against "fixing" this by writing a label into canonical content.
    const result = await validate([revisionOneShell({ content: '' })]);
    expect(result.ok).toBe(true);
    const stored = new TripPlan(baseTrip([revisionOneShell()]));
    expect(stored.conversation[0].content).toBe('');
  });
});

describe('§8 — everything else still requires real content', () => {
  const rejected = [
    ['an empty user message', { id: 2, role: 'user', content: '' }],
    ['an empty new legacy terminal assistant message', { id: 3, role: 'assistant', content: '' }],
    ['an explicit empty revision 2', revisionOneShell({ responseRevision: 2, lifecycleStatus: 'prose_ready' })],
    ['an empty prose_ready message', revisionOneShell({ lifecycleStatus: 'prose_ready' })],
    ['an empty fallback_complete message', revisionOneShell({ lifecycleStatus: 'fallback_complete' })],
    ['a revision-1 shell missing responseId', revisionOneShell({ responseId: undefined })],
    ['a revision-1 shell missing itineraryHash', revisionOneShell({ itineraryHash: undefined })],
    ['a revision-1 shell with an unsupported lifecycle', revisionOneShell({ lifecycleStatus: 'streaming' })],
  ];

  test.each(rejected)('rejects %s', async (_label, message) => {
    const result = await validate([message]);
    expect(result.ok).toBe(false);
    expect(result.paths).toContain('content');
  });

  test('rejects a revision-1 shell that carries prose', async () => {
    // The converse rule: prose belongs to revision 2, never to the shell.
    const result = await validate([revisionOneShell({ content: 'Day 1 — start at the South Rim.' })]);
    expect(result.ok).toBe(false);
    expect(result.paths).toContain('content');
  });

  test('rejects a non-numeric conversation message id', async () => {
    // The other half of the original defect: `response-<uuid>` is not a Number.
    const result = await validate([revisionOneShell({ id: 'response-abc' })]);
    expect(result.ok).toBe(false);
    expect(result.paths).toContain('id');
  });
});

describe('§3 — ordinary messages are unaffected', () => {
  test('a normal assistant message with content validates', async () => {
    const result = await validate([{ id: 4, role: 'assistant', content: 'Here is your plan.' }]);
    expect(result.ok).toBe(true);
  });

  test('a terminal revision 2 with prose validates', async () => {
    const result = await validate([
      revisionOneShell({ responseRevision: 2, lifecycleStatus: 'prose_ready', content: 'Day 1 — South Rim.' }),
    ]);
    expect(result.ok).toBe(true);
  });

  test('a pre-Stage-14 message with no revision fields validates', async () => {
    const result = await validate([{ id: 5, role: 'assistant', content: 'Legacy answer.' }]);
    expect(result.ok).toBe(true);
  });
});

describe('§4 — historical read compatibility is not weakened', () => {
  test('an existing stored empty message still hydrates on read', () => {
    // Reading is not validation: records written before this rule keep loading.
    const doc = new TripPlan(baseTrip([]));
    doc.conversation.push({ id: 6, role: 'assistant', content: '' });
    const hydrated = doc.conversation[doc.conversation.length - 1];
    expect(hydrated.content).toBe('');
    expect(hydrated.role).toBe('assistant');
  });

  test('being able to read a historical empty message does not permit creating one', async () => {
    const result = await validate([{ id: 7, role: 'assistant', content: '' }]);
    expect(result.ok).toBe(false);
  });
});
