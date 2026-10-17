'use strict';

/**
 * Stage 14.7F4 §§2–5, §9 — the shared write contract.
 *
 * The rule under test:
 *   unchanged historical state → passes through byte-equivalent
 *   new or modified state      → must satisfy the current contract
 *
 * Pure unit tests; the authenticated HTTP proof lives in the frontend
 * integration suite.
 */

const {
  validateTripWriteCandidate, isCanonicalRevisionOneShell,
  messagesAreByteEquivalent, findStoredCounterpart, CATEGORY,
} = require('../tripWriteContract');

const HISTORICAL_EMPTY = { id: 1, role: 'assistant', content: '' };
const HISTORICAL_OLD = { id: 2, role: 'assistant', content: 'old answer' };

const rev1 = (o = {}) => ({
  id: 10, role: 'assistant', content: '',
  responseId: 'r1', responseVersion: 1, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready', itineraryHash: 'h1', ...o,
});
const rev2 = (o = {}) => ({
  id: 10, role: 'assistant', content: 'prose',
  responseId: 'r1', responseVersion: 1, responseRevision: 2, previousRevision: 1,
  lifecycleStatus: 'prose_ready', itineraryHash: 'h1', ...o,
});
const user = (o = {}) => ({ id: 9, role: 'user', content: 'Plan a trip.', ...o });

const storedTrip = (conversation) => ({ conversation });
const update = (incomingConversation, existingTrip = storedTrip([]), incomingPlan) =>
  validateTripWriteCandidate({ operation: 'update', existingTrip, incomingConversation, incomingPlan });
const create = (incomingConversation, incomingPlan) =>
  validateTripWriteCandidate({ operation: 'create', incomingConversation, incomingPlan });

describe('§4 — new or changed messages must satisfy the contract', () => {
  const rejected = [
    ['string message id', [rev1({ id: 'response-abc' })], 'message_id_not_numeric'],
    ['empty user message', [user({ content: '' })], 'message_content_required'],
    ['empty new legacy terminal', [{ id: 3, role: 'assistant', content: '' }], 'message_content_required'],
    ['empty explicit revision 2', [rev2({ content: '' })], 'revision_2_content_empty'],
    ['empty prose_ready', [rev1({ lifecycleStatus: 'prose_ready' })], 'revision_1_unsupported_lifecycle'],
    ['empty fallback_complete', [rev1({ lifecycleStatus: 'fallback_complete' })], 'revision_1_unsupported_lifecycle'],
    ['revision 1 missing responseId', [rev1({ responseId: undefined })], 'revision_1_missing_response_id'],
    ['revision 1 missing itineraryHash', [rev1({ itineraryHash: undefined })], 'revision_1_missing_itinerary_hash'],
    ['revision 1 missing responseVersion', [rev1({ responseVersion: undefined })], 'revision_1_missing_response_version'],
    ['revision 1 wrong lifecycle', [rev1({ lifecycleStatus: 'streaming' })], 'revision_1_unsupported_lifecycle'],
    ['revision 1 with prose', [rev1({ content: 'too early' })], 'revision_1_content_not_empty'],
    ['unsupported revision number', [rev1({ responseRevision: 3 })], 'unsupported_response_revision'],
  ];

  test.each(rejected)('rejects %s', (_label, conversation, code) => {
    const verdict = create(conversation);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe(code);
    expect([CATEGORY.SCHEMA, CATEGORY.IDENTITY]).toContain(verdict.category);
  });

  const accepted = [
    ['a valid revision-1 shell', [user(), rev1()]],
    ['a valid revision-2 terminal', [user(), rev2()]],
    ['a valid fallback_complete revision 2', [user(), rev2({ lifecycleStatus: 'fallback_complete' })]],
    ['a normal legacy assistant message', [user(), { id: 3, role: 'assistant', content: 'answer' }]],
  ];

  test.each(accepted)('accepts %s', (_label, conversation) => {
    expect(create(conversation).ok).toBe(true);
  });
});

describe('§5 — plan must agree with its canonical response', () => {
  test('accepts an agreeing plan', () => {
    const plan = { responseId: 'r1', responseVersion: 1, responseRevision: 1, itineraryHash: 'h1' };
    expect(create([user(), rev1()], plan).ok).toBe(true);
  });

  test('rejects a mismatched itinerary hash', () => {
    const plan = { responseId: 'r1', responseVersion: 1, responseRevision: 1, itineraryHash: 'other' };
    const verdict = create([user(), rev1()], plan);
    expect(verdict.ok).toBe(false);
    expect(verdict.category).toBe(CATEGORY.PLAN_MISMATCH);
  });

  test('rejects a mismatched response version', () => {
    const plan = { responseId: 'r1', responseVersion: 99, responseRevision: 1, itineraryHash: 'h1' };
    expect(create([user(), rev1()], plan).code).toBe('plan_response_version_mismatch');
  });

  test('rejects a mismatched revision', () => {
    const plan = { responseId: 'r1', responseVersion: 1, responseRevision: 2, itineraryHash: 'h1' };
    expect(create([user(), rev1()], plan).code).toBe('plan_response_revision_mismatch');
  });
});

describe('§3/§9 — historical exemption', () => {
  const stored = storedTrip([HISTORICAL_EMPTY, HISTORICAL_OLD]);

  test('an unchanged historical empty message passes through', () => {
    expect(update([HISTORICAL_EMPTY, HISTORICAL_OLD], stored).ok).toBe(true);
  });

  test('a historical trip can still receive a valid modern revision-1 turn', () => {
    expect(update([HISTORICAL_EMPTY, HISTORICAL_OLD, user(), rev1()], stored).ok).toBe(true);
  });

  test('and then a valid revision-2 succession', () => {
    expect(update([HISTORICAL_EMPTY, HISTORICAL_OLD, user(), rev2()], stored).ok).toBe(true);
  });

  test('modifying the historical message removes the exemption', () => {
    const modified = { ...HISTORICAL_EMPTY, content: '' , role: 'assistant', lifecycleStatus: 'prose_ready' };
    const verdict = update([modified, HISTORICAL_OLD], stored);
    expect(verdict.ok).toBe(false);
  });

  test('changing content on a historical message removes the exemption', () => {
    const verdict = update([{ ...HISTORICAL_OLD, content: '' }, HISTORICAL_EMPTY], stored);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('message_content_required');
  });

  test('the exemption is trip-local: a copied malformed object is rejected elsewhere', () => {
    const otherTrip = storedTrip([{ id: 77, role: 'user', content: 'different trip' }]);
    const verdict = update([HISTORICAL_EMPTY], otherTrip);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('message_content_required');
  });

  test('a new message reusing a historical numeric id is not exempt', () => {
    // Same id, different object → byte-equivalence fails → validated as new.
    const impostor = { id: HISTORICAL_EMPTY.id, role: 'assistant', content: '', responseId: 'r9' };
    const verdict = update([impostor], stored);
    expect(verdict.ok).toBe(false);
  });

  test('ambiguous historical matching fails closed', () => {
    const ambiguous = storedTrip([
      { id: 5, role: 'assistant', content: '' },
      { id: 5, role: 'assistant', content: '' },
    ]);
    const verdict = update([{ id: 5, role: 'assistant', content: '' }], ambiguous);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('historical_match_ambiguous');
  });

  test('reordering does not let a malformed object be substituted', () => {
    const verdict = update([HISTORICAL_OLD, { id: 3, role: 'assistant', content: '' }], stored);
    expect(verdict.ok).toBe(false);
  });

  test('create never grants a historical exemption', () => {
    expect(create([HISTORICAL_EMPTY]).ok).toBe(false);
  });
});

describe('§2 — one shared definition, no drift', () => {
  test('the schema and the validator use the same revision-1 predicate', () => {
    const fs = require('fs');
    const path = require('path');
    const schemaSrc = fs.readFileSync(path.join(__dirname, '../../models/TripPlan.js'), 'utf8');
    expect(schemaSrc).toMatch(/require\('\.\.\/validation\/tripWriteContract'\)/);
    expect(schemaSrc).not.toMatch(/function isCanonicalRevisionOneShell/);
  });

  test('the predicate accepts only the canonical shell', () => {
    expect(isCanonicalRevisionOneShell(rev1())).toBe(true);
    expect(isCanonicalRevisionOneShell(rev1({ responseId: undefined }))).toBe(false);
    expect(isCanonicalRevisionOneShell(rev1({ lifecycleStatus: 'prose_ready' }))).toBe(false);
    expect(isCanonicalRevisionOneShell(user())).toBe(false);
  });
});

describe('§2 — purity and bounded output', () => {
  test('the validator performs no database or network work', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../tripWriteContract.js'), 'utf8');
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    expect(requires).toEqual([]);
  });

  test('verdicts carry no submitted values', () => {
    const secret = 'super-secret-user-text';
    const verdict = create([user({ content: '' }), { id: 4, role: 'assistant', content: '', responseId: secret }]);
    expect(JSON.stringify(verdict)).not.toContain(secret);
    expect(verdict.field).toMatch(/^conversation\[\d+\]/);
  });
});

describe('helpers', () => {
  test('byte-equivalence compares persisted fields only', () => {
    expect(messagesAreByteEquivalent(HISTORICAL_EMPTY, { ...HISTORICAL_EMPTY })).toBe(true);
    expect(messagesAreByteEquivalent(HISTORICAL_EMPTY, { ...HISTORICAL_EMPTY, content: 'x' })).toBe(false);
    // Volatile/presentation fields do not break the match.
    expect(messagesAreByteEquivalent(HISTORICAL_EMPTY, { ...HISTORICAL_EMPTY, isStreaming: true })).toBe(true);
  });

  test('counterpart matching prefers responseId, then numeric id', () => {
    const stored = [HISTORICAL_EMPTY, rev1()];
    expect(findStoredCounterpart(rev1(), stored).match).toEqual(rev1());
    expect(findStoredCounterpart(HISTORICAL_EMPTY, stored).match).toEqual(HISTORICAL_EMPTY);
  });
});
