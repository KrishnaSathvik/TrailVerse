import { describe, it, expect } from 'vitest';
import {
  isPersistenceAccepted,
  isCanonicalRejection,
  ACCEPTING_OUTCOMES,
} from '../persistenceDecision';
import { resolveSaveState } from '../saveStateFromPersistence';

/**
 * Stage 14.7F4B §1/§14 — HTTP status alone can NEVER make a canonical rejection
 * look like an accepted write.
 *
 * The server returns 200 for bounded persistence decisions, so a client that
 * reads the status line would treat `conflict` and `stale` as saves and reveal
 * prose the server never stored. These lock the outcome-driven rule instead.
 */
describe('§1 — reveal is decided by the outcome, never the status', () => {
  const cases = [
    ['accept', true],
    ['idempotent', true],
    ['legacy_migration', true],
    ['stale', false],
    ['conflict', false],
    ['canonical_identity_required', false],
  ];

  it.each(cases)('HTTP 200 + %s → accepted=%s', (outcome, expected) => {
    expect(isPersistenceAccepted({
      httpStatus: 200,
      planPersistence: { outcome, success: expected },
    })).toBe(expected);
  });

  it('a 200 carrying conflict is rejected even when the server sets success:true', () => {
    // Defence in depth: the outcome disagreeing with the flag fails closed.
    expect(isPersistenceAccepted({
      httpStatus: 200,
      planPersistence: { outcome: 'conflict', success: true },
    })).toBe(false);
  });

  it('an unrecognised future outcome fails CLOSED', () => {
    expect(isPersistenceAccepted({
      httpStatus: 200,
      planPersistence: { outcome: 'some_new_outcome', success: true },
    })).toBe(false);
  });

  it('a 4xx validation failure is never an accepted write', () => {
    for (const httpStatus of [400, 403, 409, 422]) {
      expect(isPersistenceAccepted({
        httpStatus,
        planPersistence: { outcome: 'accept', success: true },
      })).toBe(false);
    }
  });

  it('a network failure is never an accepted write', () => {
    expect(isPersistenceAccepted({
      httpStatus: 200,
      planPersistence: { outcome: 'accept', success: true },
      networkError: new Error('offline'),
    })).toBe(false);
  });

  it('a legacy 200 with no decision block is still a save', () => {
    expect(isPersistenceAccepted({ httpStatus: 200, planPersistence: null })).toBe(true);
  });

  it('only accept/idempotent/legacy_migration are accepting', () => {
    expect([...ACCEPTING_OUTCOMES].sort()).toEqual(['accept', 'idempotent', 'legacy_migration']);
  });
});

describe('§14 — rejections never count as writes, and never auto-retry', () => {
  it.each(['stale', 'conflict'])('%s is a canonical rejection needing reconciliation', (outcome) => {
    const planPersistence = { outcome, success: false };
    expect(isCanonicalRejection(planPersistence)).toBe(true);
    expect(isPersistenceAccepted({ httpStatus: 200, planPersistence })).toBe(false);
    expect(resolveSaveState({ planPersistence })).toBe('sync-needed');
  });

  it.each(['accept', 'idempotent'])('%s is a save', (outcome) => {
    const planPersistence = { outcome, success: true };
    expect(isCanonicalRejection(planPersistence)).toBe(false);
    expect(resolveSaveState({ planPersistence })).toBe('saved');
  });

  it('acceptedWrites is only ever incremented for accepting outcomes', () => {
    // The counter contract the two-scenario run asserts, stated as a rule.
    let acceptedWrites = 0;
    for (const outcome of ['accept', 'conflict', 'stale', 'idempotent', 'conflict']) {
      if (isPersistenceAccepted({ httpStatus: 200, planPersistence: { outcome, success: true } })) {
        if (outcome === 'accept') acceptedWrites += 1;
      }
    }
    expect(acceptedWrites).toBe(1);
  });
});
