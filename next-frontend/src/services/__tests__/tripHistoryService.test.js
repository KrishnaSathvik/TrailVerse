import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasActivePlanAiConversation,
  saveTempChatState,
  clearTempChatState,
  clearFormState,
} from '../tripHistoryService';

describe('hasActivePlanAiConversation', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTempChatState();
    clearFormState();
  });

  it('returns false when only welcome-only browse state exists', () => {
    expect(hasActivePlanAiConversation()).toBe(false);
  });

  it('returns true when temp chat has a real back-and-forth', () => {
    saveTempChatState({
      messages: [
        { role: 'assistant', content: 'Welcome' },
        { role: 'user', content: 'Plan Yellowstone' },
      ],
    });
    expect(hasActivePlanAiConversation()).toBe(true);
  });

  it('returns true when anonymous session has sent messages', () => {
    localStorage.setItem(
      'anonymousSession',
      JSON.stringify({ anonymousId: 'anon_1', messageCount: 2, canSendMore: true })
    );
    expect(hasActivePlanAiConversation()).toBe(true);
  });
});
