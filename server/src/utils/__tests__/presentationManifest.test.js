'use strict';

const {
  PRESENTATION_KINDS,
  SOURCE_REGISTRY,
  buildPresentationManifest,
  resolvePresentationSource,
  validatePresentationManifest,
} = require('../presentationManifest');

const PLAN = {
  parkName: 'Yellowstone National Park',
  days: [{ dayNumber: 1, stops: [{ name: 'Old Faithful' }] }],
};

function logistics(overrides = {}) {
  return {
    schemaVersion: 1,
    inventoryMode: 'planning',
    transport: {
      airportsStatus: 'available',
      airports: [{ airportCode: 'BZN', name: 'Bozeman Yellowstone International' }],
      routeLegsStatus: 'available',
      routeLegs: [{ legId: 'leg-1', originLabel: 'BZN', destinationLabel: 'Yellowstone' }],
    },
    stays: {
      insidePark: { status: 'verified', properties: [{ propertyId: 'old-faithful', name: 'Old Faithful Inn' }] },
      gateway: { status: 'not_requested', properties: [] },
      campgrounds: { status: 'not_requested', properties: [] },
      vacationRentalHint: null,
    },
    ...overrides,
  };
}

describe('Trailie presentation manifest v1 schema', () => {
  test('exports the closed presentation vocabulary and source registry', () => {
    expect(PRESENTATION_KINDS).toEqual([
      'plain_answer',
      'comparison',
      'itinerary',
      'route_plan',
      'flight_planning',
      'stay_options',
      'campground_options',
      'requirements',
      'access_plan',
      'current_status',
      'cost_summary',
      'recommendation_list',
    ]);
    expect(SOURCE_REGISTRY.canonicalPlan).toEqual(expect.objectContaining({ kinds: ['itinerary'] }));
    expect(SOURCE_REGISTRY['travelLogistics.transport.airports']).toEqual(
      expect.objectContaining({ kinds: expect.arrayContaining(['flight_planning']) })
    );
    expect(SOURCE_REGISTRY['arbitrary.private.path']).toBeUndefined();
  });

  test('rejects kind mismatch, duplicate supports, and arbitrary sources', () => {
    const result = validatePresentationManifest({
      schemaVersion: 1,
      presentationKind: 'itinerary',
      refinement: { isRefinement: false, changes: [] },
      primaryArtifact: { kind: 'comparison', source: 'arbitrary.private.path' },
      supportingModules: [
        { kind: 'stay_options', source: 'travelLogistics.stays' },
        { kind: 'stay_options', source: 'travelLogistics.stays' },
      ],
      prosePolicy: 'supplemental_only',
      ending: { caveat: null, beforeYouGo: null, followups: [] },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'presentation_primary_kind_mismatch',
      'presentation_source_invalid',
      'presentation_support_duplicate',
    ]));
  });

  test('rejects malformed refinement codes and ending fields', () => {
    const result = validatePresentationManifest({
      schemaVersion: 1,
      presentationKind: 'plain_answer',
      refinement: { isRefinement: true, changes: ['Not normalized!'] },
      primaryArtifact: { kind: 'plain_answer', source: 'content' },
      supportingModules: [],
      prosePolicy: 'full',
      ending: { caveat: 42, beforeYouGo: null, followups: ['ok', { prompt: 'not v1' }] },
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      'presentation_refinement_invalid',
      'presentation_ending_invalid',
    ]));
  });

  test('rejects malformed changed-day presentation metadata', () => {
    const result = validatePresentationManifest({
      schemaVersion: 1,
      presentationKind: 'itinerary',
      refinement: { isRefinement: true, changes: ['slower_pace'], changedDayNumbers: [2, '3'] },
      primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
      supportingModules: [],
      prosePolicy: 'full',
      ending: { caveat: null, beforeYouGo: null, followups: [] },
    }, { canonicalPlan: PLAN });

    expect(result.errors).toContain('presentation_refinement_changed_days_invalid');
  });

  test('resolves only allowlisted canonical selectors', () => {
    const envelope = { content: 'Answer', canonicalPlan: PLAN, travelLogistics: logistics() };
    expect(resolvePresentationSource(envelope, 'canonicalPlan')).toBe(PLAN);
    expect(resolvePresentationSource(envelope, 'travelLogistics.transport.airports')).toEqual(
      envelope.travelLogistics.transport.airports
    );
    expect(resolvePresentationSource(envelope, '__proto__.polluted')).toBeUndefined();
  });
});

describe('deterministic presentationManifestBuilder', () => {
  test('builds a plain answer when no real structured artifact exists', () => {
    const envelope = {
      content: 'September is generally a strong time to visit Yosemite.',
      intent: { primaryIntent: 'general_qa', verticals: ['parks'] },
    };
    const manifest = buildPresentationManifest(envelope);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      presentationKind: 'plain_answer',
      primaryArtifact: { kind: 'plain_answer', source: 'content' },
      supportingModules: [],
      prosePolicy: 'full',
    });
    expect(validatePresentationManifest(manifest, envelope)).toEqual({ valid: true, errors: [] });
  });

  test('trip skeleton with a canonical plan stays a plain answer, not a day-by-day itinerary', () => {
    const envelope = {
      content: 'Here is the 10-day Alaska shape without day-by-day.',
      canonicalPlan: PLAN,
      intent: { primaryIntent: 'general_qa', travelerJob: 'trip_skeleton', verticals: ['parks'] },
    };
    const manifest = buildPresentationManifest(envelope);
    expect(manifest.presentationKind).toBe('plain_answer');
    expect(manifest.primaryArtifact).toEqual({ kind: 'plain_answer', source: 'content' });
    expect(manifest.prosePolicy).toBe('full');
  });

  test('makes itinerary primary without automatic logistics modules', () => {
    const envelope = {
      content: 'Here is your five-day Yellowstone plan.',
      canonicalPlan: PLAN,
      travelLogistics: logistics(),
      intent: { primaryIntent: 'full_trip', verticals: ['itinerary', 'flights', 'lodging'] },
      requestedSlices: { airports: true, insideParkLodging: true, routeLegs: false },
    };

    const manifest = buildPresentationManifest(envelope);

    expect(manifest.presentationKind).toBe('itinerary');
    expect(manifest.primaryArtifact).toEqual({ kind: 'itinerary', source: 'canonicalPlan' });
    expect(manifest.supportingModules).toEqual([]);
    expect(manifest.prosePolicy).toBe('full');
  });

  test('does not show available logistics that were not requested', () => {
    const envelope = {
      content: 'Here is your two-day Zion plan.',
      canonicalPlan: PLAN,
      travelLogistics: logistics(),
      intent: { primaryIntent: 'simple_itinerary', verticals: ['itinerary'] },
      requestedSlices: {},
    };

    expect(buildPresentationManifest(envelope).supportingModules).toEqual([]);
  });

  test('uses comparison compatibility from content without copying the table into the manifest', () => {
    const envelope = {
      content: '| Criterion | Yosemite | Sequoia |\n| --- | --- | --- |\n| Easy hikes | Good | Best |',
      intent: { primaryIntent: 'compare', verticals: ['parks'] },
      contentMetadata: { hasComparisonTable: true },
    };
    const manifest = buildPresentationManifest(envelope);

    expect(manifest).toMatchObject({
      presentationKind: 'comparison',
      primaryArtifact: { kind: 'comparison', source: 'content' },
      prosePolicy: 'full',
    });
    expect(manifest.primaryArtifact.data).toBeUndefined();
  });

  test('keeps refinement as a modifier on the revised itinerary', () => {
    const manifest = buildPresentationManifest({
      content: 'Updated.',
      canonicalPlan: PLAN,
      intent: { primaryIntent: 'trip_refinement', verticals: ['itinerary'] },
      refinement: { changes: ['slower_pace', 'sunset_added'] },
    });

    expect(manifest.presentationKind).toBe('itinerary');
    expect(manifest.refinement).toEqual({
      isRefinement: true,
      changes: ['slower_pace', 'sunset_added'],
      changedDayNumbers: [],
    });
    expect(manifest.ending.beforeYouGo).toBeNull();
    expect(manifest.ending.followups).toEqual([]);
  });

  test('projects exact touched days into refinement presentation in canonical order', () => {
    const manifest = buildPresentationManifest({
      content: 'Moved the hike.',
      canonicalPlan: {
        parkName: 'Redwood National Park',
        days: [1, 2, 3].map((dayNumber) => ({ dayNumber, stops: [{ name: `Stop ${dayNumber}` }] })),
      },
      intent: { primaryIntent: 'trip_refinement', verticals: ['itinerary'] },
      refinement: { changes: ['schedule'], changedDayNumbers: [3, 2, 3] },
    });

    expect(manifest.refinement).toEqual({
      isRefinement: true,
      changes: ['schedule'],
      changedDayNumbers: [2, 3],
    });
  });

  test('ordinary new itineraries carry no changed-day subset', () => {
    const manifest = buildPresentationManifest({
      content: 'Here is your trip.',
      canonicalPlan: PLAN,
      intent: { primaryIntent: 'full_trip', verticals: ['itinerary'] },
    });

    expect(manifest.refinement).toEqual({
      isRefinement: false,
      changes: [],
      changedDayNumbers: [],
    });
  });

  test('does not invent automatic endings when logistics data exists', () => {
    const manifest = buildPresentationManifest({
      content: 'BZN is the strongest airport strategy.',
      travelLogistics: logistics(),
      intent: { primaryIntent: 'flight_strategy', verticals: ['flights'] },
      requestedSlices: { airports: true },
    });

    expect(manifest.ending.beforeYouGo).toBeNull();
    expect(manifest.ending.followups).toEqual([]);
    expect(JSON.stringify(manifest)).not.toContain('Bozeman Yellowstone International');
  });

  test('is byte-deterministic and caps supporting modules at three', () => {
    const envelope = {
      content: 'Plan.',
      canonicalPlan: PLAN,
      travelLogistics: logistics({
        stays: {
          insidePark: { status: 'verified', properties: [{ propertyId: 'lodge', name: 'Lodge' }] },
          gateway: { status: 'available', properties: [{ propertyId: 'hotel', name: 'Hotel' }] },
          campgrounds: { status: 'available', properties: [{ propertyId: 'camp', name: 'Camp' }] },
          vacationRentalHint: null,
        },
      }),
      responseArtifacts: { requirements: { items: [{ requirement: 'Entrance fee' }] } },
      intent: { primaryIntent: 'full_trip', verticals: ['itinerary', 'flights', 'lodging', 'camping', 'permits'] },
      requestedSlices: {
        airports: true,
        routeLegs: true,
        insideParkLodging: true,
        campgrounds: true,
        requirements: true,
      },
    };

    const first = buildPresentationManifest(envelope);
    const second = buildPresentationManifest(structuredClone(envelope));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.supportingModules).toEqual([]);
    expect(first.prosePolicy).toBe('full');
  });
});
