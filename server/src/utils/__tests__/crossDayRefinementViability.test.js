'use strict';

/**
 * Cross-day refinement candidate viability — offline fixtures.
 * Provider-isolated; no network / model calls.
 */

const {
  projectCandidateCrossDayViability,
  projectDayStopsAgainstFrozenPlan,
} = require('../refinementCrossDayCandidateViability');
const { packRefinementEvidence } = require('../../prompts/refinementEvidencePacking');
const { classifyRepairRetryability } = require('../repairRetryability');
const { STRUCTURAL_REASONS, OPERATORS } = require('../repairOperators');
const { structuralScopes } = require('../planViabilityRepair');
const { projectPlan } = require('../downstreamRepairPlanner');
const { bindRepairPatch } = require('../boundRepairPatch');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { commitUnderstoodTripChange } = require('../../services/tripMutationCommit');
const { emptyPlanningState } = require('../planningState');

function record(id, value, topic = 'activities') {
  return { evidenceId: id, topic, claim: { text: value.description || value.name, normalizedValue: value } };
}

function trail(id, name, extra = {}) {
  return record(id, {
    name, type: 'trail', activityTypes: ['hiking'], duration: '75 minutes', exposureLevel: 'low', ...extra,
  });
}

function stop(name, extra = {}) {
  return {
    id: `s-${String(name).replace(/\W+/g, '-').toLowerCase()}`,
    name,
    canonicalPlaceName: name,
    type: extra.type || 'hike',
    duration: extra.duration || 75,
    evidenceRef: extra.evidenceRef || `ev:${name}`,
    resolutionStatus: 'resolved',
    exposureLevel: 'low',
    ...extra,
  };
}

function zionPlan() {
  return {
    days: [
      {
        dayNumber: 1, id: 'zion-day-1',
        stops: [
          stop('Zion Canyon Visitor Center', { type: 'visitor_center', duration: 25, evidenceRef: 'ev:vc' }),
          stop("Pa'rus Trail", { evidenceRef: 'ev:parus' }),
        ],
      },
      {
        dayNumber: 2, id: 'zion-day-2',
        stops: [stop('Temple of Sinawava', { evidenceRef: 'ev:temple' })],
      },
      {
        dayNumber: 3, id: 'zion-day-3',
        stops: [
          stop("Pa'rus - Diversion Dam", { evidenceRef: 'ev:dam' }),
          stop('Zion Human History Museum Patio', { type: 'museum', duration: 40, evidenceRef: 'ev:museum' }),
        ],
      },
      {
        dayNumber: 4, id: 'zion-day-4',
        stops: [stop('Lava Point Overlook', { type: 'viewpoint', duration: 30, evidenceRef: 'ev:lava' })],
      },
    ],
  };
}

function lodgingBundle() {
  return {
    evidence: [
      trail('ev:parus', "Pa'rus Trail"),
      trail('ev:dam', "Pa'rus - Diversion Dam"),
      trail('ev:temple', 'Temple of Sinawava'),
      trail('ev:cedar', 'Cedar Bench Trail'),
      trail('ev:watchman', 'Watchman Trail'),
      record('ev:lava', {
        name: 'Lava Point Overlook', type: 'viewpoint', activityTypes: ['sightseeing'],
        duration: '30 minutes', exposureLevel: 'low',
      }),
      record('ev:museum', {
        name: 'Zion Human History Museum Patio', type: 'museum',
        activityTypes: ['exhibits'], duration: '40 minutes', exposureLevel: 'low',
      }, 'activities'),
      record('ev:vc', {
        name: 'Zion Canyon Visitor Center', category: 'visitor_center', type: 'visitor_center',
      }, 'visitor_services'),
    ],
  };
}

const MESSAGE = 'Redo day two around that.';
const CONSTRAINTS = {
  avoidExposure: true,
  preferences: { avoidExposure: true },
  dates: { startDate: '2027-09-12', endDate: '2027-09-17' },
  lodging: {
    type: 'lodging', baseTown: 'Springdale', booked: true,
    stateOrRegion: 'Utah', country: 'US', lat: 37.18887, lon: -112.99855,
    resolutionStatus: 'resolved',
  },
};

describe('cross-day refinement candidate viability', () => {
  test('1. candidate duplicates frozen Day 3 → not self-sufficient for Day 2', () => {
    const cross = projectCandidateCrossDayViability({
      plan: zionPlan(),
      targetDayNumbers: [2],
      candidateStop: stop("Pa'rus - Diversion Dam", { evidenceRef: 'ev:dam' }),
    });
    expect(cross.selfSufficient).toBe(false);
    expect(cross.structuralSelectable).toBe(false);
    expect(cross.crossDayConflict).toBe(true);
    expect(cross.conflictingDayNumbers).toEqual([3]);
    expect(cross.revisitClassification).toBe('REDUNDANT_DUPLICATE');
  });

  test('2. same anchor but grounded distinct revisit → remains eligible', () => {
    // Frozen Day 3 already visited Diversion Dam as an afternoon hike.
    // A sunrise photography stop is a grounded DISTINCT_REVISIT, not padding.
    const plan = {
      ...zionPlan(),
      days: zionPlan().days.map((d) => (d.dayNumber === 3
        ? {
          ...d,
          stops: [
            stop("Pa'rus - Diversion Dam", {
              evidenceRef: 'ev:dam',
              type: 'hike',
              timeWindow: 'Afternoon',
            }),
            stop('Zion Human History Museum Patio', {
              type: 'museum', duration: 40, evidenceRef: 'ev:museum',
            }),
          ],
        }
        : d)),
    };
    const cross = projectCandidateCrossDayViability({
      plan,
      targetDayNumbers: [2],
      candidateStop: stop("Pa'rus - Diversion Dam", {
        type: 'photography',
        timeWindow: 'Sunrise',
        evidenceRef: 'ev:dam',
      }),
    });
    expect(cross.crossDayConflict).toBe(false);
    expect(cross.selfSufficient).toBe(true);
    expect(cross.revisitClassification).toBe('DISTINCT_REVISIT');
    expect(cross.crossDayRepetitionStatus).toBe('distinct_revisit');
  });

  test('3. candidate unique across frozen trip → eligible', () => {
    const cross = projectCandidateCrossDayViability({
      plan: zionPlan(),
      targetDayNumbers: [2],
      candidateStop: stop('Cedar Bench Trail', { evidenceRef: 'ev:cedar' }),
    });
    expect(cross.selfSufficient).toBe(true);
    expect(cross.structuralSelectable).toBe(true);
    expect(cross.conflictingDayNumbers).toEqual([]);
  });

  test('4. two individually valid candidates create conflict as a pair → rejected', () => {
    const plan = zionPlan();
    // Cedar is unique; Diversion Dam collides with Day 3.
    const projection = projectDayStopsAgainstFrozenPlan({
      plan,
      targetDayNumber: 2,
      proposedStops: [
        stop("Pa'rus - Diversion Dam", { evidenceRef: 'ev:dam' }),
        stop('Temple of Sinawava', { evidenceRef: 'ev:temple' }),
      ],
    });
    expect(projection.ok).toBe(false);
    expect(projection.reasonCodes).toContain('duplicate_base_experience');
    expect(projection.conflicts.some((c) => c.dayNumbers.includes(3))).toBe(true);

    const bound = bindRepairPatch({
      priorPlan: plan,
      candidates: [
        { ref: 1, canonicalName: "Pa'rus - Diversion Dam", canonicalType: 'hike', evidenceIds: ['ev:dam'] },
        { ref: 2, canonicalName: 'Temple of Sinawava', canonicalType: 'hike', evidenceIds: ['ev:temple'] },
      ],
      planPatch: {
        operations: [{
          op: 'update_day',
          dayNumber: 2,
          day: {
            dayNumber: 2,
            stops: [
              { placeRef: 1, name: "Pa'rus - Diversion Dam", type: 'hike', duration: 75 },
              { placeRef: 2, name: 'Temple of Sinawava', type: 'hike', duration: 75 },
            ],
          },
        }],
      },
    });
    expect(bound.ok).toBe(false);
    expect(bound.reasonCodes).toContain('duplicate_base_experience');
  });

  test('5. primary selects duplicate but alternatives exist → model_fixable + PLAN_VIABILITY_EDIT', () => {
    expect(STRUCTURAL_REASONS.has('duplicate_base_experience')).toBe(true);
    expect(OPERATORS.VIABILITY).toBe('PLAN_VIABILITY_EDIT');
    expect(classifyRepairRetryability({
      status: 'fail',
      reasonCodes: ['duplicate_base_experience'],
    }, { candidateCount: 3 })).toBe('model_fixable');

    const plan = zionPlan();
    // Hypothetical failed Day 2 that duplicated Day 3.
    const failed = {
      ...plan,
      days: plan.days.map((d) => (d.dayNumber === 2
        ? {
          ...d,
          stops: [
            stop("Pa'rus - Diversion Dam", { evidenceRef: 'ev:dam' }),
            stop('Temple of Sinawava', { evidenceRef: 'ev:temple' }),
          ],
        }
        : d)),
    };
    const completeness = evaluateItineraryCompleteness({
      itineraryData: failed,
      evidenceBundle: lodgingBundle(),
      isRefinement: true,
      touchedDayNumbers: [2],
      userPrompt: MESSAGE,
    });
    expect(completeness.reasonCodes).toContain('duplicate_base_experience');
    const projection = projectPlan(failed, {
      bundle: lodgingBundle(),
      constraints: CONSTRAINTS,
      userPrompt: MESSAGE,
      isRefinement: true,
      touchedDayNumbers: [2],
    });
    const scopes = structuralScopes(failed, {
      bundle: lodgingBundle(),
      constraints: CONSTRAINTS,
      userPrompt: MESSAGE,
      touchedDayNumbers: [2],
    }, projection);
    expect(scopes.some((s) => s.dayNumber === 2
      && s.reasons.includes('duplicate_base_experience'))).toBe(true);
    expect(scopes.every((s) => s.dayNumber === 2)).toBe(true);
  });

  test('6. primary selects duplicate and no alternatives → evidence_blocker', () => {
    expect(classifyRepairRetryability({
      status: 'fail',
      reasonCodes: ['duplicate_base_experience'],
    }, { candidateCount: 0 })).toBe('evidence_blocker');
  });

  test('7–8. repair scope is Day 2 only; cannot remove Day 3 to solve', () => {
    const plan = zionPlan();
    const failed = {
      ...plan,
      days: plan.days.map((d) => (d.dayNumber === 2
        ? { ...d, stops: [stop("Pa'rus - Diversion Dam", { evidenceRef: 'ev:dam' })] }
        : d)),
    };
    const scopes = structuralScopes(failed, {
      bundle: lodgingBundle(),
      constraints: CONSTRAINTS,
      userPrompt: MESSAGE,
      isRefinement: true,
      touchedDayNumbers: [2],
    });
    expect(scopes.map((s) => s.dayNumber)).toEqual([2]);
    expect(scopes[0].targets.every((t) => t.dayNumber === 2)).toBe(true);
    expect(scopes.some((s) => s.dayNumber === 3)).toBe(false);
  });

  test('9. authorized non-colliding update_day binds successfully', () => {
    const bound = bindRepairPatch({
      priorPlan: zionPlan(),
      candidates: [
        { ref: 1, canonicalName: 'Cedar Bench Trail', canonicalType: 'hike', evidenceIds: ['ev:cedar'] },
        { ref: 2, canonicalName: 'Temple of Sinawava', canonicalType: 'hike', evidenceIds: ['ev:temple'] },
      ],
      planPatch: {
        operations: [{
          op: 'update_day',
          dayNumber: 2,
          day: {
            dayNumber: 2,
            stops: [
              { placeRef: 1, duration: 90, note: 'Easy canyon walk from Springdale base.', why: 'Keeps Day 2 near the main canyon.' },
              { placeRef: 2, duration: 75, note: 'Second canyon outing.', why: 'Distinct from Day 3.' },
            ],
          },
        }],
      },
    });
    expect(bound.ok).toBe(true);
    expect(bound.patch.operations[0].day.stops[0].name).toBe('Cedar Bench Trail');
  });

  test('10–12. packing excludes frozen collisions; lodging/preferences survive; no drive times', () => {
    const packed = packRefinementEvidence({
      bundle: lodgingBundle(),
      plan: zionPlan(),
      constraints: CONSTRAINTS,
      userRequest: MESSAGE,
      limit: 2000,
    });
    const names = packed.structuralCandidates.map((c) => c.canonicalName);
    expect(names.some((n) => /diversion dam/i.test(n))).toBe(false);
    expect(names.some((n) => /lava point/i.test(n))).toBe(false);
    expect(names.some((n) => /pa'?rus trail/i.test(n))).toBe(false);
    expect(packed.structuralCandidates.every((c) => c.structuralSelectable)).toBe(true);
    expect(packed.structuralCandidates.some((c) => !c.selfSufficient)).toBe(true); // legal composition ingredients are not advertised as complete days
    expect(packed.structuralCandidates.every((c) => !c.crossDayConflict)).toBe(true);
    expect(packed.refinementPacking.affectedDays).toEqual([2]);

    // Audit captured Diversion Dam projection explicitly.
    const dam = projectCandidateCrossDayViability({
      plan: zionPlan(),
      targetDayNumbers: [2],
      candidateStop: stop("Pa'rus - Diversion Dam"),
    });
    expect(dam).toMatchObject({
      conflictingDayNumbers: [3],
      revisitClassification: 'REDUNDANT_DUPLICATE',
      selfSufficient: false,
    });

    const state = emptyPlanningState();
    state.destination.parkCode = 'zion';
    state.dates = { ...CONSTRAINTS.dates, durationDays: 4, tripWindowDays: 6 };
    state.preferences.avoidExposure = true;
    state.activityPreferences.photography = true;
    state.activityPreferences.photographyTiming = 'sunrise';
    state.lodging = { ...CONSTRAINTS.lodging };
    const after = commitUnderstoodTripChange({
      message: 'Redo day two around that.',
      planningState: state,
      hasExistingPlan: true,
    });
    // Refinement message itself is not a lodging commit — preferences persist.
    expect(after.planningState.preferences.avoidExposure).toBe(true);
    expect(after.planningState.activityPreferences.photographyTiming).toBe('sunrise');
    expect(after.planningState.lodging.baseTown).toBe('Springdale');
    expect(packed.text).not.toMatch(/\d+\s*-?\s*(?:minute|min|hour)s?\s+(?:drive|from your)/i);
  });
});
