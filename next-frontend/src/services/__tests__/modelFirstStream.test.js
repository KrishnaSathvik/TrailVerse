import { consumeAiSseStream } from '../aiService';
import fs from 'node:fs';
import path from 'node:path';
import { isUncertainConnectionLossError } from '../../utils/trailieTurnOutcome';

const response = events => {
  let read = false;
  return { headers: { get: () => 'model_first' }, body: { getReader: () => ({ read: async () => {
    if (read) return { done: true };
    read = true;
    return { done: false, value: new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')) };
  } }) } };
};

test.each(['done', 'response_finalized'])('model-first %s preserves canonical, memory and persistence fields', async type => {
  const data = JSON.parse(fs.readFileSync(path.resolve('../artifacts/trailie-model-first-cutover-2026-09-30/contract-fixture.json')));
  const onDone = vi.fn();
  await consumeAiSseStream(response([{ type, ...data }]), { onDone });
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining(data));
});

test('bounded model-first failure stops without automatic paid replay', async () => {
  const onDone = vi.fn();
  await expect(consumeAiSseStream(response([{ type: 'error', message: 'Failed safely', retryable: false }]), { onDone }))
    .rejects.toMatchObject({ noAutomaticRetry: true });
  expect(onDone).not.toHaveBeenCalled();
});

test('a disconnected model-first stream cannot be promoted to an accepted answer', async () => {
  await expect(consumeAiSseStream(response([{ type: 'chunk', content: 'partial' }])))
    .rejects.toMatchObject({ noAutomaticRetry: true });
});

test('server timeout retains its code and is not misreported as a lost connection', async () => {
  let failure;
  try {
    await consumeAiSseStream(response([{ type: 'error', code: 'responses_timeout', responseId: 'test-response',
      message: 'Trailie took too long to respond. Your saved trip was not changed.', retryable: false }]));
  } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'responses_timeout', responseId: 'test-response',
    serverResolvedFailure: true, noAutomaticRetry: true });
  expect(isUncertainConnectionLossError(failure)).toBe(false);
  expect(isUncertainConnectionLossError(new Error('disconnected'))).toBe(true);
});
