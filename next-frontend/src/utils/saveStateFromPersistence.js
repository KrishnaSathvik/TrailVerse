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
 * Current-turn presentation only; never promotes a draft to canonical state.
 * A loaded/persisted canonical plan supplies hasPersistedPlan. A trip ID or
 * successful conversation save alone is insufficient. An uncertain connection
 * must remain uncertain until authoritative reload reconciles persistence.
 */
export function resolveChatStatus({ isAnonymous, saveState, hasPersistedPlan = false, draftPreview, previewOutcome, isPlanning = false } = {}) {
  if (isAnonymous) return null;

  // Draft events never establish canonical persistence, including after a
  // disconnect: the server may already have committed before transport failed.
  if (previewOutcome === 'rejected') return { label: 'No new itinerary saved', description: hasPersistedPlan ? 'Your previous saved trip is unchanged.' : 'The proposal was not saved.', tone: 'draft' };
  if (previewOutcome === 'uncertain' || draftPreview?.status === 'withdrawn') return { label: 'Check saved trip after reconnecting', description: 'Reload to confirm whether the completed plan was saved.', tone: 'draft' };
  if (draftPreview?.status === 'generating' && draftPreview.days.length) return { label: 'Draft · Not saved', description: 'The itinerary preview is not validated or saved.', tone: 'draft' };
  if (isPlanning || draftPreview?.status === 'generating') return { label: 'Planning your trip…', description: 'The new itinerary is not saved yet.', tone: 'draft' };

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

  if (hasPersistedPlan) {
    return { label: 'Saved', description: 'Your accepted itinerary is stored in your account.', tone: 'saved' };
  }

  return null;
}
