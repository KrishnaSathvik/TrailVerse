'use strict';

/**
 * Phase 12D — fresh independent degradation evaluation.
 *
 * Destinations and wording are not used in the development metamorphic suites
 * (Crater Lake / Saguaro / Everglades) and are not frozen Grand Teton / Bryce
 * goldens. Outcome classes only.
 */

const { canonicalExperienceKey } = require('../../../../../src/utils/canonicalExperience');
const { resolveStopIdentities } = require('../../../../../src/utils/stopIdentityResolution');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
} = require('../../../../../src/utils/namedExperienceRequirements');
const { classifyStopOwnership, STOP_OWNERSHIP } = require('../../../../../src/utils/stopObligationOwnership');
const { degradeUnresolvedModelStops } = require('../../../../../src/utils/modelSelectedIdentityDegradation');
const { planEvidenceRequirements } = require('../../../../../src/services/evidencePlannerService');
const { evaluateEvidenceGate } = require('../../../../../src/services/trailieV2ExecutionService');
const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const { parseConstraints } = require('../../../../../src/utils/constraintEngine');
const { hasUsableCoordinates } = require('../../../../../src/utils/coordinateValidation');

const PARK = Object.freeze({
  name: 'Great Basin',
  code: 'grba',
  entityId: 'nps:park:grba',
});

const CATALOG = Object.freeze({
  lexington: { id: 'ev:lexington-arch', name: 'Lexington Arch Trail', type: 'trail' },
  wheeler: { id: 'ev:wheeler-overlook', name: 'Wheeler Peak Overlook', type: 'viewpoint' },
  bristlecone: { id: 'ev:bristlecone-trail', name: 'Bristlecone Interpretive Trail', type: 'walk' },
});

const UNSUPPORTED = Object.freeze({
  ghost: 'Ghost Canyon Trail',
  silver: 'Silver Needle Overlook',
});

const CONGAREE = {
  entityId: 'nps:park:cong',
  entityType: 'national_park',
  displayName: 'Congaree National Park',
  latitude: 33.788,
  longitude: -80.781,
  resolutionConfidence: 1,
  parkCode: 'cong',
};
const VOYAGEURS = {
  entityId: 'nps:park:voya',
  entityType: 'national_park',
  displayName: 'Voyageurs National Park',
  latitude: 48.484,
  longitude: -92.838,
  resolutionConfidence: 1,
  parkCode: 'voya',
};

const NOW = new Date('2026-09-19T16:00:00.000Z');

function evidenceRow({ id, name, type, parkCode = PARK.code }) {
  return {
    evidenceId: id,
    entityId: `${PARK.entityId}:${id}`,
    topic: 'activities',
    claim: {
      identity: `place:${name}`,
      text: `${name}.`,
      normalizedValue: {
        name,
        category: 'place',
        activityTypes: [type],
        parkCode,
      },
    },
  };
}

function bundleWith(...rows) {
  return { evidence: rows.map(evidenceRow) };
}

function stop(name, type, extra = {}) {
  return {
    id: extra.id || `stop:${canonicalExperienceKey(name).replace(/\s+/g, '-')}`,
    name,
    type,
    duration: extra.duration ?? 75,
    note: extra.note || '',
    why: extra.why || '',
    parkCode: extra.parkCode || PARK.code,
    ...extra,
  };
}

function dayPlan(stops, extra = {}) {
  return {
    intro: extra.intro || `A day around ${PARK.name}.`,
    closing: extra.closing || '',
    days: [{
      dayNumber: 1,
      summary: extra.summary || '',
      stops,
      activityGroups: extra.activityGroups || [],
      travelEdges: extra.travelEdges || [],
    }],
  };
}

function travelerRequirements(prompt, evidenceBundle) {
  return resolveNamedExperienceRequirements({
    requests: extractNamedExperienceRequests(prompt),
    evidenceBundle,
    excludedEvidenceIds: [],
  });
}

function identityThenDegrade({
  itineraryData,
  evidenceBundle,
  userPrompt = `Sketch a grounded day at ${PARK.name}.`,
  namedExperienceRequirements = [],
}) {
  const identity = resolveStopIdentities({ itineraryData, evidenceBundle });
  return degradeUnresolvedModelStops({
    itineraryData: identity.itineraryData,
    violations: identity.violations,
    namedExperienceRequirements,
    evidenceBundle,
    userPrompt,
  });
}

function planDrive(prompt, entities) {
  const parsed = parseConstraints({ formData: {} }, prompt);
  return planEvidenceRequirements({
    turnId: 'turn:12d-fresh-drive',
    userPrompt: prompt,
    intent: classifyTrailieIntent({ userPrompt: prompt }),
    resolvedEntities: entities,
    constraints: parsed,
    tripScope: parsed.planningState?.tripScope || parsed.tripScope || null,
    now: NOW,
  });
}

function bundleSatisfying(requirements, { unsatisfied = [] } = {}) {
  return {
    resolutions: requirements.map((r) => ({
      requirementId: r.requirementId,
      status: unsatisfied.includes(r.topic) ? 'unsupported' : 'satisfied_fresh',
    })),
  };
}

describe('fresh independent — model-selected identity recovery', () => {
  test('an unused compatible catalog walk replaces one unsupported model stop', () => {
    const catalog = bundleWith(CATALOG.lexington, CATALOG.wheeler, CATALOG.bristlecone);
    const plan = dayPlan([
      stop(CATALOG.lexington.name, 'trail', { id: 's-lex' }),
      stop(CATALOG.wheeler.name, 'viewpoint', { id: 's-wheel' }),
      stop(UNSUPPORTED.ghost, 'walk', { id: 's-ghost' }),
    ]);
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'replaced', stopName: UNSUPPORTED.ghost }),
    ]));
    const names = result.itineraryData.days[0].stops.map((s) => s.name);
    expect(names).toContain(CATALOG.bristlecone.name);
    expect(names).not.toContain(UNSUPPORTED.ghost);
    expect(resolveStopIdentities({
      itineraryData: result.itineraryData,
      evidenceBundle: catalog,
    }).violations).toEqual([]);
  });

  test('two unsupported optional stops are omitted when no unused compatible places remain', () => {
    const catalog = bundleWith(CATALOG.lexington, CATALOG.wheeler);
    const plan = dayPlan([
      stop(CATALOG.lexington.name, 'trail', { id: 's-lex' }),
      stop(UNSUPPORTED.ghost, 'trail', { id: 's-ghost' }),
      stop(UNSUPPORTED.silver, 'viewpoint', { id: 's-silver' }),
    ]);
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    const names = result.itineraryData.days[0].stops.map((s) => s.name);
    expect(names).toContain(CATALOG.lexington.name);
    expect(names).not.toContain(UNSUPPORTED.ghost);
    expect(names).not.toContain(UNSUPPORTED.silver);
  });

  test('omission keeps a valid day when grounded experiences remain', () => {
    const catalog = bundleWith(CATALOG.lexington, CATALOG.wheeler);
    const plan = dayPlan([
      stop(CATALOG.lexington.name, 'trail', { id: 's-lex' }),
      stop(CATALOG.wheeler.name, 'viewpoint', { id: 's-wheel' }),
      stop(UNSUPPORTED.ghost, 'trail', { id: 's-ghost' }),
    ]);
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'omitted', stopName: UNSUPPORTED.ghost }),
    ]));
    expect(result.itineraryData.days[0].stops.map((s) => s.name)).toEqual([
      CATALOG.lexington.name,
      CATALOG.wheeler.name,
    ]);
  });

  test('omission drops dangling group ids, travel edges, and prose mentions', () => {
    const catalog = bundleWith(CATALOG.lexington, CATALOG.wheeler);
    const plan = dayPlan([
      stop(CATALOG.lexington.name, 'trail', { id: 's-lex' }),
      stop(UNSUPPORTED.ghost, 'trail', { id: 's-ghost' }),
      stop(CATALOG.wheeler.name, 'viewpoint', { id: 's-wheel' }),
    ], {
      intro: `After ${UNSUPPORTED.ghost}, head toward the overlook.`,
      summary: `Morning on ${UNSUPPORTED.ghost}.`,
      closing: `We left ${UNSUPPORTED.ghost} at dusk.`,
      activityGroups: [{ id: 'g-ghost', stopIds: ['s-ghost', 's-wheel'] }],
      travelEdges: [{ sourceStopId: 's-lex', targetStopId: 's-ghost', modeIntent: 'walk' }],
    });
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    const day = result.itineraryData.days[0];
    expect(day.activityGroups || []).toEqual([]);
    expect(day.travelEdges || []).toEqual([]);
    const blob = `${result.itineraryData.intro} ${day.summary} ${result.itineraryData.closing}`;
    expect(blob).not.toMatch(/Ghost Canyon/);
  });
});

describe('fresh independent — traveler-named experiences stay fail-closed', () => {
  test('an explicit must-include that the catalog cannot bind is unavailable', () => {
    const prompt = `Please specifically include ${UNSUPPORTED.ghost} while we are at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, bundleWith(CATALOG.lexington, CATALOG.wheeler));
    const blocked = requirements.filter((r) => r.status !== 'resolved');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].requestedName).toMatch(/ghost canyon/i);
    expect(blocked[0].status).toBe('unavailable');
  });

  test('a generated traveler-required unsupported stop cannot be replaced or omitted', () => {
    const catalog = bundleWith(CATALOG.lexington, CATALOG.wheeler);
    const prompt = `I specifically want to hike ${UNSUPPORTED.ghost} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, catalog);
    const result = identityThenDegrade({
      itineraryData: dayPlan([
        stop(CATALOG.lexington.name, 'trail'),
        stop(UNSUPPORTED.ghost, 'trail'),
      ]),
      evidenceBundle: catalog,
      userPrompt: prompt,
      namedExperienceRequirements: requirements,
    });
    expect(result.status).toBe('fail_closed');
    expect(JSON.stringify(result.itineraryData)).toMatch(/Ghost Canyon/);
  });

  test('dropping the only remaining stop cannot satisfy a resolved traveler obligation', () => {
    const catalog = bundleWith(CATALOG.wheeler);
    const prompt = `Make sure we visit ${CATALOG.wheeler.name} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, catalog);
    expect(classifyStopOwnership({
      stop: stop(CATALOG.wheeler.name, 'viewpoint'),
      namedExperienceRequirements: requirements,
      evidenceBundle: catalog,
    })).toBe(STOP_OWNERSHIP.TRAVELER_REQUIRED);
    const result = identityThenDegrade({
      itineraryData: dayPlan([stop(UNSUPPORTED.ghost, 'trail', { id: 's-ghost' })]),
      evidenceBundle: catalog,
      userPrompt: prompt,
      namedExperienceRequirements: requirements,
    });
    expect(result.status).toBe('fail_closed');
  });
});

describe('fresh independent — driving-time ownership', () => {
  test('ordinary multi-park wording without a numeric cap degrades when Maps is down', () => {
    const prompt = 'Lay out four days across Congaree and Voyageurs with as little doubling back as we can.';
    const requirements = planDrive(prompt, [CONGAREE, VOYAGEURS]);
    const drives = requirements.filter((r) => r.topic === 'driving_time');
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.every((d) => d.criticality !== 'hard')).toBe(true);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['driving_time'] }),
    );
    expect(gate.hardComplete).toBe(true);
    expect(gate.unmetHardReasons).not.toContain('unmet_hard_driving_time');
  });

  test('an explicit daily drive cap stays hard when minutes cannot be verified', () => {
    const prompt = 'Lay out four days across Congaree and Voyageurs. Keep driving under 2 hours per day.';
    const requirements = planDrive(prompt, [CONGAREE, VOYAGEURS]);
    expect(requirements.some((r) => r.topic === 'driving_time' && r.criticality === 'hard')).toBe(true);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['driving_time'] }),
    );
    expect(gate.hardComplete).toBe(false);
    expect(gate.unmetHardReasons).toContain('unmet_hard_driving_time');
  });

  test('a direct duration question does not become an itinerary and cannot invent minutes', () => {
    const prompt = 'How long does it take to drive from Congaree to Voyageurs?';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    expect(intent.travelerJob).toBe('route_planning');
    expect(intent.primaryIntent).not.toMatch(/itinerary/);
    const requirements = planDrive(prompt, [CONGAREE, VOYAGEURS]);
    expect(requirements.some((r) => r.topic === 'driving_time' && r.criticality === 'hard')).toBe(true);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['driving_time'] }),
    );
    expect(gate.hardComplete).toBe(false);
  });
});

describe('fresh independent — coordinate policy unchanged', () => {
  test('unmapped catalog stops still bind identity and do not gain invented coordinates', () => {
    const catalog = bundleWith(CATALOG.lexington, CATALOG.wheeler);
    const identity = resolveStopIdentities({
      itineraryData: dayPlan([
        stop(CATALOG.lexington.name, 'trail'),
        stop(CATALOG.wheeler.name, 'viewpoint'),
      ]),
      evidenceBundle: catalog,
    });
    expect(identity.violations).toEqual([]);
    for (const bound of identity.itineraryData.days[0].stops) {
      expect(bound.evidenceRef).toBeTruthy();
      expect(hasUsableCoordinates(bound)).toBe(false);
    }
  });
});
