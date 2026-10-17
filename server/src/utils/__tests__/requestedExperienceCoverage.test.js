'use strict';

/**
 * Phase 12H2-A — requested-experience dimensions, packing, and coverage.
 * Synthetic destinations only. No Yellowstone goldens, no exact prose.
 */

const {
  detectRequestedExperienceDimensions,
  classifyCandidateDimensions,
  evaluateRequestedExperienceCoverage,
  REASON_CODE,
} = require('../requestedExperienceCoverage');
const { evaluateItineraryCompleteness, buildCompletenessRepairInstructions } = require('../itineraryCompleteness');
const { createRepairLedger } = require('../repairLedger');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');

const ITINERARY_REQS = [
  {
    requirementId: 'req-act',
    topic: 'activities',
    reasonCodes: ['itinerary_activity_support', 'itinerary_facility_candidates'],
  },
  {
    requirementId: 'req-vs',
    topic: 'visitor_services',
    reasonCodes: ['itinerary_facility_candidates'],
  },
];

function evidence({
  id,
  name,
  types = [],
  topic = 'activities',
  text = null,
  category = 'thingstodo',
} = {}) {
  return {
    evidenceId: id,
    topic,
    claim: {
      text: text || `${name}: an official place.`,
      normalizedValue: { name, activityTypes: types, category },
      qualifiers: types.includes('visitor_center') ? ['named_place_candidate'] : ['named_activity_candidate'],
      polarity: 'positive',
    },
    source: {
      provider: 'nps',
      sourceClass: 'official_owner',
      title: name,
      url: `https://www.nps.gov/example/${id}`,
    },
    quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
    observation: { observedAt: '2026-09-20T12:00:00.000Z' },
    retention: { storeClaimText: true },
  };
}

function crowdedBundle(extras = []) {
  const visitorCenters = Array.from({ length: 8 }, (_, i) => evidence({
    id: `ev:vc-${i}`,
    name: `District ${i + 1} Visitor Center`,
    types: ['visitor_center', 'exhibits', 'orientation'],
    topic: 'visitor_services',
    category: 'visitor_center',
    text: `District ${i + 1} Visitor Center: exhibits about wildlife, geysers, and scenic views of the park.`,
  }));
  const experiential = [
    evidence({
      id: 'ev:wildlife-overlook',
      name: 'River Wildlife Overlook',
      types: ['wildlife'],
      text: 'River Wildlife Overlook: roadside wildlife viewing.',
    }),
    evidence({
      id: 'ev:loop-road',
      name: 'Rim Scenic Drive',
      types: ['scenic_drive'],
      text: 'Rim Scenic Drive: a 20-mile scenic road with pullouts.',
    }),
    evidence({
      id: 'ev:geyser-basin',
      name: 'Basin Geyser Walk',
      types: ['geothermal'],
      text: 'Basin Geyser Walk: boardwalk among hot springs and geysers.',
    }),
    evidence({
      id: 'ev:falls',
      name: 'Cedar Waterfall',
      types: ['waterfall', 'walk'],
      text: 'Cedar Waterfall: a named waterfall reached by an easy walk.',
    }),
    evidence({
      id: 'ev:beach',
      name: 'Harbor Beach',
      types: ['beach'],
      text: 'Harbor Beach: a coastal beach with an easy shoreline walk.',
    }),
    evidence({
      id: 'ev:overlook',
      name: 'Painted Rim Overlook',
      types: ['viewpoint'],
      text: 'Painted Rim Overlook: a canyon viewpoint.',
    }),
    evidence({
      id: 'ev:museum',
      name: 'Furnace Historic Museum',
      types: ['museum', 'historic'],
      text: 'Furnace Historic Museum: cultural exhibits in the old ironworks.',
    }),
    ...extras,
  ];
  const all = [...visitorCenters, ...experiential];
  return {
    resolutions: [
      { requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: experiential.map((item) => item.evidenceId) },
      { requirementId: 'req-vs', status: 'satisfied_fresh', evidenceIds: visitorCenters.map((item) => item.evidenceId) },
    ],
    evidence: all,
  };
}

function day(stops) {
  return {
    days: [{
      day: 1,
      stops: stops.map((stop, index) => ({
        duration: 90,
        order: index,
        ...stop,
      })),
    }],
  };
}

describe('detectRequestedExperienceDimensions', () => {
  test('normalizes close wording onto one dimension and does not invent extras', () => {
    expect(detectRequestedExperienceDimensions({
      userPrompt: 'We want geysers, wildlife viewing, and scenic drives without rushing.',
    })).toEqual(['wildlife', 'geothermal', 'scenic_drive']);

    expect(detectRequestedExperienceDimensions({
      userPrompt: 'hot springs and overlooks please',
    })).toEqual(['geothermal', 'viewpoint']);

    expect(detectRequestedExperienceDimensions({
      userPrompt: 'Plan a relaxed two-day trip',
    })).toEqual([]);
  });

  test('scenic-drives interest without drive language becomes a drive only when viewpoints were not the ask', () => {
    expect(detectRequestedExperienceDimensions({
      userPrompt: 'We care most about scenery and sunset views',
      constraints: { interests: ['scenic-drives'] },
    })).toEqual(['viewpoint']);

    expect(detectRequestedExperienceDimensions({
      userPrompt: 'Plan a trip',
      constraints: { interests: ['scenic-drives'] },
    })).toEqual(['scenic_drive']);

    expect(detectRequestedExperienceDimensions({
      userPrompt: 'then do one separate scenic experience later in the day',
    })).toEqual([]);
  });

  test('does not treat Vernal Fall as a waterfall category ask', () => {
    expect(detectRequestedExperienceDimensions({
      userPrompt: 'I want to hike the Mist Trail including Vernal Fall as a stop',
    })).toEqual(['hiking']);
  });
});

describe('candidate classification is not incidental prose', () => {
  test('visitor-center copy about wildlife is not a wildlife candidate', () => {
    const vc = evidence({
      id: 'ev:vc',
      name: 'Park Visitor Center',
      types: ['visitor_center', 'exhibits'],
      topic: 'visitor_services',
      category: 'visitor_center',
      text: 'Park Visitor Center: learn about wildlife, geysers, and scenic drives.',
    });
    expect(classifyCandidateDimensions(vc)).toEqual([]);
  });

  test('a geyser basin is geothermal, not a scenic drive', () => {
    const geyser = evidence({
      id: 'ev:g',
      name: 'Basin Geyser',
      types: ['geothermal'],
      text: 'Basin Geyser: a scenic thermal feature beside the road.',
    });
    expect(classifyCandidateDimensions(geyser)).toEqual(['geothermal']);
    expect(classifyCandidateDimensions(geyser)).not.toContain('scenic_drive');
    expect(classifyCandidateDimensions(geyser)).not.toContain('viewpoint');
  });

  test('a loop road is a scenic drive, not merely a scenic landmark', () => {
    const drive = evidence({
      id: 'ev:d',
      name: 'Rim Scenic Drive',
      types: ['scenic_drive'],
    });
    expect(classifyCandidateDimensions(drive)).toEqual(['scenic_drive']);
  });

  test('safety programs and trailheads are not experience substitutes', () => {
    expect(classifyCandidateDimensions(evidence({
      id: 'ev:bear-aware',
      name: 'Bear Aware',
      types: ['safety'],
      text: 'Bear Aware: stay safe around wildlife and scenic roads.',
    }))).toEqual([]);
    expect(classifyCandidateDimensions(evidence({
      id: 'ev:loop-th',
      name: 'Loop Road Trailhead',
      types: ['trailhead'],
      text: 'Loop Road Trailhead: parking for the scenic drive and geyser basin.',
    }))).not.toEqual(expect.arrayContaining(['scenic_drive', 'geothermal', 'wildlife']));
    expect(classifyCandidateDimensions(evidence({
      id: 'ev:geyser-th',
      name: 'Basin Geyser Trailhead',
      types: ['hike', 'trailhead'],
      text: 'Basin Geyser Trailhead: access to the boardwalk.',
    }))).toEqual(['hiking']);
  });
});

describe('requested-experience packing guarantee', () => {
  const prompt = 'Wildlife, scenic drives, and geysers — keep the pace relaxed.';

  test('requested experiential candidates survive a visitor-center-crowded window', () => {
    const packed = renderEvidenceBundleForPrompt({
      bundle: crowdedBundle(),
      requirements: ITINERARY_REQS,
      userRequest: prompt,
      maxTokens: 900,
    });
    expect(packed.requestedExperienceDimensions).toEqual(
      expect.arrayContaining(['wildlife', 'geothermal', 'scenic_drive'])
    );
    expect(packed.includedEvidenceIds).toEqual(expect.arrayContaining([
      'ev:wildlife-overlook',
      'ev:loop-road',
      'ev:geyser-basin',
    ]));
    expect(packed.packedExperienceDiagnostics.visitorServiceShare).toBeLessThan(1);
    expect(packed.packedExperienceDiagnostics.packedByDimension.wildlife.length).toBeGreaterThan(0);
    expect(packed.packedExperienceDiagnostics.packedByDimension.scenic_drive.length).toBeGreaterThan(0);
    expect(packed.packedExperienceDiagnostics.packedByDimension.geothermal.length).toBeGreaterThan(0);
  });

  test('optional visitor services do not crowd out every requested candidate', () => {
    const packed = renderEvidenceBundleForPrompt({
      bundle: crowdedBundle(),
      requirements: ITINERARY_REQS,
      userRequest: prompt,
      maxTokens: 700,
    });
    const visitorIncluded = packed.includedEvidenceIds.filter((id) => id.startsWith('ev:vc-'));
    const requestedIncluded = ['ev:wildlife-overlook', 'ev:loop-road', 'ev:geyser-basin']
      .filter((id) => packed.includedEvidenceIds.includes(id));
    expect(requestedIncluded.length).toBe(3);
    expect(visitorIncluded.length).toBeLessThan(packed.includedEvidenceIds.length);
  });
});

describe('coverage validator', () => {
  const prompt = 'Wildlife and scenic drives, plus geysers if they are in the park.';
  const bundle = crowdedBundle();

  test('incidental visitor-center prose does not satisfy wildlife', () => {
    const result = evaluateItineraryCompleteness({
      itineraryData: day([
        { name: 'District 1 Visitor Center', type: 'visitor_center', why: 'Exhibits about wildlife and geysers.' },
        { name: 'Painted Rim Overlook', type: 'viewpoint' },
      ]),
      userPrompt: prompt,
      evidenceBundle: bundle,
      constraints: { pace: 'relaxed', durationDays: 1 },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      REASON_CODE.COVERAGE,
      REASON_CODE.WILDLIFE,
      REASON_CODE.SCENIC_DRIVE,
      REASON_CODE.GEOTHERMAL,
    ]));
  });

  test('a landmark is not a scenic drive', () => {
    const result = evaluateRequestedExperienceCoverage({
      itineraryData: day([
        { name: 'Basin Geyser Walk', type: 'geothermal' },
        { name: 'River Wildlife Overlook', type: 'wildlife' },
        { name: 'Painted Rim Overlook', type: 'viewpoint' },
      ]),
      userPrompt: prompt,
      evidenceBundle: bundle,
    });
    expect(result.missing).toEqual(['scenic_drive']);
    expect(result.represented).toEqual(expect.arrayContaining(['wildlife', 'geothermal']));
  });

  test('one genuine stop may satisfy two requested dimensions', () => {
    const result = evaluateRequestedExperienceCoverage({
      itineraryData: day([
        { name: 'Wildlife Loop Road', type: 'scenic_drive' },
      ]),
      userPrompt: 'wildlife and scenic drives',
    });
    expect(result.ok).toBe(true);
    expect(result.represented).toEqual(expect.arrayContaining(['wildlife', 'scenic_drive']));
  });

  test('relaxed pace still requires requested categories', () => {
    const thin = evaluateItineraryCompleteness({
      itineraryData: day([
        { name: 'District 1 Visitor Center', type: 'visitor_center', duration: 120 },
      ]),
      userPrompt: 'Plan a relaxed 2-day trip for wildlife and scenic drives',
      constraints: { pace: 'relaxed', durationDays: 1 },
      evidenceBundle: bundle,
    });
    expect(thin.reasonCodes).toEqual(expect.arrayContaining([
      REASON_CODE.WILDLIFE,
      REASON_CODE.SCENIC_DRIVE,
    ]));

    const covered = evaluateItineraryCompleteness({
      itineraryData: day([
        { name: 'River Wildlife Overlook', type: 'wildlife', duration: 90 },
        { name: 'Rim Scenic Drive', type: 'scenic_drive', duration: 120 },
      ]),
      userPrompt: 'Plan a relaxed 2-day trip for wildlife and scenic drives',
      constraints: { pace: 'relaxed', durationDays: 1 },
      evidenceBundle: bundle,
    });
    expect(covered.reasonCodes).not.toEqual(expect.arrayContaining([
      REASON_CODE.WILDLIFE,
      REASON_CODE.SCENIC_DRIVE,
    ]));
  });

  test('missing authoritative candidates are truthful limitations, not fabricated coverage', () => {
    const empty = {
      resolutions: [
        { requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:vc-0'] },
      ],
      evidence: [evidence({
        id: 'ev:vc-0',
        name: 'Only Visitor Center',
        types: ['visitor_center'],
        topic: 'visitor_services',
        category: 'visitor_center',
        text: 'Only Visitor Center: exhibits about wildlife.',
      })],
    };
    const result = evaluateRequestedExperienceCoverage({
      itineraryData: day([{ name: 'Only Visitor Center', type: 'visitor_center', duration: 90 }]),
      userPrompt: 'We want wildlife viewing',
      evidenceBundle: empty,
    });
    expect(result.unavailable).toEqual(['wildlife']);
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('repair instructions keep requested categories under a relaxed pace', () => {
    const text = buildCompletenessRepairInstructions({
      reasonCodes: [REASON_CODE.COVERAGE, REASON_CODE.WILDLIFE, REASON_CODE.SCENIC_DRIVE],
    });
    expect(text).toMatch(/Relaxed pacing/i);
    expect(text).toMatch(/scenic drive/i);
    expect(text).toMatch(/wildlife/i);
  });

  test('retry path gets a class-level completeness reason code', () => {
    const ledger = createRepairLedger({
      userPrompt: 'geysers, wildlife, and scenic drives without rushing',
      constraints: { pace: 'relaxed', durationDays: 2 },
    });
    expect(ledger.obligationIds()).toEqual(expect.arrayContaining([
      'requested_experience_coverage',
      'requested_wildlife',
      'requested_geothermal',
      'requested_scenic_drive',
    ]));
    const recorded = ledger.recordAttempt({
      attempt: 1,
      reasonCodes: [REASON_CODE.COVERAGE, REASON_CODE.WILDLIFE, REASON_CODE.SCENIC_DRIVE],
      evaluatedObligations: ledger.obligationIds(),
    });
    expect(recorded.failed).toEqual(expect.arrayContaining([
      'requested_experience_coverage',
      'requested_wildlife',
      'requested_scenic_drive',
    ]));
  });
});

describe('development combinations (synthetic parks)', () => {
  test.each([
    ['wildlife + scenic drive', 'wildlife viewing and a scenic drive', ['wildlife', 'scenic_drive'], [
      { name: 'River Wildlife Overlook', type: 'wildlife' },
      { name: 'Rim Scenic Drive', type: 'scenic_drive' },
    ]],
    ['geothermal + viewpoints', 'hot springs and overlooks', ['geothermal', 'viewpoint'], [
      { name: 'Basin Geyser Walk', type: 'geothermal' },
      { name: 'Painted Rim Overlook', type: 'viewpoint' },
    ]],
    ['photography + waterfalls', 'waterfall photography at sunrise', ['photography', 'waterfall'], [
      { name: 'Cedar Waterfall', type: 'waterfall', timeWindow: 'sunrise' },
    ]],
    ['beaches + easy walks', 'beaches and easy walks', ['beach', 'hiking'], [
      { name: 'Harbor Beach', type: 'beach' },
      { name: 'Shoreline Boardwalk', type: 'walk' },
    ]],
    ['cultural/history + scenery', 'history and scenery', ['historic', 'viewpoint'], [
      { name: 'Furnace Historic Museum', type: 'historic' },
      { name: 'Painted Rim Overlook', type: 'viewpoint' },
    ]],
  ])('%s is represented without visitor-center false hits', (_label, prompt, dims, stops) => {
    expect(detectRequestedExperienceDimensions({ userPrompt: `Plan a day with ${prompt}` }))
      .toEqual(expect.arrayContaining(dims));
    const coverage = evaluateRequestedExperienceCoverage({
      itineraryData: day(stops),
      userPrompt: `Plan a day with ${prompt}`,
      evidenceBundle: crowdedBundle(),
    });
    expect(coverage.missing).toEqual([]);
    expect(coverage.represented).toEqual(expect.arrayContaining(dims));
  });
});
