'use strict';

/**
 * LEGAL-STOP SUBSTITUTION REPAIR — contained one-for-one replacement of an
 * experiential stop that failed `stop_identity_excluded` or exposure-related
 * `constraint_eligibility_unknown`, with the replacement identity drawn from
 * the SAME frozen catalogue and the SAME exposure-eligibility authority used
 * by construction and retry steering (Olympic 2026-09-03 decision).
 */

const {
  SUBSTITUTION_REPAIR_REASON_CODES: REASON,
  resolveSubstitutionScope,
  buildLegalSubstitutionCatalog,
  applyLegalStopSubstitution,
  LEGAL_STOP_SUBSTITUTION_TOOL,
} = require('../legalStopSubstitutionRepair');

const row = (id, name, { activityTypes = [], category = 'place', exposureLevel = null } = {}) => ({
  evidenceId: id,
  entityId: `nps:park:olym:${id}`,
  topic: 'activities',
  claim: {
    identity: `place:${name}`,
    text: `${name}.`,
    normalizedValue: {
      name, category, activityTypes, exposureLevel, operationalFacts: [],
    },
  },
});

const CIRQUE = row('ev:cirque', 'Cirque Rim Overlook', { activityTypes: ['viewpoint'], exposureLevel: 'low' });
const SOL_DUC_TRAIL = row('ev:solduc-trail', 'Sol Duc Falls Trail', { activityTypes: ['hike'], exposureLevel: 'low' });
const MAPLE = row('ev:maple', 'Maple Glade Rain Forest Trailhead', { activityTypes: ['hike'], exposureLevel: 'low' });
const OBSTRUCTION = row('ev:obstruction', 'Obstruction Point Trailhead', { activityTypes: ['hike'] });
const SOL_DUC_PLACE = row('ev:solduc-place', 'Sol Duc Falls', { activityTypes: ['viewpoint'] });
const BIG_SPRUCE = row('ev:bigspruce', 'Quinault Big Sitka Spruce Tree Trail', { activityTypes: ['hike'] });
const LODGE = row('ev:lodge', 'Lake Crescent Lodge', { category: 'lodging' });
const SPRUCE = row('ev:spruce', 'Spruce Nature Trail', { activityTypes: ['hike'], exposureLevel: 'low' });

const bundle = { evidence: [OBSTRUCTION, SOL_DUC_PLACE, BIG_SPRUCE, CIRQUE, SOL_DUC_TRAIL, MAPLE, LODGE, SPRUCE] };

const exposureDirective = {
  armed: true,
  confirmedLowEvidenceIds: ['ev:cirque', 'ev:solduc-trail', 'ev:maple', 'ev:spruce'],
  suggestionIneligibleEvidenceIds: ['ev:obstruction', 'ev:solduc-place', 'ev:bigspruce'],
  ineligibleEvidenceIds: ['ev:obstruction', 'ev:bigspruce'],
};

const stop = (name, type, duration, extra = {}) => ({
  name, type, duration, note: `${name} note`, why: `${name} why`, ...extra,
});

const plan = () => ({
  intro: 'Three gentle days.',
  days: [
    { dayNumber: 1, stops: [stop('See Madison Falls', 'trail', 60), stop('Glines Canyon Dam Overlook', 'viewpoint', 60)] },
    { dayNumber: 2, stops: [stop('Spruce Nature Trail', 'trail', 75), stop('Hurricane Hill Picnic Area A', 'picnic', 45)] },
    { dayNumber: 3, stops: [stop('Rialto Beach', 'landmark', 90), stop('Quinault Big Sitka Spruce Tree Trail', 'trail', 60, { timeWindow: 'afternoon' })] },
  ],
});

describe('scope resolution from validator diagnostics', () => {
  test('resolves an offending stop by day and name to an exact target', () => {
    const scope = resolveSubstitutionScope({
      itineraryData: plan(),
      offendingStops: [{ dayNumber: 3, stopName: 'Quinault Big Sitka Spruce Tree Trail' }],
    });
    expect(scope.ok).toBe(true);
    expect(scope.targets).toEqual([{ dayRef: 3, stopRef: 2, name: 'Quinault Big Sitka Spruce Tree Trail' }]);
    expect(scope.maxOperations).toBe(1);
  });

  test('a name-only diagnostic (exposure conflicts carry no day) resolves when unique', () => {
    const scope = resolveSubstitutionScope({
      itineraryData: plan(),
      offendingStops: [{ dayNumber: null, stopName: 'Spruce Nature Trail' }],
    });
    expect(scope.ok).toBe(true);
    expect(scope.targets).toEqual([{ dayRef: 2, stopRef: 1, name: 'Spruce Nature Trail' }]);
  });

  test('refuses an unknown stop and an ambiguous cross-day name rather than guessing', () => {
    expect(resolveSubstitutionScope({
      itineraryData: plan(),
      offendingStops: [{ dayNumber: null, stopName: 'Nowhere Trail' }],
    })).toMatchObject({ ok: false, reasonCodes: [REASON.UNKNOWN_STOP_REF] });

    const dup = plan();
    dup.days[0].stops.push(stop('Spruce Nature Trail', 'trail', 30));
    expect(resolveSubstitutionScope({
      itineraryData: dup,
      offendingStops: [{ dayNumber: null, stopName: 'Spruce Nature Trail' }],
    })).toMatchObject({ ok: false, reasonCodes: [REASON.AMBIGUOUS_DIAGNOSTICS] });
  });
});

describe('replacement catalogue derives from the shared exposure authority', () => {
  test('no directive-excluded or suggestion-ineligible identity can enter; confirmed-low leads', () => {
    const catalog = buildLegalSubstitutionCatalog({
      bundle,
      candidatePlan: { days: [] },
      exposureDirective,
      excludedEvidenceIds: exposureDirective.ineligibleEvidenceIds,
    });
    expect(catalog.ok).toBe(true);
    const names = catalog.candidates.map((c) => c.canonicalName);
    for (const illegal of ['Obstruction Point Trailhead', 'Sol Duc Falls', 'Quinault Big Sitka Spruce Tree Trail']) {
      expect(names).not.toContain(illegal);
    }
    // Replacements discharge an experiential obligation: the rest-class lodge
    // is not offered even though it is exposure-neutral.
    expect(names).not.toContain('Lake Crescent Lodge');
    expect(names.slice(0, 4).sort()).toEqual(
      ['Cirque Rim Overlook', 'Maple Glade Rain Forest Trailhead', 'Sol Duc Falls Trail', 'Spruce Nature Trail'].sort(),
    );
    for (const c of catalog.candidates) expect(c.confirmedLow).toBe(true);
  });

  test('an empty legal pool declines rather than inventing', () => {
    const catalog = buildLegalSubstitutionCatalog({
      bundle: { evidence: [OBSTRUCTION, SOL_DUC_PLACE, LODGE] },
      candidatePlan: { days: [] },
      exposureDirective: {
        ...exposureDirective,
        confirmedLowEvidenceIds: [],
      },
      excludedEvidenceIds: [],
    });
    expect(catalog.ok).toBe(false);
    expect(catalog.reasonCodes).toContain(REASON.EVIDENCE_CATALOG_UNAVAILABLE);
  });
});

describe('contained one-for-one merge', () => {
  const scopeFor = (p) => resolveSubstitutionScope({
    itineraryData: p,
    offendingStops: [{ dayNumber: 3, stopName: 'Quinault Big Sitka Spruce Tree Trail' }],
  });
  const catalogFor = (p) => buildLegalSubstitutionCatalog({
    bundle,
    candidatePlan: p,
    exposureDirective,
    excludedEvidenceIds: exposureDirective.ineligibleEvidenceIds,
  });
  const refFor = (catalog, name) => catalog.candidates.find((c) => c.canonicalName === name).ref;

  test('replaces exactly the offending stop with a server-owned catalogue identity', () => {
    const p = plan();
    const scope = scopeFor(p);
    const catalog = catalogFor(p);
    const merged = applyLegalStopSubstitution({
      itineraryData: p,
      scope,
      substitutions: [{
        dayRef: 3,
        stopRef: 2,
        replacement: { placeRef: refFor(catalog, 'Maple Glade Rain Forest Trailhead'), note: 'Idyllic rain-forest loop.', why: 'Gentle confirmed-low walk near Quinault.' },
      }],
      candidates: catalog.candidates,
    });
    expect(merged.ok).toBe(true);
    const day3 = merged.plan.days[2];
    expect(day3.stops[1].name).toBe('Maple Glade Rain Forest Trailhead');
    expect(day3.stops[1].type).toBeTruthy();
    // Slot preserved: duration and time window come from the replaced stop.
    expect(day3.stops[1].duration).toBe(60);
    expect(day3.stops[1].timeWindow).toBe('afternoon');
    // Everything untargeted is byte-identical.
    expect(merged.plan.days[0]).toEqual(plan().days[0]);
    expect(merged.plan.days[1]).toEqual(plan().days[1]);
    expect(day3.stops[0]).toEqual(plan().days[2].stops[0]);
  });

  test('a replacement may not author a name or type, and an unknown placeRef is refused', () => {
    const p = plan();
    const scope = scopeFor(p);
    const catalog = catalogFor(p);
    expect(applyLegalStopSubstitution({
      itineraryData: p,
      scope,
      substitutions: [{ dayRef: 3, stopRef: 2, replacement: { placeRef: refFor(catalog, 'Cirque Rim Overlook'), name: 'My Own Trail', note: 'n', why: 'w' } }],
      candidates: catalog.candidates,
    })).toMatchObject({ ok: false, reasonCodes: [REASON.UNKNOWN_PLACE_REF] });
    expect(applyLegalStopSubstitution({
      itineraryData: p,
      scope,
      substitutions: [{ dayRef: 3, stopRef: 2, replacement: { placeRef: 999, note: 'n', why: 'w' } }],
      candidates: catalog.candidates,
    })).toMatchObject({ ok: false, reasonCodes: [REASON.UNKNOWN_PLACE_REF] });
  });

  test('an identity already in the plan cannot be introduced twice', () => {
    const p = plan();
    const scope = scopeFor(p);
    const catalog = buildLegalSubstitutionCatalog({
      bundle,
      // Empty plan for the catalogue so Spruce Nature Trail stays offered.
      candidatePlan: { days: [] },
      exposureDirective,
      excludedEvidenceIds: exposureDirective.ineligibleEvidenceIds,
    });
    expect(applyLegalStopSubstitution({
      itineraryData: p,
      scope,
      substitutions: [{ dayRef: 3, stopRef: 2, replacement: { placeRef: refFor(catalog, 'Spruce Nature Trail'), note: 'n', why: 'w' } }],
      candidates: catalog.candidates,
    })).toMatchObject({ ok: false, reasonCodes: [REASON.DUPLICATE_IDENTITY] });
  });

  test('untargeted stops cannot be touched and every target must be answered', () => {
    const p = plan();
    const scope = scopeFor(p);
    const catalog = catalogFor(p);
    expect(applyLegalStopSubstitution({
      itineraryData: p,
      scope,
      substitutions: [{ dayRef: 1, stopRef: 1, replacement: { placeRef: refFor(catalog, 'Cirque Rim Overlook'), note: 'n', why: 'w' } }],
      candidates: catalog.candidates,
    })).toMatchObject({ ok: false, reasonCodes: [REASON.UNKNOWN_STOP_REF] });
    expect(applyLegalStopSubstitution({
      itineraryData: p,
      scope,
      substitutions: [],
      candidates: catalog.candidates,
    })).toMatchObject({ ok: false, reasonCodes: [REASON.INCOMPLETE_COVERAGE] });
  });

  test('the tool schema offers no way to express a name, type, or duration', () => {
    const replacement = LEGAL_STOP_SUBSTITUTION_TOOL.input_schema
      .properties.substitutions.items.properties.replacement;
    expect(replacement.properties.name).toBeUndefined();
    expect(replacement.properties.type).toBeUndefined();
    expect(replacement.properties.durationMinutes).toBeUndefined();
    expect(replacement.additionalProperties).toBe(false);
    expect(replacement.required).toEqual(expect.arrayContaining(['placeRef', 'note', 'why']));
  });
});

test('bounded repair preserves reasoning effort and only substitutes its diagnosed stop', async () => {
  const { __testables } = require('../../services/trailieExecutionService');
  const candidate = plan();
  const scope = resolveSubstitutionScope({ itineraryData: candidate, offendingStops: [{ dayNumber: 3, stopName: 'Quinault Big Sitka Spruce Tree Trail' }] });
  const catalog = buildLegalSubstitutionCatalog({ bundle, candidatePlan: candidate, repairScope: scope, exposureDirective });
  const selected = catalog.candidates.find(c => c.canonicalName === 'Cirque Rim Overlook');
  const createRequest = jest.fn(x => x);
  const result = await __testables.dispatchStopSubstitutionRepair({
    validation: { candidatePlan: candidate, offendingStops: [{ dayNumber: 3, stopName: 'Quinault Big Sitka Spruce Tree Trail' }] },
    route: { provider: 'openai', model: 'gpt-6-sol', reasoningEffort: 'medium' },
    attempt: 1, dispatchIndex: 2, bundle, exposureDirective, excludedEvidenceIds: [], createRequest,
    executeResponses: async () => ({ completionStatus: 'complete', toolCalls: [{ name: 'substitute_illegal_stops', input: { substitutions: [{ dayRef: 3, stopRef: 2, replacement: { placeRef: selected.ref, note: 'Enjoy the view.', why: 'An easy scenic stop.' } }] } }], usage: {} }),
    responseAdapters: {}, priceCall: () => ({}), now: () => new Date(),
  });
  expect(createRequest.mock.calls[0][0].reasoning).toEqual({ effort: 'medium' });
  expect(createRequest.mock.calls[0][0].maxOutputTokens).toBeGreaterThan(3000);
  expect(result.mergeStatus).toBe('applied');
  expect(result.plan.days.slice(0, 2)).toEqual(candidate.days.slice(0, 2));
  expect(result.plan.days[2].stops[0]).toEqual(candidate.days[2].stops[0]);
});
