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

  it('returns false when temp chat only has a welcome assistant message', () => {
    saveTempChatState({
      messages: [{ role: 'assistant', content: 'Welcome' }],
    });
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
      JSON.stringify({
        anonymousId: 'guest_v2_123e4567-e89b-42d3-a456-426614174000',
        messageCount: 2,
        canSendMore: true,
      })
    );
    expect(hasActivePlanAiConversation()).toBe(true);
  });

  it('does not treat collided legacy anonymous state as resumable', () => {
    localStorage.setItem(
      'anonymousSession',
      JSON.stringify({ anonymousId: 'anon_0123456789abcdef_012345', messageCount: 2 })
    );
    expect(hasActivePlanAiConversation()).toBe(false);
  });
});

it('replaces an old cache with an explicitly selected empty saved chat', () => {
  saveTempChatState({ messages: [{role:'user',content:'Old local message'}] });
  expect(saveTempChatState({ currentTripId:null, guestSessionId:'guest', guestConversationId:null, messages:[] })).toBe(true);
  expect(JSON.parse(localStorage.getItem('planai-chat-state'))).toEqual({currentTripId:null,guestSessionId:'guest',guestConversationId:null,messages:[]});
});
