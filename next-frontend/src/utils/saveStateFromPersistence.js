/**
 * Stage 8.2 — save-state contract. Maps a server persistence result to the UI
 * save state, and decides retry policy. A stale/conflicting canonical write is
 * NOT a successful save and must NOT be auto-retried (that would just resubmit
 * the same stale response); the user reconciles instead.
 *
 *   ACCEPT / IDEMPOTENT / legacy-200 → 'saved'
 *   STALE / CONFLICT                 → 'sync-needed'
 *   network failure                  → 'idle' (never 'saved')
 */
export function resolveSaveState({ planPersistence, networkError } = {}) {
  if (networkError) return 'idle';
  if (planPersistence && planPersistence.success === false) return 'sync-needed';
  return 'saved';
}

export function shouldAutoRetrySave(planPersistence) {
  // Stale/conflict are resolved by reconciliation, never blind retry.
  return false;
}

/**
 * Phase 6A — the traveler-facing chat-header save status, extracted so it is
 * directly testable (TripPlannerChat.jsx is too large/stateful to mount in
 * isolation — see its own smoke-test comment). Pure, no React.
 *
 * `sync-needed` (a stale/conflicting write) is checked BEFORE the
 * `hasTripId`/`'saved'` fallback, which would otherwise still read as
 * "Saved" even though this particular change was rejected — a stale write
 * must never look identical to a successful one. No retry action is
 * attached here; that is explicitly deferred (Phase 6B/6C).
 *
 * @returns {{label: string, description: string, tone: 'saving'|'sync-needed'|'saved'}|null}
 */
export function resolveChatStatus({ isAnonymous, saveState, hasTripId } = {}) {
  if (isAnonymous) return null;

  if (saveState === 'saving') {
    return { label: 'Saving...', description: 'Updating your trip history.', tone: 'saving' };
  }

  if (saveState === 'sync-needed') {
    return {
      label: 'Not saved',
      description: "That change didn't save to your trip.",
      tone: 'sync-needed',
    };
  }

  if (hasTripId || saveState === 'saved') {
    return { label: 'Saved', description: 'This conversation is stored in your account.', tone: 'saved' };
  }

  return null;
}
