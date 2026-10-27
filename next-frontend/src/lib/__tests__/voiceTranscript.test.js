import { describe, expect, it } from 'vitest';
import { applyVoiceTranscriptEvent } from '../voiceTranscript';

describe('applyVoiceTranscriptEvent', () => {
  it('accumulates assistant audio transcript deltas without inventing text', () => {
    let state = [];
    state = applyVoiceTranscriptEvent(state, {
      type: 'response.output_audio_transcript.delta',
      item_id: 'a1',
      delta: 'Gateway Arch',
    });
    state = applyVoiceTranscriptEvent(state, {
      type: 'response.output_audio_transcript.delta',
      item_id: 'a1',
      delta: ' is nearby.',
    });
    expect(state).toEqual([
      { id: 'a1', role: 'assistant', text: 'Gateway Arch is nearby.', streaming: true },
    ]);
  });

  it('finalizes with the done transcript when longer than streamed text', () => {
    let state = [
      { id: 'a1', role: 'assistant', text: 'Partial', streaming: true },
    ];
    state = applyVoiceTranscriptEvent(state, {
      type: 'response.output_audio_transcript.done',
      item_id: 'a1',
      transcript: 'Partial answer completed in full.',
    });
    expect(state[0]).toMatchObject({
      text: 'Partial answer completed in full.',
      streaming: false,
    });
  });

  it('streams user transcription deltas then finalizes', () => {
    let state = [];
    state = applyVoiceTranscriptEvent(state, {
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'u9',
      delta: 'What about',
    });
    state = applyVoiceTranscriptEvent(state, {
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'u9',
      delta: ' hiking?',
    });
    state = applyVoiceTranscriptEvent(state, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u9',
      transcript: 'What about hiking?',
    });
    expect(state).toEqual([
      { id: 'u9', role: 'user', text: 'What about hiking?', streaming: false },
    ]);
  });

  it('keeps prior turns when more messages arrive', () => {
    let state = [
      { id: 'u1', role: 'user', text: 'What park is near me?' },
      { id: 'a1', role: 'assistant', text: 'Try Gateway Arch.', streaming: false },
    ];
    state = applyVoiceTranscriptEvent(state, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u2',
      transcript: 'Tell me more.',
    });
    expect(state).toHaveLength(3);
    expect(state.map((m) => m.text)).toEqual([
      'What park is near me?',
      'Try Gateway Arch.',
      'Tell me more.',
    ]);
  });

  it('does not wipe history on function-call output items', () => {
    const prev = [
      { role: 'user', text: 'Alerts?' },
      { role: 'assistant', text: 'Checking now.', streaming: false },
    ];
    const next = applyVoiceTranscriptEvent(prev, {
      type: 'response.output_item.added',
      item: { type: 'function_call', name: 'get_park_details' },
    });
    expect(next).toEqual(prev);
  });

  it('marks interrupted streaming replies as incomplete', () => {
    let state = [
      { id: 'a1', role: 'assistant', text: 'Halfway through…', streaming: true },
    ];
    state = applyVoiceTranscriptEvent(state, { type: 'response.cancelled' });
    expect(state[0]).toMatchObject({
      streaming: false,
      incomplete: true,
      text: 'Halfway through…',
    });
  });

  it('preserves a long assistant response intact', () => {
    const long = `${'Park details. '.repeat(80)}End.`;
    expect(long.length).toBeGreaterThan(500);
    let state = [];
    // stream in chunks
    for (let i = 0; i < long.length; i += 40) {
      state = applyVoiceTranscriptEvent(state, {
        type: 'response.output_audio_transcript.delta',
        item_id: 'long1',
        delta: long.slice(i, i + 40),
      });
    }
    state = applyVoiceTranscriptEvent(state, {
      type: 'response.output_audio_transcript.done',
      item_id: 'long1',
      transcript: long,
    });
    expect(state[0].text).toBe(long);
    expect(state[0].text.endsWith('…')).toBe(false);
  });
});
