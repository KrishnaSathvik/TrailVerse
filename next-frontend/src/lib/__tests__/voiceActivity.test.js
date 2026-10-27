import { describe, expect, it } from 'vitest';
import {
  THINKING_VISIBLE_MS,
  TOOL_SLOW_MS,
  deriveVoiceActivity,
  getContextualToolLabel,
  parkDisplayName,
} from '../voiceActivity';

describe('parkDisplayName / tool labels', () => {
  it('resolves verified park codes and rejects invalid ones', () => {
    expect(parkDisplayName('zion')).toBeTruthy();
    expect(parkDisplayName('yose')).toBeTruthy();
    expect(parkDisplayName('nope')).toBeNull();
    expect(parkDisplayName('')).toBeNull();
    expect(parkDisplayName('x')).toBeNull();
  });

  it('builds contextual checking labels from verified args', () => {
    expect(getContextualToolLabel('get_park_details', { park_code: 'zion' })).toMatch(
      /Checking conditions at/i
    );
    expect(getContextualToolLabel('get_park_details', { park_code: 'zzzz' })).toBe(
      'Checking park information'
    );
    expect(getContextualToolLabel('compare_parks', {})).toBe('Comparing parks');
    expect(getContextualToolLabel('search_parks', {})).toBe('Finding matching parks');
    expect(getContextualToolLabel('find_events', { park_code: 'yose' })).toMatch(
      /Checking events at/i
    );
    expect(getContextualToolLabel('get_park_details', {}, { slow: true })).toBe(
      'Still checking park information'
    );
  });
});

describe('deriveVoiceActivity', () => {
  const base = {
    status: 'connected',
    userMuted: false,
    permissionDenied: false,
    authRequired: false,
    bargeInEnabled: false,
    now: 10_000,
  };

  it('maps ready connection to Listening with green wave visual', () => {
    const a = deriveVoiceActivity({ ...base });
    expect(a).toMatchObject({ id: 'listening', label: 'Listening', visual: 'listen-wave' });
  });

  it('maps speech detection to Hearing you', () => {
    const a = deriveVoiceActivity({ ...base, status: 'listening' });
    expect(a).toMatchObject({ id: 'hearing', label: 'Hearing you', visual: 'hear-wave' });
  });

  it('anti-flickers Thinking under 400ms then shows think-dots', () => {
    const started = 10_000;
    const early = deriveVoiceActivity({
      ...base,
      responsePending: true,
      thinkingStartedAt: started,
      now: started + THINKING_VISIBLE_MS - 50,
    });
    expect(early.id).toBe('listening');

    const late = deriveVoiceActivity({
      ...base,
      responsePending: true,
      thinkingStartedAt: started,
      now: started + THINKING_VISIBLE_MS,
    });
    expect(late).toMatchObject({ id: 'thinking', label: 'Thinking', visual: 'think-dots' });
  });

  it('shows Checking only while a tool is executing', () => {
    const a = deriveVoiceActivity({
      ...base,
      isToolCalling: true,
      toolName: 'get_park_details',
      toolArgs: { park_code: 'zion' },
      toolStartedAt: 9_000,
      responsePending: true,
    });
    expect(a.id).toBe('checking');
    expect(a.visual).toBe('think-dots');
    expect(a.label).toMatch(/Checking conditions at/i);
  });

  it('switches to Still checking after ~8s', () => {
    const a = deriveVoiceActivity({
      ...base,
      isToolCalling: true,
      toolName: 'search_parks',
      toolArgs: {},
      toolStartedAt: 1_000,
      now: 1_000 + TOOL_SLOW_MS,
    });
    expect(a.label).toBe('Still checking park information');
  });

  it('returns to Thinking after tool completes while response is pending', () => {
    const a = deriveVoiceActivity({
      ...base,
      isToolCalling: false,
      responsePending: true,
      thinkingStartedAt: 9_000,
      now: 10_000,
    });
    expect(a).toMatchObject({ id: 'thinking', visual: 'think-dots' });
  });

  it('uses dark speak wave while Trailie is speaking', () => {
    const a = deriveVoiceActivity({
      ...base,
      isTrailieSpeaking: true,
      status: 'speaking',
    });
    expect(a).toMatchObject({
      id: 'speaking',
      label: 'Trailie is speaking',
      visual: 'speak-wave',
    });
  });

  it('muted overrides listening/hearing but not speaking', () => {
    expect(
      deriveVoiceActivity({ ...base, userMuted: true }).label
    ).toBe('Microphone muted');

    expect(
      deriveVoiceActivity({
        ...base,
        userMuted: true,
        status: 'listening',
      }).id
    ).toBe('muted');

    expect(
      deriveVoiceActivity({
        ...base,
        userMuted: true,
        isTrailieSpeaking: true,
        status: 'speaking',
      }).id
    ).toBe('speaking');
  });

  it('does not surface Hearing you from speech while speaking when barge-in is off', () => {
    const a = deriveVoiceActivity({
      ...base,
      bargeInEnabled: false,
      isTrailieSpeaking: true,
      status: 'listening', // echo / VAD glitch during playback
    });
    expect(a.id).toBe('speaking');
  });

  it('handles error and connecting session states', () => {
    expect(deriveVoiceActivity({ ...base, status: 'connecting' }).id).toBe('connecting');
    expect(deriveVoiceActivity({ ...base, status: 'error' }).id).toBe('error');
    expect(deriveVoiceActivity({ ...base, authRequired: true }).id).toBe('auth');
  });
});
