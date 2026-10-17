'use strict';

/**
 * Phase 12D — metamorphic identity/provider ownership and degradation.
 *
 * Synthetic catalog fixtures only. Destinations are not 12A/12B/12C parks
 * and not the frozen Grand Teton / Bryce held-out prompts. Asserts outcome
 * classes and canonical integrity, never exact prose.
 */

const { canonicalExperienceKey } = require('../canonicalExperience');
const { resolveStopIdentities } = require('../stopIdentityResolution');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
} = require('../namedExperienceRequirements');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const {
  classifyStopOwnership,
  STOP_OWNERSHIP,
} = require('../stopObligationOwnership');
const {
  degradeUnresolvedModelStops,
} = require('../modelSelectedIdentityDegradation');

const PARK = Object.freeze({
  name: 'Crater Lake',
  code: 'crla',
  entityId: 'nps:park:crla',
});

const CATALOG = Object.freeze({
  rim: { id: 'ev:rim-promenade', name: 'Rim Village Promenade', type: 'viewpoint' },
  watchman: { id: 'ev:watchman-trail', name: 'Watchman Overlook Trail', type: 'trail' },
  cinder: { id: 'ev:cinder-boardwalk', name: 'Cinder Cone Boardwalk', type: 'walk' },
});

const UNSUPPORTED = Object.freeze({
  phantom: 'Phantom Ridge Trail',
  copper: 'Copper Basin Overlook',
});

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
    duration: extra.duration ?? 60,
    note: extra.note || '',
    why: extra.why || '',
    parkCode: extra.parkCode || PARK.code,
    ...extra,
  };
}

function dayPlan(stops, extra = {}) {
  return {
    intro: extra.intro || `A day at ${PARK.name}.`,
    closing: extra.closing || '',
    days: [
      {
        dayNumber: 1,
        summary: extra.summary || '',
        stops,
        activityGroups: extra.activityGroups || [],
        travelEdges: extra.travelEdges || [],
      },
    ],
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
  userPrompt = `Plan a day at ${PARK.name}.`,
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

describe('ownership classification', () => {
  const catalog = bundleWith(CATALOG.rim, CATALOG.watchman);

  test('a rest stop is supporting_optional', () => {
    expect(classifyStopOwnership({
      stop: stop('Picnic lunch', 'picnic'),
      namedExperienceRequirements: [],
      evidenceBundle: catalog,
    })).toBe(STOP_OWNERSHIP.SUPPORTING_OPTIONAL);
  });

  test('a catalog experiential stop the traveler did not name is model_selected', () => {
    expect(classifyStopOwnership({
      stop: stop(CATALOG.rim.name, 'viewpoint'),
      namedExperienceRequirements: [],
      evidenceBundle: catalog,
    })).toBe(STOP_OWNERSHIP.MODEL_SELECTED);
  });

  test('a stop matching an explicit traveler named experience is traveler_required', () => {
    const prompt = `I absolutely want to visit ${CATALOG.watchman.name} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, catalog);
    expect(requirements.some((r) => r.status === 'resolved')).toBe(true);
    expect(classifyStopOwnership({
      stop: stop(CATALOG.watchman.name, 'trail'),
      namedExperienceRequirements: requirements,
      evidenceBundle: catalog,
    })).toBe(STOP_OWNERSHIP.TRAVELER_REQUIRED);
  });

  test('an unresolved name the traveler required is still traveler_required', () => {
    const prompt = `I absolutely want to hike ${UNSUPPORTED.phantom} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, catalog);
    expect(classifyStopOwnership({
      stop: stop(UNSUPPORTED.phantom, 'trail'),
      namedExperienceRequirements: requirements,
      evidenceBundle: catalog,
    })).toBe(STOP_OWNERSHIP.TRAVELER_REQUIRED);
  });
});

describe('traveler-named experiences remain fail-closed', () => {
  test('an unsupported must-include named experience is unavailable before generation', () => {
    const prompt = `I absolutely want to hike ${UNSUPPORTED.phantom} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, bundleWith(CATALOG.rim, CATALOG.watchman));
    const blocked = requirements.filter((r) => r.status !== 'resolved');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].requestedName).toMatch(/phantom ridge/i);
    expect(blocked[0].status).toBe('unavailable');
  });

  test('a generated stop for an unresolved traveler requirement cannot be omitted or replaced', () => {
    const catalog = bundleWith(CATALOG.rim, CATALOG.watchman);
    const prompt = `I absolutely want to hike ${UNSUPPORTED.phantom} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, catalog);
    const plan = dayPlan([
      stop(CATALOG.rim.name, 'viewpoint'),
      stop(UNSUPPORTED.phantom, 'trail', { note: `After ${UNSUPPORTED.phantom}, continue along the rim.` }),
    ]);
    const result = identityThenDegrade({
      itineraryData: plan,
      evidenceBundle: catalog,
      userPrompt: prompt,
      namedExperienceRequirements: requirements,
    });
    expect(result.status).toBe('fail_closed');
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['stop_identity_unresolved']));
    expect(JSON.stringify(result.itineraryData)).toMatch(/Phantom Ridge/);
  });
});

describe('model-selected unresolved stops degrade', () => {
  test('a useful grounded remainder permits omission without adding filler', () => {
    const catalog = bundleWith(CATALOG.rim, CATALOG.watchman, CATALOG.cinder);
    const plan = dayPlan([
      stop(CATALOG.rim.name, 'viewpoint', { id: 's-rim' }),
      stop(CATALOG.watchman.name, 'trail', { id: 's-watch' }),
      stop(UNSUPPORTED.phantom, 'walk', { id: 's-phantom' }),
    ]);
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'omitted', stopName: UNSUPPORTED.phantom }),
    ]));
    const names = result.itineraryData.days[0].stops.map((s) => s.name);
    expect(names).toContain(CATALOG.rim.name);
    expect(names).not.toContain(CATALOG.cinder.name);
    expect(names).not.toContain(UNSUPPORTED.phantom);
    expect(names).not.toContain(UNSUPPORTED.copper);
    const rebound = resolveStopIdentities({
      itineraryData: result.itineraryData,
      evidenceBundle: catalog,
    });
    expect(rebound.violations).toEqual([]);
  });

  test('two unsupported optional stops are replaced or omitted independently', () => {
    const catalog = bundleWith(CATALOG.rim, CATALOG.watchman);
    const plan = dayPlan([
      stop(CATALOG.rim.name, 'viewpoint', { id: 's-rim' }),
      stop(UNSUPPORTED.phantom, 'trail', { id: 's-phantom' }),
      stop(UNSUPPORTED.copper, 'viewpoint', { id: 's-copper' }),
    ]);
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    const names = result.itineraryData.days[0].stops.map((s) => s.name);
    expect(names).toContain(CATALOG.rim.name);
    expect(names).not.toContain(UNSUPPORTED.phantom);
    expect(names).not.toContain(UNSUPPORTED.copper);
    expect(resolveStopIdentities({
      itineraryData: result.itineraryData,
      evidenceBundle: catalog,
    }).violations).toEqual([]);
  });

  test('omission is used when no type-compatible unused catalog alternative exists', () => {
    const catalog = bundleWith(CATALOG.rim, CATALOG.watchman);
    const plan = dayPlan([
      stop(CATALOG.rim.name, 'viewpoint', { id: 's-rim' }),
      stop(CATALOG.watchman.name, 'trail', { id: 's-watch' }),
      stop(UNSUPPORTED.phantom, 'trail', { id: 's-phantom' }),
    ]);
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'omitted', stopName: UNSUPPORTED.phantom }),
    ]));
    const names = result.itineraryData.days[0].stops.map((s) => s.name);
    expect(names).toEqual([CATALOG.rim.name, CATALOG.watchman.name]);
  });

  test('omitting the traveler’s only requested named experience is not allowed', () => {
    const catalog = bundleWith(CATALOG.rim);
    const prompt = `I absolutely want to visit ${CATALOG.rim.name} at ${PARK.name}.`;
    const requirements = travelerRequirements(prompt, catalog);
    const plan = dayPlan([
      stop(UNSUPPORTED.phantom, 'trail', { id: 's-phantom' }),
    ]);
    const result = identityThenDegrade({
      itineraryData: plan,
      evidenceBundle: catalog,
      userPrompt: prompt,
      namedExperienceRequirements: requirements,
    });
    expect(result.status).toBe('fail_closed');
    expect(result.itineraryData.days[0].stops.some((s) => s.name === UNSUPPORTED.phantom)).toBe(true);
  });

  test('omission sanitizes activityGroups, travelEdges, and prose mentions', () => {
    const catalog = bundleWith(CATALOG.rim, CATALOG.watchman);
    const phantom = stop(UNSUPPORTED.phantom, 'trail', { id: 's-phantom' });
    const rim = stop(CATALOG.rim.name, 'viewpoint', { id: 's-rim' });
    const watch = stop(CATALOG.watchman.name, 'trail', { id: 's-watch' });
    const plan = dayPlan([rim, phantom, watch], {
      intro: `After ${UNSUPPORTED.phantom}, continue to ${CATALOG.rim.name}.`,
      summary: `Morning at ${UNSUPPORTED.phantom}.`,
      closing: `We wrapped at ${UNSUPPORTED.phantom}.`,
      activityGroups: [{ id: 'g1', stopIds: ['s-phantom', 's-watch'] }],
      travelEdges: [{ sourceStopId: 's-rim', targetStopId: 's-phantom', modeIntent: 'walk' }],
    });
    const result = identityThenDegrade({ itineraryData: plan, evidenceBundle: catalog });
    expect(result.status).toBe('degraded');
    const day = result.itineraryData.days[0];
    expect(day.stops.map((s) => s.id)).toEqual(['s-rim', 's-watch']);
    expect(day.activityGroups || []).toEqual([]);
    expect(day.travelEdges || []).toEqual([]);
    const blob = `${result.itineraryData.intro} ${day.summary} ${result.itineraryData.closing}`;
    expect(blob).not.toMatch(/Phantom Ridge/);
    const completeness = evaluateItineraryCompleteness({
      itineraryData: result.itineraryData,
      userPrompt: `Plan a day at ${PARK.name}.`,
      evidenceBundle: catalog,
    });
    expect(completeness.ok).toBe(true);
  });

  test('missing coordinates on otherwise-valid catalog stops are not identity failures', () => {
    const catalog = bundleWith(CATALOG.rim, CATALOG.watchman);
    const plan = dayPlan([
      stop(CATALOG.rim.name, 'viewpoint'),
      stop(CATALOG.watchman.name, 'trail'),
    ]);
    const identity = resolveStopIdentities({ itineraryData: plan, evidenceBundle: catalog });
    expect(identity.violations).toEqual([]);
    expect(identity.itineraryData.days[0].stops.every((s) => s.evidenceRef)).toBe(true);
    expect(identity.itineraryData.days[0].stops.every((s) => s.latitude == null && s.longitude == null)).toBe(true);
  });
});
