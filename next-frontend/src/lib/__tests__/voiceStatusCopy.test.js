import { describe, expect, it } from 'vitest';
import {
  getSuggestedPrompts,
  getToolLabel,
  getVoiceStatusText,
} from '../voiceStatusCopy';

describe('voiceStatusCopy', () => {
  it('labels park tool calls clearly', () => {
    expect(getToolLabel('get_park_details')).toMatch(/Checking park/i);
  });

  it('reports muted and listening states', () => {
    expect(
      getVoiceStatusText({
        status: 'connected',
        userMuted: true,
      })
    ).toBe('Muted');
    expect(
      getVoiceStatusText({
        status: 'connected',
        userMuted: false,
      })
    ).toBe('Listening');
  });

  it('returns park-aware suggestions', () => {
    expect(getSuggestedPrompts({ parkCode: 'zion' })[0]).toMatch(/not miss/i);
    expect(getSuggestedPrompts({ pagePath: '/events' })[0]).toMatch(/Events/i);
  });
});
