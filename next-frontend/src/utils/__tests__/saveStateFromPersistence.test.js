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

  test('saved canonical plan', () => {
    expect(resolveChatStatus({ isAnonymous: false, saveState: 'saved', hasPersistedPlan: true })).toEqual({
      label: 'Saved',
      description: 'Your accepted itinerary is stored in your account.',
      tone: 'saved',
    });
  });

  test('trip ID or saved conversation alone does not establish a saved itinerary', () => {
    expect(resolveChatStatus({ hasTripId: true, saveState: 'saved' })).toBeNull();
  });
  test('planning, draft and failure override a previously saved canonical plan', () => {
    const saved = { hasPersistedPlan: true, saveState: 'saved' };
    expect(resolveChatStatus({ ...saved, isPlanning: true }).label).toBe('Planning your trip…');
    for (const count of [1, 2, 5]) expect(resolveChatStatus({ ...saved, draftPreview: { status: 'generating', days: Array(count).fill({}) } }).label).toBe('Draft · Not saved');
    expect(resolveChatStatus({ ...saved, previewOutcome: 'rejected' }).label).toBe('No new itinerary saved');
    expect(resolveChatStatus({ ...saved, previewOutcome: 'uncertain' }).label).toBe('Check saved trip after reconnecting');
    expect(resolveChatStatus(saved).label).toBe('Saved');
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
