'use strict';

const { createMemoryAuthorityVerifier, memoryAdmission } = require('../trailieMemoryAuthority');
const { createMemoryVerificationModel, TIMEOUT_MS } = require('../trailieMemoryVerificationModel');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');
const cases = require('../../../tests/fixtures/memoryAuthorityCases.json');
const message = 'We are renting a car.';
const update = { field: 'transportation', value: { rentalCar: true }, sourceQuote: message };
const verdict = { id: 0, supported: true, relationship: 'explicit', reason: 'Explicit statement.' };
const output = value => ({ completionStatus: 'completed', toolCalls: [], outputText: JSON.stringify(value) });

test.each(cases)('guard enforces golden semantic verdict: $name (not a live semantic accuracy test)', async (fixture) => {
  const { authority, ...proposed } = fixture.update;
  const verified = await stubMemoryVerifier(fixture.expectedAccept ? 'explicit' : 'unsupported')({ message: fixture.message, updates: [proposed] });
  const snapshot = { planningState: { preferences: { pace: 'relaxed' } } };
  const before = structuredClone(snapshot);
  const result = validateSimpleMutation({ message: fixture.message, snapshot, memoryAuthority: verified.receipt,
    proposal: { response: 'Conditional update.', memory_updates: [proposed] } });
  expect(result.ok).toBe(fixture.expectedAccept);
  expect(snapshot).toEqual(before);
  if (!fixture.expectedAccept) expect(result.planningState).toEqual(snapshot.planningState);
});

test('quote presence or a forged JSON approval cannot authorize a memory write', () => {
  for (const memoryAuthority of [null, {}, { supported: true, relationship: 'explicit', authority: 'explicit' }]) {
    const result = validateSimpleMutation({ message, memoryAuthority,
      proposal: { response: 'Done', memory_updates: [update] } });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('memory_authority_unverified');
    expect(result.planningState).toEqual({});
  }
  expect(validateSimpleMutation({ message, proposal: { response: 'Done', memory_updates: [{ ...update, authority: 'explicit' }] } }).ok).toBe(false);
});

test('approval binds message, quote, exact field and value, including correction reuse', async () => {
  const { receipt } = await stubMemoryVerifier()({ message, updates: [update] });
  expect(memoryAdmission(receipt, message, update)).toBe('explicit');
  expect(memoryAdmission(receipt, message + ' Just kidding.', update)).toBe('unverified');
  expect(memoryAdmission(receipt, message, { ...update, sourceQuote: 'renting a car' })).toBe('unverified');
  expect(memoryAdmission(receipt, message, { ...update, value: { rentalCar: false } })).toBe('unverified');
  expect(memoryAdmission(receipt, message, { ...update, field: 'lodging', value: { booked: true } })).toBe('unverified');
  expect(memoryAdmission(structuredClone(receipt), message, update)).toBe('unverified');
});

test('one batch contains only the current message and exact leaf facts; mixed authority is atomic', async () => {
  const model = jest.fn(async () => output({ verdicts: [verdict, { ...verdict, id: 1, supported: false, relationship: 'unsupported' }] }));
  const verify = createMemoryAuthorityVerifier({ model });
  const mixed = { ...update, value: { rentalCar: true, mode: 'fly' } };
  const { receipt } = await verify({ message, updates: [mixed], history: ['PRIVATE_HISTORY'], snapshot: { plan: 'PRIVATE_PLAN' } });
  expect(model).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(model.mock.calls[0][0].input[0].content);
  expect(Object.keys(payload)).toEqual(['message', 'facts']);
  expect(payload.facts).toEqual([
    { id: 0, field: 'transportation.rentalCar', value: true, sourceQuote: message },
    { id: 1, field: 'transportation.mode', value: 'fly', sourceQuote: message },
  ]);
  const result = validateSimpleMutation({ message, memoryAuthority: receipt,
    proposal: { response: 'Update', memory_updates: [mixed] } });
  expect(result.ok).toBe(false);
  expect(result.planningState).toEqual({});
  // A correction may keep the independently verified subset, without rechecking.
  expect(memoryAdmission(receipt, message, update)).toBe('explicit');
});

test.each([
  { verdicts: [] }, { verdicts: [verdict, verdict] }, { verdicts: [{ ...verdict, id: 5 }] },
  { verdicts: [{ ...verdict, supported: true, relationship: 'uncertain' }] },
  { verdicts: [{ ...verdict, supported: false }] }, { verdicts: [{ ...verdict, authority: 'explicit' }] },
  { verdicts: [{ ...verdict, reason: '' }] }, { verdicts: [{ ...verdict, reason: 'x'.repeat(301) }] },
  { verdicts: [verdict], injected: true }, null,
])('malformed/inconsistent/incomplete verifier data fails closed: %#', async data => {
  const verified = await createMemoryAuthorityVerifier({ model: async () => output(data) })({ message, updates: [update] });
  expect(verified.receipt).toBeNull();
});

test.each([
  { completionStatus: 'incomplete' }, { refusal: 'Cannot verify' },
  { toolCalls: [{ name: 'read_travel' }] }, { outputText: 'not JSON' },
])('refusal/truncation/tool calls/invalid JSON confer no authority: %#', async override => {
  const verified = await createMemoryAuthorityVerifier({ model: async () => ({ ...output({ verdicts: [verdict] }), ...override }) })({ message, updates: [update] });
  expect(verified.receipt).toBeNull();
});

test('unavailable verifier never retries and absent quotes or oversized input never dispatch', async () => {
  const model = jest.fn(async () => { throw new Error('PRIVATE_PROVIDER_BODY'); });
  const verify = createMemoryAuthorityVerifier({ model });
  expect(await verify({ message, updates: [update] })).toMatchObject({ status: 'unavailable', receipt: null });
  expect(model).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(await verify({ message, updates: [{ ...update, sourceQuote: 'absent' }] }))).not.toContain('PRIVATE');
  await verify({ message: 'x'.repeat(30001), updates: [update] });
  expect(model).toHaveBeenCalledTimes(1);
});

test('mutating input during verification cannot expand the approval', async () => {
  const mutable = structuredClone(update);
  const verify = createMemoryAuthorityVerifier({ model: async () => {
    mutable.value.mode = 'drive';
    return output({ verdicts: [verdict] });
  } });
  const { receipt } = await verify({ message, updates: [mutable] });
  expect(memoryAdmission(receipt, message, mutable)).toBe('unverified');
});

test('actual adapter makes one tool-free, stateless, structured request with bounded tokens/time and no SDK retries', async () => {
  const client = { responses: { create: jest.fn(async () => ({ status: 'completed', output_text: JSON.stringify({ verdicts: [verdict] }), output: [] })) } };
  const verify = createMemoryAuthorityVerifier({ model: createMemoryVerificationModel({ client }) });
  expect((await verify({ message, updates: [update] })).status).toBe('verified');
  expect(client.responses.create).toHaveBeenCalledTimes(1);
  const [body, options] = client.responses.create.mock.calls[0];
  expect(body).toMatchObject({ model: 'gpt-6.1-sol', reasoning: { effort: 'low' }, max_output_tokens: 4096, store: false,
    tool_choice: 'none', text: { format: { type: 'json_schema', strict: true } } });
  expect(body.tools).toBeUndefined();
  expect(body.previous_response_id).toBeUndefined();
  expect(body.input).toHaveLength(1);
  expect(options).toMatchObject({ timeout: 15000, maxRetries: 0 });
});

test('deadline aborts the request and yields no authority or retry', async () => {
  jest.useFakeTimers();
  try {
    const client = { responses: { create: jest.fn((body, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    })) } };
    const pending = createMemoryAuthorityVerifier({ model: createMemoryVerificationModel({ client }) })({ message, updates: [update] });
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(await pending).toMatchObject({ status: 'unavailable', receipt: null });
    expect(client.responses.create).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
