import { describe, it, expect } from 'vitest';
import {
  classifyTrailieTurnOutcome,
  resolveTrailieTurnDisplayContent,
  isUncertainConnectionLossError,
  canRetryTrailieTurn,
  excludeTransientFailuresFromHistory,
  resolveTrailieRetryPlan,
  RETRYABLE_FAILURE_MESSAGE,
  UNCERTAIN_CONNECTION_LOSS_MESSAGE,
  TRAILIE_TURN_OUTCOME,
} from '../trailieTurnOutcome';

function turn(overrides = {}) {
  return {
    content: 'Some response text.',
    trailieV2: { status: 'complete', terminalReason: null },
    ...overrides,
  };
}

describe('classifyTrailieTurnOutcome', () => {
  describe('conversation_outcome — ordinary responses, including semantic fail-closed refusals', () => {
    it('a genuine complete turn', () => {
      expect(classifyTrailieTurnOutcome(turn())).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('historical-plan reference: not found', () => {
      const data = turn({
        content: "I couldn't find a saved trip for that — nothing was changed.",
        trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_not_found' },
      });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('historical-plan reference: ambiguous', () => {
      const data = turn({
        content: "I found more than one saved trip that could match — tell me which one.",
        trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_ambiguous' },
      });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('historical-plan reference: hydration failed (still the same semantic fail-closed status)', () => {
      const data = turn({
        trailieV2: { status: 'plan_target_unresolved', terminalReason: 'plan_target_hydration_failed' },
      });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });
  });

  describe('retryable_failure — genuine generation failures must not masquerade as success', () => {
    it('status: failed (routing exhausted)', () => {
      const data = turn({
        trailieV2: { status: 'failed', terminalReason: 'routing_exhausted' },
      });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE);
    });

    it('status: failed (bounded unknown internal reason)', () => {
      const data = turn({
        trailieV2: { status: 'failed', terminalReason: 'unknown' },
      });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE);
    });

    it('status: failed with NO terminalReason at all is still a genuine failure', () => {
      const data = turn({ trailieV2: { status: 'failed' } });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE);
    });
  });

  describe('action_required — no meaningful retry', () => {
    it('guest quota exhaustion (isConversionMessage), even with no trailieV2 field', () => {
      const data = { content: 'You have used all your free messages.', isConversionMessage: true };
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.ACTION_REQUIRED);
    });
  });

  describe('unmapped/unknown status — conservative fallback, never raw error treatment', () => {
    it('an unrecognized status string falls back to conversation_outcome', () => {
      const data = turn({ trailieV2: { status: 'some_future_status_this_module_has_never_seen' } });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('"cancelled" (a turn the traveler stopped on purpose, not a broken one) falls back conservatively', () => {
      const data = turn({ trailieV2: { status: 'cancelled', terminalReason: 'cancelled' } });
      expect(classifyTrailieTurnOutcome(data)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('no trailieV2 field at all (legacy/system message shape)', () => {
      expect(classifyTrailieTurnOutcome({ content: 'hi', provider: 'system' }))
        .toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('trailieV2 present but status is null', () => {
      expect(classifyTrailieTurnOutcome(turn({ trailieV2: { status: null } })))
        .toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });

    it('trailieV2.status is not a string (defensive)', () => {
      expect(classifyTrailieTurnOutcome(turn({ trailieV2: { status: 42 } })))
        .toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });
  });

  describe('defensive input handling', () => {
    it('null/undefined/non-object data never throws', () => {
      expect(classifyTrailieTurnOutcome(null)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
      expect(classifyTrailieTurnOutcome(undefined)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
      expect(classifyTrailieTurnOutcome('not an object')).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
      expect(classifyTrailieTurnOutcome(42)).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    });
  });

  describe('resolveTrailieTurnDisplayContent — Phase 6A.1', () => {
    it('a genuine failure is replaced with the calm, generic message', () => {
      const out = resolveTrailieTurnDisplayContent({
        content: 'raw internal fallback text the model produced',
        outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE,
      });
      expect(out).toBe(RETRYABLE_FAILURE_MESSAGE);
      expect(out).toBe("I couldn't finish that one.");
    });

    it('an ordinary conversation outcome (including a semantic fail-closed refusal) is passed through unchanged', () => {
      const notFoundCopy = "I couldn't find a saved trip for that — nothing was changed.";
      expect(resolveTrailieTurnDisplayContent({
        content: notFoundCopy,
        outcomeClass: TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME,
      })).toBe(notFoundCopy);
    });

    it('action_required content is passed through unchanged', () => {
      const quotaCopy = 'You have used all your free messages.';
      expect(resolveTrailieTurnDisplayContent({
        content: quotaCopy,
        outcomeClass: TRAILIE_TURN_OUTCOME.ACTION_REQUIRED,
      })).toBe(quotaCopy);
    });

    it('the override text carries no status/terminalReason/provider/model wording', () => {
      expect(RETRYABLE_FAILURE_MESSAGE).not.toMatch(
        /status|terminalReason|reasonCode|routing_exhausted|failed|gpt|claude|openai|anthropic|provider|model/i
      );
    });
  });

  describe('the enum itself never leaks a raw wire string', () => {
    it('every exported enum value is a bounded product-level word, not a status/terminalReason', () => {
      const values = Object.values(TRAILIE_TURN_OUTCOME);
      expect(values).toEqual([
        'conversation_outcome', 'retryable_failure', 'action_required', 'uncertain_outcome',
      ]);
      expect(values).not.toContain('plan_target_unresolved');
      expect(values).not.toContain('failed');
      expect(values).not.toContain('routing_exhausted');
    });
  });

  describe('isUncertainConnectionLossError — Phase 6C', () => {
    it('no response at all (network failure / axios) is uncertain', () => {
      expect(isUncertainConnectionLossError(new Error('Network Error'))).toBe(true);
    });

    it('a client-side timeout (no response received) is uncertain', () => {
      const err = Object.assign(new Error('timeout of 120000ms exceeded'), { code: 'ECONNABORTED' });
      expect(isUncertainConnectionLossError(err)).toBe(true);
    });

    it('a fetch network failure (native TypeError, no .response) is uncertain', () => {
      expect(isUncertainConnectionLossError(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('an AbortError (the traveler sent a new message) is NOT uncertain — it is simply moot', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(isUncertainConnectionLossError(err)).toBe(false);
    });

    it('a real HTTP error response (server actually answered) is NOT uncertain', () => {
      const err = Object.assign(new Error('Server Error'), { response: { status: 500, data: {} } });
      expect(isUncertainConnectionLossError(err)).toBe(false);
      const err429 = Object.assign(new Error('Rate limited'), { response: { status: 429, data: {} } });
      expect(isUncertainConnectionLossError(err429)).toBe(false);
    });

    it('defensive: null/undefined/non-object never throws and is never uncertain', () => {
      expect(isUncertainConnectionLossError(null)).toBe(false);
      expect(isUncertainConnectionLossError(undefined)).toBe(false);
      expect(isUncertainConnectionLossError('not an error object')).toBe(false);
    });

    it('the copy is calm and honest — never claims success or failure, no raw codes', () => {
      expect(UNCERTAIN_CONNECTION_LOSS_MESSAGE).toMatch(/interrupted/i);
      expect(UNCERTAIN_CONNECTION_LOSS_MESSAGE).not.toMatch(
        /econnaborted|timeout|status|network error|failed|gpt|claude|openai/i
      );
    });
  });

  describe('canRetryTrailieTurn — Phase 6C / 6C.1, the one gate for the Try again action', () => {
    it('a guest server-resolved retryable_failure may retry', () => {
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE, isAnonymous: true,
      })).toBe(true);
    });

    it('Phase 6C.1 — an authenticated retryable_failure may ALSO retry now that the persistence seam withholds the turn from autoSaveConversation', () => {
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE, isAnonymous: false,
      })).toBe(true);
      // The gate no longer reads isAnonymous at all — omitting it entirely
      // must behave identically.
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE,
      })).toBe(true);
    });

    it('a semantic fail-closed conversation_outcome (historical not_found/ambiguous) may NOT retry', () => {
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME, isAnonymous: true,
      })).toBe(false);
    });

    it('action_required (guest quota exhaustion) may NOT retry', () => {
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.ACTION_REQUIRED, isAnonymous: true,
      })).toBe(false);
    });

    it('uncertain_outcome (client-only disconnect, guest or authenticated) may NOT retry', () => {
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.UNCERTAIN_OUTCOME, isAnonymous: true,
      })).toBe(false);
      expect(canRetryTrailieTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.UNCERTAIN_OUTCOME, isAnonymous: false,
      })).toBe(false);
    });

    it('an unrecognized/missing outcomeClass is safe-by-default: no retry', () => {
      expect(canRetryTrailieTurn({ outcomeClass: undefined, isAnonymous: true })).toBe(false);
      expect(canRetryTrailieTurn({})).toBe(false);
      expect(canRetryTrailieTurn()).toBe(false);
    });
  });

  describe('excludeTransientFailuresFromHistory — Phase 6C', () => {
    it('drops a RETRYABLE_FAILURE bubble, keeps everything else in order', () => {
      const messages = [
        { id: 1, role: 'user', content: 'Plan Yosemite' },
        { id: 2, role: 'assistant', content: "I couldn't finish that one.", outcomeClass: 'retryable_failure' },
        { id: 3, role: 'user', content: 'Plan Yosemite' },
        { id: 4, role: 'assistant', content: 'Here is your plan.', outcomeClass: 'conversation_outcome' },
      ];
      const result = excludeTransientFailuresFromHistory(messages);
      expect(result.map((m) => m.id)).toEqual([1, 3, 4]);
    });

    it('a conversation with no failures is unchanged', () => {
      const messages = [
        { id: 1, role: 'user', content: 'Hi' },
        { id: 2, role: 'assistant', content: 'Hello!' },
      ];
      expect(excludeTransientFailuresFromHistory(messages)).toEqual(messages);
    });

    it('defensive: non-array input never throws', () => {
      expect(excludeTransientFailuresFromHistory(null)).toEqual([]);
      expect(excludeTransientFailuresFromHistory(undefined)).toEqual([]);
    });
  });

  describe('resolveTrailieRetryPlan — Phase 6C, the pure decision behind a "Try again" click', () => {
    function conversation() {
      return [
        { id: 1, role: 'user', content: 'Is October good for Acadia?' },
        {
          id: 2, role: 'assistant', content: "I couldn't finish that one.",
          outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE,
        },
      ];
    }

    it('a guest retryable_failure resolves a valid plan: resend the ORIGINAL user text, remove the failed bubble', () => {
      const plan = resolveTrailieRetryPlan({
        messages: conversation(), failedMessageId: 2, isAnonymous: true,
      });
      expect(plan).toEqual({
        resendText: 'Is October good for Acadia?',
        removeMessageId: 2,
      });
    });

    it('Phase 6C.1 — an authenticated retryable_failure ALSO resolves a valid plan (persistence seam now closed for both audiences)', () => {
      const plan = resolveTrailieRetryPlan({
        messages: conversation(), failedMessageId: 2, isAnonymous: false,
      });
      expect(plan).toEqual({
        resendText: 'Is October good for Acadia?',
        removeMessageId: 2,
      });
    });

    it('a conversation_outcome message (e.g. historical not_found) resolves to null even if clicked', () => {
      const messages = [
        { id: 1, role: 'user', content: 'For my Bryce trip, change Day 2' },
        {
          id: 2, role: 'assistant', content: "I couldn't find a saved trip for that.",
          outcomeClass: TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME,
        },
      ];
      expect(resolveTrailieRetryPlan({ messages, failedMessageId: 2, isAnonymous: true })).toBeNull();
    });

    it('an uncertain_outcome message (client-only disconnect) resolves to null', () => {
      const messages = [
        { id: 1, role: 'user', content: 'Plan Zion' },
        {
          id: 2, role: 'assistant', content: UNCERTAIN_CONNECTION_LOSS_MESSAGE,
          outcomeClass: TRAILIE_TURN_OUTCOME.UNCERTAIN_OUTCOME,
        },
      ];
      expect(resolveTrailieRetryPlan({ messages, failedMessageId: 2, isAnonymous: true })).toBeNull();
    });

    it('an unknown message id resolves to null', () => {
      expect(resolveTrailieRetryPlan({
        messages: conversation(), failedMessageId: 999, isAnonymous: true,
      })).toBeNull();
    });

    it('a failed message with no preceding user message resolves to null (defensive)', () => {
      const messages = [
        {
          id: 1, role: 'assistant', content: "I couldn't finish that one.",
          outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE,
        },
      ];
      expect(resolveTrailieRetryPlan({ messages, failedMessageId: 1, isAnonymous: true })).toBeNull();
    });

    it('an earlier turn in a longer conversation still resolves against ITS OWN immediately-preceding user message', () => {
      const messages = [
        { id: 1, role: 'user', content: 'Earlier real question' },
        { id: 2, role: 'assistant', content: 'Earlier real answer.', outcomeClass: 'conversation_outcome' },
        { id: 3, role: 'user', content: 'Is October good for Acadia?' },
        {
          id: 4, role: 'assistant', content: "I couldn't finish that one.",
          outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE,
        },
      ];
      const plan = resolveTrailieRetryPlan({ messages, failedMessageId: 4, isAnonymous: true });
      expect(plan.resendText).toBe('Is October good for Acadia?');
      expect(plan.removeMessageId).toBe(4);
    });
  });
});
