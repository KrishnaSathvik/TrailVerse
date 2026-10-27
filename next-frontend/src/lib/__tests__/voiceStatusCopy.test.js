import { describe, expect, it } from 'vitest';
import {
  getSuggestedPrompts,
  getToolLabel,
  getVoiceStatusText,
} from '../voiceStatusCopy';

describe('voiceStatusCopy', () => {
  it('labels park tool calls clearly', () => {
    expect(getToolLabel('get_park_details')).toMatch(/Checking park/i);
    expect(getToolLabel('compare_parks')).toBe('Comparing parks');
  });

  it('reports muted and listening states via activity deriver', () => {
    expect(
      getVoiceStatusText({
        status: 'connected',
        userMuted: true,
      })
    ).toBe('Microphone muted');
    expect(
      getVoiceStatusText({
        status: 'connected',
        userMuted: false,
      })
    ).toBe('Listening');
    expect(
      getVoiceStatusText({
        status: 'listening',
        userMuted: false,
      })
    ).toBe('Hearing you');
  });

  it('returns park-aware suggestions', () => {
    expect(getSuggestedPrompts({ parkCode: 'zion' })[0]).toMatch(/not miss/i);
    expect(getSuggestedPrompts({ pagePath: '/events' })[0]).toMatch(/Events/i);
  });
});
