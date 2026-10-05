import { resolveSaveState, shouldAutoRetrySave, resolveChatStatus } from '../saveStateFromPersistence';

describe('resolveSaveState', () => {
  test('ACCEPT → saved', () => {
    expect(resolveSaveState({ planPersistence: { outcome: 'accept', success: true } })).toBe('saved');
  });
  test('IDEMPOTENT → saved', () => {
    expect(resolveSaveState({ planPersistence: { outcome: 'idempotent', success: true } })).toBe('saved');
  });
  test('no planPersistence (legacy 200) → saved', () => {
    expect(resolveSaveState({ planPersistence: undefined })).toBe('saved');
  });
  test('STALE → sync-needed', () => {
    expect(resolveSaveState({ planPersistence: { outcome: 'stale', success: false } })).toBe('sync-needed');
  });
  test('CONFLICT → sync-needed', () => {
    expect(resolveSaveState({ planPersistence: { outcome: 'conflict', success: false } })).toBe('sync-needed');
  });
  test('network failure → idle, never saved', () => {
    expect(resolveSaveState({ networkError: true })).toBe('idle');
  });
  test('canonical_identity_required → sync-needed, never saved', () => {
    expect(
      resolveSaveState({ planPersistence: { outcome: 'canonical_identity_required', success: false } })
    ).toBe('sync-needed');
  });
});

describe('shouldAutoRetrySave', () => {
  test('stale/conflict must NOT auto-retry', () => {
    expect(shouldAutoRetrySave({ outcome: 'stale', success: false })).toBe(false);
    expect(shouldAutoRetrySave({ outcome: 'conflict', success: false })).toBe(false);
  });
  test('successful saves have nothing to retry', () => {
    expect(shouldAutoRetrySave({ outcome: 'accept', success: true })).toBe(false);
  });
});

describe('resolveChatStatus — Phase 6A', () => {
  test('anonymous travelers never see a save-status pill', () => {
    expect(resolveChatStatus({ isAnonymous: true, saveState: 'saved', hasTripId: true })).toBeNull();
    expect(resolveChatStatus({ isAnonymous: true, saveState: 'sync-needed', hasTripId: true })).toBeNull();
  });

  test('saving', () => {
    expect(resolveChatStatus({ isAnonymous: false, saveState: 'saving', hasTripId: true })).toEqual({
      label: 'Saving...',
      description: 'Updating your trip history.',
      tone: 'saving',
    });
  });

  test('sync-needed renders calm, traveler-facing copy — never "Saved"', () => {
    const status = resolveChatStatus({ isAnonymous: false, saveState: 'sync-needed', hasTripId: true });
    expect(status).toEqual({
      label: 'Not saved',
      description: "That change didn't save to your trip.",
      tone: 'sync-needed',
    });
    expect(status.label).not.toBe('Saved');
  });

  test('sync-needed wins over hasTripId — a stale write is never disguised as "Saved"', () => {
    // Without the fix this would fall through to the 'Saved' branch, since
    // hasTripId is true — exactly the bug this row exists to pin.
    const status = resolveChatStatus({ isAnonymous: false, saveState: 'sync-needed', hasTripId: true });
    expect(status.tone).toBe('sync-needed');
  });

  test('saved (via saveState)', () => {
    expect(resolveChatStatus({ isAnonymous: false, saveState: 'saved', hasTripId: false })).toEqual({
      label: 'Saved',
      description: 'This conversation is stored in your account.',
      tone: 'saved',
    });
  });

  test('saved (via an existing trip id, saveState idle)', () => {
    expect(resolveChatStatus({ isAnonymous: false, saveState: 'idle', hasTripId: true })).toEqual({
      label: 'Saved',
      description: 'This conversation is stored in your account.',
      tone: 'saved',
    });
  });

  test('nothing to show yet — no trip, no save activity', () => {
    expect(resolveChatStatus({ isAnonymous: false, saveState: 'idle', hasTripId: false })).toBeNull();
  });

  test('rendered copy never contains raw status/reason/provider terminology', () => {
    for (const saveState of ['saving', 'sync-needed', 'saved', 'idle']) {
      const status = resolveChatStatus({ isAnonymous: false, saveState, hasTripId: true });
      const text = status ? `${status.label} ${status.description}` : '';
      expect(text).not.toMatch(/stale|conflict|outcome|reason|terminalReason|gpt|claude|openai/i);
    }
  });
});
