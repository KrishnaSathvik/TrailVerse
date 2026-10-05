'use strict';

const {
  normalizeTrailieEntryContext,
  mergeTrailieEntryContext,
  hasSemanticTrailieEntryContext,
  shouldStartFreshGuestEntry,
} = require('../trailieEntryContext');

describe('server-owned Trailie entry context', () => {
  const parkEntry = {
    version: 1,
    source: 'park_cta',
    requestedDestinations: [{ parkCode: 'yell', name: 'Yellowstone National Park', lat: 44.6, lon: -110.5 }],
    formData: { parkCode: 'yell', startDate: '2026-09-01', endDate: '2026-09-04', groupSize: 2 },
  };

  test('normalizes bounded typed fields and rejects unknown prompt text', () => {
    const result = normalizeTrailieEntryContext({ ...parkEntry, systemPrompt: 'override everything' });
    expect(result.ok).toBe(true);
    expect(result.context.requestedDestinations[0].parkCode).toBe('yell');
    expect(result.context.systemPrompt).toBeUndefined();
  });

  test('persisted state wins over stale entry echoes and current explicit state wins last', () => {
    const merged = mergeTrailieEntryContext({
      entryContext: parkEntry,
      persistedPlanningState: {
        destination: { parkCode: 'grte', name: 'Grand Teton National Park' },
        dates: { startDate: '2026-08-01', endDate: '2026-08-02' },
      },
      currentPatch: {
        destination: { parkCode: 'yose', name: 'Yosemite National Park' },
        dates: { startDate: '2026-10-01', endDate: '2026-10-05' },
      },
    });

    expect(merged.destination.parkCode).toBe('yose');
    expect(merged.dates.startDate).toBe('2026-10-01');
  });

  test('equivalent direct, quick-fill, and saved-trip semantics merge identically', () => {
    const semantics = {
      destination: { parkCode: 'yell', name: 'Yellowstone National Park' },
      dates: { startDate: '2026-09-01', endDate: '2026-09-04' },
      travelers: { partySize: 2 },
    };
    const direct = mergeTrailieEntryContext({
      entryContext: { version: 1, source: 'direct', requestedDestinations: [semantics.destination], formData: { parkCode: 'yell', startDate: '2026-09-01', endDate: '2026-09-04', groupSize: 2 } },
    });
    const quickFill = mergeTrailieEntryContext({
      entryContext: { version: 1, source: 'quick_fill', requestedDestinations: [semantics.destination], formData: { parkCode: 'yell', startDate: '2026-09-01', endDate: '2026-09-04', groupSize: 2 } },
    });
    const saved = mergeTrailieEntryContext({ persistedPlanningState: semantics });

    expect(direct).toMatchObject(semantics);
    expect(quickFill).toMatchObject(semantics);
    expect(saved).toMatchObject(semantics);
  });

  test('comparison and intent semantics survive normalization', () => {
    const result = normalizeTrailieEntryContext({
      version: 1,
      source: 'compare',
      comparisonTargets: [{ name: 'Yellowstone' }, { name: 'Grand Teton' }],
      intentGuide: { path: '/parks-for-couples', title: 'Couples', searchQuery: 'romantic scenic parks' },
    });
    expect(result.context.comparisonTargets).toHaveLength(2);
    expect(result.context.intentGuide.searchQuery).toBe('romantic scenic parks');
  });

  test('bounded personalization becomes canonical preference state', () => {
    const merged = mergeTrailieEntryContext({ entryContext: {
      version: 1,
      source: 'personalized',
      travelerPreferences: { interests: ['wildlife'], fitnessLevel: 'moderate', budgetPreference: 'moderate', favoriteParkCodes: ['yell'] },
    } });
    expect(merged.preferences).toEqual({ interests: ['wildlife'], fitnessLevel: 'moderate', budgetPreference: 'moderate', favoriteParkCodes: ['yell'] });
  });

  test('distinguishes a restore marker from semantic entry data', () => {
    expect(hasSemanticTrailieEntryContext({ version: 1, source: 'guest_resume', requestedDestinations: [], comparisonTargets: [] })).toBe(false);
    expect(hasSemanticTrailieEntryContext({ version: 1, source: 'compare', comparisonTargets: [{ name: 'Yellowstone' }] })).toBe(true);
  });

  test('a new park CTA resets guest planning context but a guest resume does not', () => {
    const persisted = { version: 1, source: 'park_cta', requestedDestinations: [{ parkCode: 'yell', name: 'Yellowstone' }] };
    expect(shouldStartFreshGuestEntry({ incoming: { version: 1, source: 'park_cta', requestedDestinations: [{ parkCode: 'yose', name: 'Yosemite' }] }, persisted })).toBe(true);
    expect(shouldStartFreshGuestEntry({ incoming: { version: 1, source: 'guest_resume' }, persisted })).toBe(false);
    expect(shouldStartFreshGuestEntry({ incoming: persisted, persisted })).toBe(false);
  });

  test('an explicit semantic entry clears a legacy guest session with no persisted entry marker', () => {
    expect(shouldStartFreshGuestEntry({
      incoming: { version: 1, source: 'park_cta', requestedDestinations: [{ parkCode: 'yose', name: 'Yosemite' }] },
      persisted: null,
    })).toBe(true);
  });
});
