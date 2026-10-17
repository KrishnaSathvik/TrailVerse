'use strict';

const {
  deriveExecutionContract,
} = require('../../services/trailieExecutionContract');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const {
  isAcceptedCanonicalPlan,
  isDraftPlan,
} = require('../canonicalPlanAcceptance');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const {
  inferExperienceKind,
  EXPERIENCE_KINDS,
} = require('../groundedExperienceIdentity');
const { classifyRepairRetryability } = require('../repairRetryability');
const {
  buildGeocodeBiasFromTripContext,
} = require('../../services/geocodePlaceService');

describe('P0 sufficiency authority before artifact generation', () => {
  test('clarify_before_plan cannot force a required itinerary', () => {
    const understanding = {
      requestedArtifact: 'itinerary',
      structurePolicy: 'required',
      forbiddenArtifacts: [],
      executionDecision: 'clarify_before_plan',
      clarificationNeeded: true,
      materialMissingInformation: [{ concept: 'destination', whyItMatters: 'x' }],
      taskFamily: 'trip_planning',
    };
    const contract = deriveExecutionContract({
      understanding,
      travelerJob: 'full_trip',
      legacy: { primaryIntent: 'full_trip', depth: 'planning', verticals: ['itinerary'] },
      hasPriorPlan: false,
    });
    expect(contract.allowsCanonicalPlanArtifact).toBe(false);
    expect(contract.requiresCanonicalPlanArtifact).toBe(false);
    expect(contract.maxArtifact).toBe('plain_answer');
    expect(contract.clarificationNeeded).toBe(true);
    expect(contract.reasonCodes).toContain('sufficiency_clarify_blocks_artifact');
  });

  test('committed Zion with duration stays plan_now (sufficiency unchanged)', () => {
    const u = buildTurnUnderstanding({ userPrompt: 'Give me four days in Zion.' });
    expect(u.executionDecision).toBe('plan_now');
    expect(u.clarificationNeeded).toBe(false);
    const contract = deriveExecutionContract({
      understanding: u,
      travelerJob: 'full_trip',
      hasPriorPlan: false,
    });
    expect(contract.allowsCanonicalPlanArtifact).toBe(true);
  });
});

describe('P0 draftPlan is not an accepted canonical itinerary', () => {
  const draft = {
    status: 'draft',
    days: [
      { id: 'draft-day-1', status: 'draft', dayNumber: 1, stops: [] },
      { id: 'draft-day-2', status: 'draft', dayNumber: 2, stops: [] },
      { id: 'draft-day-3', status: 'draft', dayNumber: 3, stops: [] },
      { id: 'draft-day-4', status: 'draft', dayNumber: 4, stops: [] },
    ],
  };

  test('empty draft skeleton is draft, not accepted', () => {
    expect(isDraftPlan(draft)).toBe(true);
    expect(isAcceptedCanonicalPlan(draft)).toBe(false);
  });

  test('redo-day style understanding does not treat draft as prior plan', () => {
    const u = buildTurnUnderstanding({
      userPrompt: 'Redo day two.',
      priorTripState: {
        hasItinerary: true,
        existingCanonicalPlan: draft,
        lastTravelerJob: 'full_trip',
      },
    });
    // Draft veto: cannot enter itinerary_patch against empty draft-day slots.
    expect(u.requestedArtifact).not.toBe('itinerary_patch');
    const contract = deriveExecutionContract({
      understanding: {
        ...u,
        requestedArtifact: 'itinerary_patch',
        structurePolicy: 'required',
      },
      travelerJob: 'trip_refinement',
      hasPriorPlan: isAcceptedCanonicalPlan(draft),
    });
    expect(contract.patchExecutable).toBe(false);
    expect(contract.hasPriorPlan).toBe(false);
  });

  test('patch without accepted plan downgrades to plain_answer', () => {
    const contract = deriveExecutionContract({
      understanding: {
        requestedArtifact: 'itinerary_patch',
        structurePolicy: 'required',
        forbiddenArtifacts: [],
      },
      travelerJob: 'trip_refinement',
      hasPriorPlan: false,
    });
    expect(contract.maxArtifact).toBe('plain_answer');
    expect(contract.allowsCanonicalPlanArtifact).toBe(false);
    expect(contract.reasonCodes).toContain('patch_without_prior_plan');
  });
});

describe('P1 grounded experience identity', () => {
  test('highway / scenic drive names infer scenic_drive kind', () => {
    expect(inferExperienceKind({ name: 'Zion-Mt. Carmel Highway' }))
      .toBe(EXPERIENCE_KINDS.SCENIC_DRIVE);
  });

  test('roads evidence can ground a scenic drive stop', () => {
    const bundle = {
      evidence: [{
        evidenceId: 'ev:roads:mtcarmel',
        topic: 'roads',
        entityId: 'nps:park:zion',
        claim: {
          text: 'Zion-Mt. Carmel Highway: road open with temporary delays',
          normalizedValue: {
            title: 'Zion-Mt. Carmel Highway temporary delays',
          },
        },
      }],
    };
    const result = resolveStopIdentities({
      itineraryData: {
        days: [{
          dayNumber: 1,
          stops: [{
            name: 'Zion-Mt. Carmel Highway',
            type: 'scenic_drive',
            duration: 90,
          }],
        }],
      },
      evidenceBundle: bundle,
    });
    expect(result.violations).toEqual([]);
    expect(result.itineraryData.days[0].stops[0].resolutionStatus).toBe('resolved');
    expect(result.itineraryData.days[0].stops[0].type).toBe('scenic_drive');
  });
});

describe('P1 contextual geocode bias', () => {
  test('active trip coordinates produce bias', () => {
    const bias = buildGeocodeBiasFromTripContext({
      primaryDestination: { lat: 37.2982, lon: -113.0263, states: 'UT' },
    });
    expect(bias).toMatchObject({ lat: 37.2982, lon: -113.0263, state: 'utah' });
  });
});

describe('grounded experience retryability', () => {
  test('unresolved identity with empty catalogue is evidence_blocker', () => {
    expect(classifyRepairRetryability({
      status: 'fail',
      reasonCodes: ['stop_identity_unresolved', 'missing_experience_anchor'],
    }, { candidateCount: 0 })).toBe('evidence_blocker');
  });
});
