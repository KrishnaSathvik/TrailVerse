'use strict';

/**
 * PLANNER ↔ PROVIDER INVARIANT.
 *
 *   The planner may not emit a requirement whose declared providers cannot
 *   service it under the scope it was planned with.
 *
 * `TOPIC_POLICY` and each provider's `supports()` used to be able to contradict
 * each other with nothing checking. The 2026-08-26 evidence critical-path audit
 * found nine topics where they did, and the contradiction was not merely
 * cosmetic:
 *
 *   - a requirement no provider supports resolves `unsupported` in the
 *     structured wave, then falls through to the sequential web wave;
 *   - `evaluateEvidenceGate` counts it as unmet, so reported coverage was
 *     permanently `partial` on ordinary plan creation;
 *   - and when the requirement is `hard` — `trail_conditions` and
 *     `wildfire_smoke` are, on `live_in_trip_assistance` — an unmet requirement
 *     returns `evidence_incomplete` BEFORE any model dispatch. The traveler
 *     asking the most urgent question got no answer at all.
 *
 * What was repaired:
 *
 *   roads, trail_conditions, wildfire_smoke   nps now serves them from the alerts
 *                                             feed it already fetches (same dedupe key)
 *   events, transit                           declared to the web provider that serves them
 *   lodging_strategy, local_business          declared to serper, which serves them
 *   flight_strategy                           no provider exists; declared empty, and the
 *                                             planner now skips providerless topics
 *   driving_time                              planned only when a real routeScope exists
 *   climate_normals, lodging_strategy         phantom `reputable_web` fallback removed
 *                                             (an authority class, never a provider id)
 *
 * Offline: only `supports()` and `buildRequest()` are called, both pure.
 */

const { TOPIC_POLICY, planEvidenceRequirements } = require('../../../../../src/services/evidencePlannerService');
const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const { createNpsEvidenceProvider } = require('../../../../../src/services/providers/npsEvidenceProvider');
const { createRidbEvidenceProvider } = require('../../../../../src/services/providers/ridbEvidenceProvider');
const { createWeatherEvidenceProvider } = require('../../../../../src/services/providers/weatherEvidenceProvider');
const { createMapsEvidenceProvider } = require('../../../../../src/services/providers/mapsEvidenceProvider');
const { createAstronomyEvidenceProvider } = require('../../../../../src/services/providers/astronomyEvidenceProvider');
const { createFeeFreeDatesEvidenceProvider } = require('../../../../../src/services/providers/feeFreeDatesEvidenceProvider');
const { createBraveEvidenceProvider } = require('../../../../../src/services/providers/braveEvidenceProvider');
const { createSerperEvidenceProvider } = require('../../../../../src/services/providers/serperEvidenceProvider');
const { createTavilyEvidenceProvider } = require('../../../../../src/services/providers/tavilyEvidenceProvider');
const { createDirectOfficialPageEvidenceProvider } = require('../../../../../src/services/providers/directOfficialPageEvidenceProvider');
const { createKnownPlaceEvidenceProvider } = require('../../../../../src/services/providers/knownPlaceEvidenceProvider');

const NOW = new Date('2026-08-26T12:00:00.000Z');

const providers = new Map([
  createNpsEvidenceProvider({}),
  createRidbEvidenceProvider({}),
  createWeatherEvidenceProvider({}),
  createMapsEvidenceProvider({}),
  createAstronomyEvidenceProvider({}),
  createFeeFreeDatesEvidenceProvider({}),
  createBraveEvidenceProvider({}),
  createSerperEvidenceProvider({}),
  createTavilyEvidenceProvider({}),
  createDirectOfficialPageEvidenceProvider({}),
  createKnownPlaceEvidenceProvider({}),
].map((provider) => [provider.id, provider]));

const PARKS = {
  thro: { entityId: 'nps:park:thro', entityType: 'national_park', displayName: 'Theodore Roosevelt National Park', latitude: 46.979, longitude: -103.538, resolutionConfidence: 1 },
  yell: { entityId: 'nps:park:yell', entityType: 'national_park', displayName: 'Yellowstone National Park', latitude: 44.6, longitude: -110.5, resolutionConfidence: 1 },
  grte: { entityId: 'nps:park:grte', entityType: 'national_park', displayName: 'Grand Teton National Park', latitude: 43.79, longitude: -110.68, resolutionConfidence: 1 },
};

function servedBy(requirement) {
  return [...(requirement.preferredProviders || []), ...(requirement.allowedFallbackProviders || [])]
    .filter((id) => providers.get(id)?.supports?.(requirement) === true);
}

// ---------------------------------------------------------------------------
// The invariant, over the whole policy table
// ---------------------------------------------------------------------------

describe('every plannable topic declares a provider that can serve it', () => {
  function requirementFor(topic) {
    const policy = TOPIC_POLICY[topic];
    const base = {
      requirementId: `req-${topic}`,
      turnId: 'invariant',
      topic,
      entity: PARKS.thro,
      evidenceTypes: policy.evidenceTypes,
      temporalScope: {
        mode: 'current', requestedAt: NOW,
        validFrom: NOW.toISOString(), validThrough: NOW.toISOString(), timezone: 'UTC',
      },
      freshnessClass: policy.freshnessClass,
      maxAgeSeconds: policy.maxAgeSeconds,
      maxStaleSeconds: policy.maxStaleSeconds,
      criticality: 'required',
      absenceSemantics: 'unknown',
      minimumAuthorityClass: policy.authority,
      acceptedSourceClasses: [policy.authority],
      preferredProviders: policy.providers,
      allowedFallbackProviders: policy.fallbacks,
      privacyScope: 'public',
      reasonCodes: [],
    };
    // Scopes the topic legitimately requires; the planner supplies these too.
    if (topic === 'driving_time') {
      base.routeScope = {
        origin: PARKS.yell, destination: PARKS.thro,
        travelMode: 'driving', departureTimeBucket: NOW.toISOString(),
      };
    }
    return base;
  }

  const plannable = Object.keys(TOPIC_POLICY).filter(
    (topic) => !TOPIC_POLICY[topic].unsupported && (TOPIC_POLICY[topic].providers || []).length > 0
  );

  test.each(plannable)('%s is serviceable by a provider it names', (topic) => {
    expect({ topic, servedBy: servedBy(requirementFor(topic)) })
      .toEqual({ topic, servedBy: expect.arrayContaining([expect.any(String)]) });
  });

  test('there are no unserviceable plannable topics left', () => {
    const unserviceable = plannable.filter((topic) => servedBy(requirementFor(topic)).length === 0);
    expect(unserviceable).toEqual([]);
  });

  test('every declared provider id is a real provider', () => {
    // `reputable_web` is an AUTHORITY CLASS, not a provider, and appeared in two
    // fallback lists where it could never resolve.
    const unknown = [];
    for (const [topic, policy] of Object.entries(TOPIC_POLICY)) {
      for (const id of [...(policy.providers || []), ...(policy.fallbacks || [])]) {
        if (!providers.has(id)) unknown.push(`${topic}:${id}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  test('a topic with no provider is declared empty, not falsely attributed', () => {
    // flight_strategy: nothing implements airport discovery. Declaring
    // `google_maps` made every airport turn report partial coverage forever.
    expect(TOPIC_POLICY.flight_strategy.providers).toEqual([]);
    expect(TOPIC_POLICY.flight_strategy.fallbacks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The invariant, over what the planner actually emits for real prompts
// ---------------------------------------------------------------------------

describe('no real turn plans a requirement nothing can serve', () => {
  const PROMPTS = [
    ['single-park itinerary', 'Plan three easygoing days in Theodore Roosevelt National Park. We care most about wildlife, scenery, photography, and relaxed drives with some easy walking.', [PARKS.thro]],
    ['multi-park trip', 'Plan a realistic 7-day Yellowstone and Grand Teton trip for two adults', [PARKS.yell, PARKS.grte]],
    ['deep research', 'Do deep research on a winter trip to Yellowstone National Park.', [PARKS.yell]],
    ['trail open now', 'Is the Wind Canyon Trail open right now?', [PARKS.thro]],
    ['wildfire smoke', 'Is there wildfire smoke near Theodore Roosevelt right now?', [PARKS.thro]],
    ['road status', 'Is the scenic loop road open today?', [PARKS.thro]],
    ['shuttle question', 'How does the Yellowstone shuttle work?', [PARKS.yell]],
    ['airport question', 'Which airport is best for Yellowstone?', [PARKS.yell]],
    ['lodging question', 'Where should I stay near Yellowstone?', [PARKS.yell]],
    ['food question', 'Where can we eat near the Yellowstone north entrance?', [PARKS.yell]],
    ['fees question', 'What does it cost to enter Theodore Roosevelt?', [PARKS.thro]],
    ['general question', 'Is Yellowstone worth visiting in October?', [PARKS.yell]],
  ];

  test.each(PROMPTS)('%s', (_label, prompt, entities) => {
    const requirements = planEvidenceRequirements({
      turnId: 'turn:invariant',
      userPrompt: prompt,
      intent: classifyTrailieIntent({ userPrompt: prompt }),
      resolvedEntities: entities,
      now: NOW,
    });
    const unserviceable = requirements
      .filter((requirement) => servedBy(requirement).length === 0)
      .map((requirement) => requirement.topic);
    expect({ prompt, unserviceable }).toEqual({ prompt, unserviceable: [] });
  });

  test('a hard requirement is never planned without a provider that can serve it', () => {
    for (const [, prompt, entities] of PROMPTS) {
      const requirements = planEvidenceRequirements({
        turnId: 'turn:hard',
        userPrompt: prompt,
        intent: classifyTrailieIntent({ userPrompt: prompt }),
        resolvedEntities: entities,
        now: NOW,
      });
      for (const requirement of requirements.filter((r) => r.criticality === 'hard')) {
        expect({ prompt, topic: requirement.topic, served: servedBy(requirement).length > 0 })
          .toEqual({ prompt, topic: requirement.topic, served: true });
      }
    }
  });
});
