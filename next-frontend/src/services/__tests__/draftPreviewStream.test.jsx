import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { consumeAiSseStream } from '../aiService';
import { reduceDraftPreview, draftPreviewEnabled } from '@/lib/trailieDraftPreview';
import TrailieDraftPreview from '@/components/itinerary/TrailieDraftPreview';
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const start = { type: 'draft_started', responseId: 'r', sequence: 1 };
const day = { type: 'draft_day', responseId: 'r', sequence: 2, day: { index: 0, dayNumber: 1, label: 'Arrival', summary: 'Rest after travel.', activities: [{ name: 'River walk', note: 'Keep it short.' }] } };
const response = events => new Response(new ReadableStream({ start(controller) {
  for (const e of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
  controller.close();
} }), { headers: { 'x-trailie-runtime': 'model_first' } });
test('default off and production cannot opt in', () => {
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_DRAFT_PREVIEW', undefined);expect(draftPreviewEnabled()).toBe(false);
  vi.stubEnv('NEXT_PUBLIC_TRAILIE_DRAFT_PREVIEW', 'true');vi.stubEnv('NODE_ENV','production');expect(draftPreviewEnabled()).toBe(false);
  vi.stubEnv('NODE_ENV','development');expect(draftPreviewEnabled()).toBe(true);
});
test('duplicates and stale response IDs cannot change the active draft', () => {
  let state=reduceDraftPreview(null,start);state=reduceDraftPreview(state,day);
  expect(reduceDraftPreview(state,day)).toBe(state);
  expect(reduceDraftPreview(state,{...day,responseId:'old',sequence:3})).toBe(state);
  expect(reduceDraftPreview(state,{...start,responseId:'old'})).toBe(state);
});
test('gaps, withdrawal and interruption erase days and cannot be revived by late events', () => {
  for(const event of [{...day,sequence:4},{type:'draft_withdrawn',responseId:'r',sequence:3},{type:'draft_closed'}]) {
    const active=reduceDraftPreview(reduceDraftPreview(null,start),day);
    const withdrawn=reduceDraftPreview(active,event);expect(withdrawn).toMatchObject({status:'withdrawn',days:[]});
    expect(reduceDraftPreview(withdrawn,{...day,sequence:4})).toBe(withdrawn);
  }
});
test('disconnect withdraws and never emits a canonical plan or retries', async () => {
  let state=null;const onDone=vi.fn();
  await expect(consumeAiSseStream(response([start,day]),{onDraftEvent:e=>{state=reduceDraftPreview(state,e);},onDone}))
    .rejects.toMatchObject({noAutomaticRetry:true});
  expect(state).toMatchObject({status:'withdrawn',days:[]});expect(onDone).not.toHaveBeenCalled();
});
test('drafts never reach canonical/chunk callbacks; late events after final are dropped', async () => {
  const onDraftEvent=vi.fn(),onChunk=vi.fn(),onEarlyEvent=vi.fn(),onDone=vi.fn();
  const canonicalPlan={days:[{dayNumber:1,label:'Accepted'}]};
  await consumeAiSseStream(response([start,day,{type:'done',responseId:'r',persisted:true,canonicalPlan}, {...day,sequence:3}]),
    {onDraftEvent,onChunk,onEarlyEvent,onDone});
  expect(onDraftEvent).toHaveBeenCalledTimes(2);expect(onChunk).not.toHaveBeenCalled();expect(onEarlyEvent).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({canonicalPlan,persisted:true}));
});
test('new connection has no inherited draft or automatic resume', async () => {
  let state=null;
  await expect(consumeAiSseStream(response([{...day,responseId:'old'}]),{onDraftEvent:e=>{state=reduceDraftPreview(state,e);}})).rejects.toThrow();
  expect(state).toBeNull();
});
test('a final response for another request cannot promote the active draft', async () => {
  const onDone=vi.fn(),onDraftEvent=vi.fn();
  await expect(consumeAiSseStream(response([start,day,{type:'done',responseId:'old',persisted:true,canonicalPlan:{days:[]}}]),{onDone,onDraftEvent}))
    .rejects.toMatchObject({noAutomaticRetry:true});
  expect(onDone).not.toHaveBeenCalled();expect(onDraftEvent).toHaveBeenLastCalledWith({type:'draft_closed'});
});
test('preview always labels activities provisional and exposes no trip actions', () => {
  const state=reduceDraftPreview(reduceDraftPreview(null,start),day);
  const {rerender}=render(<TrailieDraftPreview preview={state} />);
  expect(screen.getByText('Draft · Not yet validated')).toBeInTheDocument();
  expect(screen.getByText(/Not yet validated or saved/)).toBeInTheDocument();
  expect(screen.queryAllByRole('link')).toHaveLength(0);expect(screen.queryAllByRole('button')).toHaveLength(0);
  rerender(<TrailieDraftPreview preview={reduceDraftPreview(state,{type:'draft_closed'})} />);
  expect(screen.queryByText('River walk')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Draft preview withdrawn');
});
