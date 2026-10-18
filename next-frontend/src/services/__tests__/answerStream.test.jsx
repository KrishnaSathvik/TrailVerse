import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import aiService, { consumeAiSseStream } from '../aiService';
import { answerStreamEnabled, answerStreamHeaders, reduceAnswerStream } from '@/lib/trailieAnswerStream';
import ProvisionalAnswer from '@/components/ai-chat/ProvisionalAnswer';

vi.mock('@/services/authService', () => ({ getAuthBearerToken: () => 'fixture-token' }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const start = { type: 'answer_started', responseId: 'reply', sequence: 1 };
const delta = { type: 'answer_delta', responseId: 'reply', sequence: 2, content: 'September is often quieter.' };
const final = { type: 'done', responseId: 'reply', persisted: true, content: 'September is often quieter.' };
function stream() {
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { 'x-trailie-runtime': 'model_first' } });
  return { response, send: event => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)), close: () => controller.close() };
}
function responseFor(events) {
  const fixture = stream();
  events.forEach(fixture.send); fixture.close(); return fixture.response;
}

test('flag is default-off and rollback removes negotiation', () => {
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_ANSWER_STREAM', undefined);
  expect(answerStreamEnabled()).toBe(false); expect(answerStreamHeaders()).toEqual({});
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_ANSWER_STREAM', 'true');
  expect(answerStreamHeaders()).toEqual({ 'x-trailie-answer-stream': '1' });
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_ANSWER_STREAM', 'false');
  expect(answerStreamHeaders()).toEqual({});
});

test.each(['chatStream', 'chatAnonymousStream'])('%s negotiates only for an enabled, capable client', async method => {
  const fetch = vi.fn(async () => responseFor([final])); vi.stubGlobal('fetch', fetch);
  const options = { messages: [{ role: 'user', content: 'Compare parks.' }], onAnswerEvent: vi.fn() };
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_ANSWER_STREAM', 'false');
  await aiService[method](options);
  expect(fetch.mock.calls[0][1].headers['x-trailie-answer-stream']).toBeUndefined();
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_ANSWER_STREAM', 'true');
  await aiService[method](options);
  expect(fetch.mock.calls[1][1].headers['x-trailie-answer-stream']).toBe('1');
  await aiService[method]({ ...options, onAnswerEvent: undefined });
  expect(fetch.mock.calls[2][1].headers['x-trailie-answer-stream']).toBeUndefined();
});

test('no pre-handoff text; progressive provisional rendering never enters canonical callbacks', async () => {
  const fixture = stream(), onChunk = vi.fn(), onDone = vi.fn(), cancel = vi.fn();
  let receive;
  function Harness() {
    const [answer, setAnswer] = useState(null);
    useEffect(() => { receive = event => setAnswer(state => reduceAnswerStream(state, event)); }, []);
    return <ProvisionalAnswer answer={answer} onCancel={cancel} />;
  }
  render(<Harness />);
  const pending = consumeAiSseStream(fixture.response, { onAnswerEvent: event => receive(event), onChunk, onDone });
  await act(async () => fixture.send(delta));
  expect(screen.queryByText(delta.content)).not.toBeInTheDocument();
  await act(async () => fixture.send(start));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  await act(async () => fixture.send(delta));
  expect(screen.getByText(delta.content)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Provisional answer · Not saved yet');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(onChunk).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' })); expect(cancel).toHaveBeenCalledOnce();
  await act(async () => { fixture.send(final); fixture.close(); await pending; });
  expect(onDone).toHaveBeenCalledOnce();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

test.each(['disconnect', 'error', 'wrong-response', 'uncommitted'])('%s clears provisional text and prevents final acceptance/replay', async failure => {
  let state = null;
  const onDone = vi.fn(), events = [start, delta];
  if (failure === 'error') events.push({ type: 'error', message: 'Could not finish', retryable: false });
  if (failure === 'wrong-response') events.push({ ...final, responseId: 'other' });
  if (failure === 'uncommitted') events.push({ ...final, persisted: false });
  await expect(consumeAiSseStream(responseFor(events), { onAnswerEvent: event => { state = reduceAnswerStream(state, event); }, onDone }))
    .rejects.toMatchObject({ noAutomaticRetry: true });
  expect(state).toBeNull(); expect(onDone).not.toHaveBeenCalled();
});

test('withdrawal, invalid ordering and stale identities cannot revive provisional text', () => {
  const active = reduceAnswerStream(reduceAnswerStream(null, start), delta);
  expect(reduceAnswerStream(active, { ...delta, responseId: 'old', sequence: 3 })).toBe(active);
  for (const event of [{ ...delta, sequence: 4 }, { type: 'answer_withdrawn', responseId: 'reply', sequence: 3 }]) {
    const withdrawn = reduceAnswerStream(active, event);
    expect(withdrawn).toMatchObject({ withdrawn: true, content: '' });
    expect(reduceAnswerStream(withdrawn, { ...delta, sequence: 4 })).toBe(withdrawn);
  }
});

test('late deltas after terminal cannot revive the answer', async () => {
  const events = [];
  await consumeAiSseStream(responseFor([start, delta, final, { ...delta, sequence: 3 }]), { onAnswerEvent: event => events.push(event) });
  expect(events.map(event => event.type)).toEqual(['answer_started', 'answer_delta', 'answer_closed']);
});
