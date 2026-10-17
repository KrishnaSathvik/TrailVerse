'use strict';

/**
 * Phase 12H2-A — fresh independent evaluation.
 * Destinations and combinations are not the development fixtures.
 */

const {
  detectRequestedExperienceDimensions,
  evaluateRequestedExperienceCoverage,
  REASON_CODE,
} = require('../requestedExperienceCoverage');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');

const REQS = [
  { requirementId: 'act', topic: 'activities', reasonCodes: ['itinerary_activity_support', 'itinerary_facility_candidates'] },
  { requirementId: 'vs', topic: 'visitor_services', reasonCodes: ['itinerary_facility_candidates'] },
];

function row({ id, name, types, topic = 'activities', text }) {
  return {
    evidenceId: id,
    topic,
    claim: {
      text: text || `${name}.`,
      normalizedValue: { name, activityTypes: types, category: topic === 'visitor_services' ? 'visitor_center' : 'place' },
      qualifiers: ['named_activity_candidate'],
      polarity: 'positive',
    },
    source: { provider: 'nps', sourceClass: 'official_owner', title: name },
    quality: { authorityClass: 'official_owner' },
    observation: { observedAt: '2026-09-20T15:00:00.000Z' },
    retention: { storeClaimText: true },
  };
}

function bundleFor(experiential, visitorCount = 7) {
  const visitors = Array.from({ length: visitorCount }, (_, i) => row({
    id: `ind-vc-${i}`,
    name: `${['North', 'South', 'East', 'West', 'Ridge', 'Harbor', 'Gate'][i] || 'Field'} Contact Station`,
    types: ['visitor_center'],
    topic: 'visitor_services',
    text: `${['North', 'South', 'East', 'West', 'Ridge', 'Harbor', 'Gate'][i] || 'Field'} Contact Station: films about wildlife, waterfalls, and scenic views.`,
  }));
  return {
    resolutions: [
      { requirementId: 'act', status: 'satisfied_fresh', evidenceIds: experiential.map((item) => item.evidenceId) },
      { requirementId: 'vs', status: 'satisfied_fresh', evidenceIds: visitors.map((item) => item.evidenceId) },
    ],
    evidence: [...visitors, ...experiential],
  };
}

function plan(stops) {
  return { days: [{ day: 1, stops: stops.map((stop, i) => ({ duration: 80, order: i, ...stop })) }] };
}

describe('12H2-A independent evaluation (held-out destinations)', () => {
  test('Cape Mallow National Seashore — beaches + easy walks survive packing and coverage', () => {
    const prompt = 'A slow day at Cape Mallow for beaches and easy walks.';
    const experiential = [
      row({ id: 'mallow-beach', name: 'Mallow Cove Beach', types: ['beach'] }),
      row({ id: 'mallow-walk', name: 'Dune Boardwalk', types: ['walk'] }),
      row({ id: 'mallow-light', name: 'Harbor Light Overlook', types: ['viewpoint'] }),
    ];
    const bundle = bundleFor(experiential);
    const packed = renderEvidenceBundleForPrompt({
      bundle, requirements: REQS, userRequest: prompt, maxTokens: 800,
    });
    expect(detectRequestedExperienceDimensions({ userPrompt: prompt }))
      .toEqual(expect.arrayContaining(['beach', 'hiking']));
    expect(packed.includedEvidenceIds).toEqual(expect.arrayContaining(['mallow-beach', 'mallow-walk']));
    expect(packed.packedExperienceDiagnostics.visitorServiceShare).toBeLessThan(0.85);

    const accepted = evaluateItineraryCompleteness({
      itineraryData: plan([
        { name: 'Mallow Cove Beach', type: 'beach' },
        { name: 'Dune Boardwalk', type: 'walk' },
      ]),
      userPrompt: prompt,
      evidenceBundle: bundle,
      constraints: { pace: 'relaxed' },
    });
    expect(accepted.reasonCodes).not.toEqual(expect.arrayContaining([
      REASON_CODE.BEACH,
      REASON_CODE.HIKING,
    ]));
  });

  test('Split River National Monument — photography + waterfalls; incidental VC prose fails', () => {
    const prompt = 'Split River for waterfall photography this weekend.';
    const experiential = [
      row({ id: 'split-falls', name: 'Ribbon Waterfall', types: ['waterfall'] }),
      row({ id: 'split-photo', name: 'Dawn Photography Pullout', types: ['photography', 'viewpoint'] }),
    ];
    const bundle = bundleFor(experiential);
    const packed = renderEvidenceBundleForPrompt({
      bundle, requirements: REQS, userRequest: prompt, maxTokens: 800,
    });
    expect(packed.includedEvidenceIds).toEqual(expect.arrayContaining(['split-falls']));

    const falseHit = evaluateRequestedExperienceCoverage({
      itineraryData: plan([
        { name: 'North Contact Station', type: 'visitor_center', why: 'Exhibits mention waterfalls and photography.' },
      ]),
      userPrompt: prompt,
      evidenceBundle: bundle,
    });
    expect(falseHit.missing).toEqual(expect.arrayContaining(['photography', 'waterfall']));

    const genuine = evaluateRequestedExperienceCoverage({
      itineraryData: plan([
        { name: 'Ribbon Waterfall', type: 'waterfall', timeWindow: 'sunrise' },
      ]),
      userPrompt: prompt,
      evidenceBundle: bundle,
    });
    expect(genuine.ok).toBe(true);
  });

  test('Iron Furnace Historical Park — culture + scenery, visitor centers remain available but not exclusive', () => {
    const prompt = 'Iron Furnace for history and scenery, unhurried.';
    const experiential = [
      row({ id: 'iron-museum', name: 'Stackhouse Historic Museum', types: ['historic', 'museum'] }),
      row({ id: 'iron-view', name: 'Slag Terrace Overlook', types: ['viewpoint'] }),
    ];
    const bundle = bundleFor(experiential, 8);
    const packed = renderEvidenceBundleForPrompt({
      bundle, requirements: REQS, userRequest: prompt, maxTokens: 750,
    });
    expect(packed.includedEvidenceIds).toEqual(expect.arrayContaining(['iron-museum', 'iron-view']));
    const vcShare = packed.packedExperienceDiagnostics.visitorServiceShare;
    expect(vcShare).toBeGreaterThan(0);
    expect(vcShare).toBeLessThan(1);
  });

  test('Red Mesa National Monument — geothermal + viewpoints; no candidate means no hallucination', () => {
    const prompt = 'Red Mesa for hot springs and overlooks.';
    const experiential = [
      row({ id: 'mesa-view', name: 'Cinnabar Overlook', types: ['viewpoint'] }),
    ];
    const bundle = bundleFor(experiential, 6);
    const packed = renderEvidenceBundleForPrompt({
      bundle, requirements: REQS, userRequest: prompt, maxTokens: 700,
    });
    expect(packed.requestedExperienceDimensions).toEqual(expect.arrayContaining(['geothermal', 'viewpoint']));
    expect(packed.packedExperienceDiagnostics.packedByDimension.geothermal || []).toHaveLength(0);
    expect(packed.includedEvidenceIds).toContain('mesa-view');

    const coverage = evaluateRequestedExperienceCoverage({
      itineraryData: plan([{ name: 'Cinnabar Overlook', type: 'viewpoint' }]),
      userPrompt: prompt,
      evidenceBundle: bundle,
    });
    expect(coverage.unavailable).toEqual(['geothermal']);
    expect(coverage.represented).toContain('viewpoint');
    expect(coverage.missing).toEqual([]);
    expect(coverage.ok).toBe(true);
  });
});
