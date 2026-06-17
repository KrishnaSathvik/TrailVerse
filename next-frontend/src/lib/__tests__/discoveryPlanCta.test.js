import { describe, expect, it } from 'vitest';
import { findDiscoveryPlanCtaMessage, messageMatchesDiscoveryPlanCta } from '../discoveryPlanCta';

describe('findDiscoveryPlanCtaMessage', () => {
  it('returns assistant with server flag when no user reply after', () => {
    const messages = [
      { id: 1, role: 'user', content: 'Weekend hiking trip from Denver under $500' },
      {
        id: 2,
        role: 'assistant',
        content: 'Here are a few parks within driving distance...',
        showDayByDayPlanCta: true,
      },
    ];
    expect(findDiscoveryPlanCtaMessage(messages)?.id).toBe(2);
  });

  it('does not infer CTA when server flag is missing', () => {
    const answer = `${'Rocky Mountain National Park works well for a weekend hike. '.repeat(4)}Trail Ridge Road and Bear Lake are popular.`;
    const messages = [
      { id: 1, role: 'user', content: 'Weekend hiking trip from Denver under $500' },
      { id: 2, role: 'assistant', content: answer },
    ];
    expect(findDiscoveryPlanCtaMessage(messages)).toBeNull();
  });

  it('skips when user already replied after assistant', () => {
    const messages = [
      { id: 1, role: 'user', content: 'Weekend hiking from Denver' },
      { id: 2, role: 'assistant', content: 'x'.repeat(150), showDayByDayPlanCta: true },
      { id: 3, role: 'user', content: 'Tell me more about RMNP' },
    ];
    expect(findDiscoveryPlanCtaMessage(messages)).toBeNull();
  });
});

describe('messageMatchesDiscoveryPlanCta', () => {
  it('matches by id', () => {
    const a = { id: 5 };
    const b = { id: 5 };
    expect(messageMatchesDiscoveryPlanCta(a, b)).toBe(true);
  });
});
