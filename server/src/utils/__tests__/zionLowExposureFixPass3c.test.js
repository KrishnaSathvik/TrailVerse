'use strict';

/**
 * Fix Pass #3C — Zion empty-day / low-exposure offline fixtures.
 * No provider network. No model calls.
 */

const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const {
  resolveOperationalConstraints,
  applyOperationalConstraints,
} = require('../trailieOperationalConstraints');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');

const NOW = new Date('2026-08-11T12:00:00.000Z');
// One-day prompt so completeness asserts exposure/experience behavior, not day-count.
const PROMPT = 'Plan a realistic Zion day for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.';

function namedActivity(id, title, shortDescription) {
  return { id, title, shortDescription };
}

function bundleFromActivities(activities) {
  const provider = createNpsEvidenceProvider({
    npsClient: {
      getParkActivities: jest.fn().mockResolvedValue(activities),
      getParkPlaces: jest.fn().mockResolvedValue([]),
    },
    now: () => NOW,
  });
  const requirement = {
    requirementId: 'req:activities',
    entity: { entityId: 'nps:park:zion', displayName: 'Zion National Park' },
    topic: 'activities',
    preferredProviders: ['nps'],
    reasonCodes: [
      'requested_named_hike_or_walk',
      'requested_viewpoint_or_scenic',
      'requested_low_exposure_candidates',
    ],
  };
  const request = provider.buildRequest(requirement);
  return provider.fetch(request, { signal: new AbortController().signal }).then((fetched) => {
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    const evidence = candidates.map((c, i) => ({
      ...c,
      evidenceId: `ev:${i}`,
      observation: { observedAt: fetched.metadata.observedAt },
      retention: { storeClaimText: true },
    }));
    return {
      requirement,
      evidence,
      byName: Object.fromEntries(
        evidence.map((e) => [e.claim.normalizedValue.name, e.claim.normalizedValue])
      ),
      bundle: {
        evidence,
        resolutions: [{
          requirementId: requirement.requirementId,
          status: 'satisfied_fresh',
          evidenceIds: evidence.map((e) => e.evidenceId),
        }],
      },
    };
  });
}

function runConstraints(itinerary) {
  const rules = resolveOperationalConstraints({
    destination: 'Zion National Park',
    userText: PROMPT,
    now: NOW,
    constraints: {
      avoidExposure: true,
      operationalEvidence: [{
        type: 'exposure_constraint',
        destination: 'Zion National Park',
        subjects: [],
        plannerRule: 'Do not use trails with moderate or high exposure.',
      }],
    },
  });
  return applyOperationalConstraints(JSON.parse(JSON.stringify(itinerary)), rules);
}

describe('Fix Pass #3C Zion low-exposure fixtures', () => {
  test('CASE 1: low-exposure walk eligible; moderate exposure rejected; day stays non-empty', async () => {
    const { byName } = await bundleFromActivities([
      namedActivity('parus', "Pa'rus Trail", 'Paved accessible easy walk with scenic views.'),
      namedActivity('watchman', 'Watchman Trail', 'Unpaved climb with drop-offs to a viewpoint.'),
    ]);
    expect(byName["Pa'rus Trail"].exposureLevel).toBe('low');
    expect(byName['Watchman Trail'].exposureLevel).toBe('moderate');

    const { itinerary, corrections, conflicts } = runConstraints({
      days: [{
        day: 1,
        stops: [
          { name: "Pa'rus Trail", type: 'trail', duration: 90, exposureLevel: 'low', difficulty: 'easy' },
          { name: 'Court of the Patriarchs viewpoint', type: 'landmark', duration: 30 },
          { name: 'Watchman Trail', type: 'trail', duration: 120, exposureLevel: 'moderate' },
        ],
      }],
    });
    expect(itinerary.days[0].stops.map((s) => s.name)).toEqual([
      "Pa'rus Trail",
      'Court of the Patriarchs viewpoint',
    ]);
    expect(corrections.join(' ')).toMatch(/Watchman Trail/);
    expect(conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ stop: 'Court of the Patriarchs viewpoint', reasonCode: 'constraint_eligibility_unknown' }),
    ]));
    expect(evaluateItineraryCompleteness({
      itineraryData: itinerary,
      userPrompt: PROMPT,
      constraints: { dates: { numDays: 1 } },
    }).reasonCodes).toContain('constraint_eligibility_unknown');
  });

  test('CASE 2: only moderate/high exposure → empty day after filter (safe fail, not acceptance)', () => {
    const { itinerary } = runConstraints({
      days: [{
        day: 1,
        stops: [
          { name: 'Watchman Trail', type: 'trail', duration: 120, exposureLevel: 'moderate' },
          { name: 'Canyon Overlook', type: 'trail', duration: 60, exposureLevel: 'high' },
        ],
      }],
    });
    expect(itinerary.days[0].stops).toEqual([]);
    expect(evaluateItineraryCompleteness({
      itineraryData: itinerary,
      userPrompt: PROMPT,
      constraints: { dates: { numDays: 1 } },
    }).reasonCodes).toContain('empty_day');
  });

  test('CASE 3: unknown exposure + official paved/accessible text → derived low', async () => {
    const { byName } = await bundleFromActivities([
      namedActivity('riverside', 'Riverside Walk', 'Relatively flat and paved trail beside the river; sheer canyon walls nearby.'),
    ]);
    expect(byName['Riverside Walk'].exposureLevel).toBe('low');
    expect(byName['Riverside Walk'].difficulty).toBe('easy');
  });

  test('CASE 4: insufficient evidence stays unknown (not silently low)', async () => {
    const { byName } = await bundleFromActivities([
      namedActivity('forest', 'Forest Path', 'A pine corridor through the canyon floor.'),
    ]);
    expect(byName['Forest Path'].exposureLevel).toBeNull();
  });

  test('CASE 5: unknown-exposure viewpoint is flagged, not silently deleted', () => {
    const { itinerary, conflicts } = runConstraints({
      days: [{
        day: 1,
        stops: [
          { name: "Pa'rus Trail", type: 'trail', duration: 90, exposureLevel: 'low', difficulty: 'easy' },
          { name: 'Court of the Patriarchs viewpoint', type: 'landmark', duration: 30 },
        ],
      }],
    });
    expect(itinerary.days[0].stops.map((s) => s.name)).toEqual([
      "Pa'rus Trail",
      'Court of the Patriarchs viewpoint',
    ]);
    expect(conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ stop: 'Court of the Patriarchs viewpoint', reasonCode: 'constraint_eligibility_unknown' }),
    ]));
    expect(evaluateItineraryCompleteness({
      itineraryData: itinerary,
      userPrompt: PROMPT,
      constraints: { dates: { numDays: 1 } },
    })).toEqual(expect.objectContaining({
      ok: false,
      reasonCodes: expect.arrayContaining(['constraint_eligibility_unknown']),
    }));
  });

  test('CASE 6: incompatible + compatible → incompatible removed, day not empty', () => {
    const { itinerary, corrections } = runConstraints({
      days: [{
        day: 1,
        stops: [
          { name: 'Watchman Trail', type: 'trail', duration: 120, exposureLevel: 'moderate' },
          { name: "Pa'rus Trail", type: 'trail', duration: 90, exposureLevel: 'low', difficulty: 'easy' },
          { name: 'Court of the Patriarchs viewpoint', type: 'landmark', duration: 30 },
        ],
      }],
    });
    expect(itinerary.days[0].stops.map((s) => s.name)).toEqual([
      "Pa'rus Trail",
      'Court of the Patriarchs viewpoint',
    ]);
    expect(corrections.join(' ')).toMatch(/Watchman/);
    expect(evaluateItineraryCompleteness({
      itineraryData: itinerary,
      userPrompt: PROMPT,
      constraints: { dates: { numDays: 1 } },
    }).reasonCodes).toContain('constraint_eligibility_unknown');
  });

  test('prompt ranking prefers low-exposure named walks when requested', async () => {
    const { bundle, requirement, evidence } = await bundleFromActivities([
      namedActivity('kolob', 'La Verkin Creek Trail to Kolob Arch', 'Primitive wilderness solitude hike.'),
      namedActivity('kayenta', 'Kayenta Trail', 'Moderate ascent with panoramic canyon views and drop-offs.'),
      namedActivity('parus', "Pa'rus Trail", 'Paved accessible easy walk with scenic views.'),
      namedActivity('riverside', 'Riverside Walk', 'Flat paved easy stroll along the river.'),
    ]);
    const rendered = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [requirement],
      maxTokens: 220,
    });
    expect(rendered.text).toMatch(/Pa'rus Trail/);
    expect(rendered.text).toMatch(/exposureLevel=low/);
    // Under a tight budget, low-exposure walks should outrank remote wilderness first.
    const parusIdx = rendered.text.indexOf("Pa'rus Trail");
    const kolobIdx = rendered.text.indexOf('La Verkin Creek');
    if (kolobIdx >= 0) expect(parusIdx).toBeLessThan(kolobIdx);
    expect(evidence.find((e) => e.claim.normalizedValue.name === "Pa'rus Trail")
      .claim.normalizedValue.exposureLevel).toBe('low');
  });
});
