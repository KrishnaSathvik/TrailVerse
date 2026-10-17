import { buildPlanAiEntryContext, shouldRestoreAnonymousPlanAiSession, shouldRestorePlanAiSession, withPersonalization } from '../planAiEntryContext';

describe('Plan AI canonical entry context', () => {
  test('normalizes a park CTA into a requested destination', () => {
    const context = buildPlanAiEntryContext({
      searchParams: new URLSearchParams('park=yell&name=Yellowstone%20National%20Park'),
      coordinates: { lat: 44.6, lon: -110.5 },
    });

    expect(context).toMatchObject({
      version: 1,
      source: 'park_cta',
      requestedDestinations: [{ parkCode: 'yell', name: 'Yellowstone National Park', lat: 44.6, lon: -110.5 }],
    });
  });

  test('normalizes compare targets without relying on system prompt prose', () => {
    const context = buildPlanAiEntryContext({
      searchParams: new URLSearchParams('suggest=Yellowstone%20National%20Park%20and%20Grand%20Teton%20National%20Park'),
    });

    expect(context.source).toBe('compare');
    expect(context.comparisonTargets.map((target) => target.name)).toEqual([
      'Yellowstone National Park',
      'Grand Teton National Park',
    ]);
  });

  test('carries bounded typed intent-guide semantics', () => {
    const context = buildPlanAiEntryContext({
      searchParams: new URLSearchParams('from=intent&intent=parks-for-couples'),
      intentContext: {
        path: '/parks-for-couples',
        title: 'Best National Parks for Couples',
        searchQuery: 'romantic scenic parks',
        quickAnswer: 'Quiet viewpoints and scenic stays.',
        featuredParkCodes: ['acad', 'olym'],
        standouts: [{ fullName: 'Acadia National Park', description: 'Ocean sunrise.' }],
        rankedParks: [{ parkCode: 'acad', fullName: 'Acadia National Park', matchReason: 'Coast' }],
      },
    });

    expect(context.source).toBe('intent_guide');
    expect(context.intentGuide).toMatchObject({
      path: '/parks-for-couples',
      searchQuery: 'romantic scenic parks',
      featuredParkCodes: ['acad', 'olym'],
    });
  });

  test('personalization is bounded to stable preferences, not full trip history', () => {
    const context = withPersonalization(
      buildPlanAiEntryContext({ searchParams: new URLSearchParams('personalized=1') }),
      {
        topInterests: ['hiking', 'wildlife'],
        preferredFitness: 'moderate',
        preferredBudget: 'moderate',
        favoriteParks: ['yell'],
        recentTrips: [{ entire: 'trip transcript must not cross the boundary' }],
      }
    );

    expect(context.source).toBe('personalized');
    expect(context.travelerPreferences).toEqual({
      interests: ['hiking', 'wildlife'],
      fitnessLevel: 'moderate',
      budgetPreference: 'moderate',
      favoriteParkCodes: ['yell'],
    });
    expect(JSON.stringify(context)).not.toContain('trip transcript');
  });

  test.each(['park_cta', 'compare', 'intent_guide', 'personalized'])('%s does not inherit an unrelated browser plan', (source) => {
    expect(shouldRestorePlanAiSession({ isAuthenticated: true, entryContext: { source } })).toBe(false);
  });

  test('bare direct entry may intentionally continue the active browser plan', () => {
    expect(shouldRestorePlanAiSession({ isAuthenticated: true, entryContext: { source: 'direct' } })).toBe(true);
  });

  test('guest park CTA starts clean while an explicit guest-resume entry restores', () => {
    expect(shouldRestoreAnonymousPlanAiSession({ entryContext: { source: 'park_cta' }, hasCompletedSession: true })).toBe(false);
    expect(shouldRestoreAnonymousPlanAiSession({ entryContext: { source: 'guest_resume' }, hasCompletedSession: true })).toBe(true);
  });
});
