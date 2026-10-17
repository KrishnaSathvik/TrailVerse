const {
  selectFactsForSection,
  projectFactForReviewer,
  buildSectionReviewPayload,
  parseReviewerIssues,
  splitOversizedWindow,
  mapWithConcurrency,
  measureParkIdentityCoverage,
  runTrailieReviewPipeline,
  REVIEWER_SYSTEM_PROMPT,
} = require('../trailieReviewPipeline');
const { enrichItineraryParkIdentity } = require('../../utils/itineraryParkIdentity');
const { makeFact, buildFactBundle, AUTHORITY, STATUS } = require('../../utils/canonicalFacts');
const { splitIntoSections, buildReviewWindows } = require('../../utils/responseSections');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

const olymClosure = makeFact({
  source: 'nps',
  category: 'closure',
  sourceId: 'o1',
  text: 'Hoh Road closed above the ranger station',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.ACTIVE_CLOSURE,
  retrievedAt: RETRIEVED_AT,
});

const glacClosure = makeFact({
  source: 'nps',
  category: 'closure',
  sourceId: 'g1',
  text: 'Going-to-the-Sun Road closed',
  parkCode: 'glac',
  parkName: 'Glacier National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.ACTIVE_CLOSURE,
  retrievedAt: RETRIEVED_AT,
});

const BUNDLE = buildFactBundle([[olymClosure, glacClosure]]);

const DOC = [
  'Your Olympic National Park plan.',
  '',
  '## Day 1 — Hoh Rain Forest',
  'The Hoh Road is open right now.',
  '',
  '## Day 2 — Ruby Beach',
  'Tide pools at low tide.',
  '',
].join('\n');

/** Anthropic stub returning a canned per-section reviewer payload. */
function stubAnthropic(handler) {
  return {
    messages: {
      create: jest.fn(async (params) => {
        const payload = JSON.parse(params.messages[0].content);
        const text = await handler(payload);
        return { content: [{ type: 'text', text }] };
      }),
    },
  };
}

const NO_ISSUES = () => JSON.stringify({ issues: [] });

describe('the old repair path is gone', () => {
  test('the reviewer prompt forbids rewriting the response', () => {
    expect(REVIEWER_SYSTEM_PROMPT).toMatch(/do NOT rewrite/i);
    expect(REVIEWER_SYSTEM_PROMPT).not.toMatch(/repaired user-facing text/i);
    expect(REVIEWER_SYSTEM_PROMPT).not.toMatch(/itineraryData/);
  });

  test('the reviewer is never asked for whole-response content', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    for (const call of anthropic.messages.create.mock.calls) {
      const payload = JSON.parse(call[0].messages[0].content);
      expect(payload).not.toHaveProperty('originalResponse');
      expect(payload).not.toHaveProperty('itineraryJson');
      expect(payload.reviewText.length).toBeLessThan(DOC.length + 1);
      expect(call[0].system).toBe(REVIEWER_SYSTEM_PROMPT);
    }
  });
});

describe('fact selection per section', () => {
  test('only in-scope park facts reach a section', () => {
    const sections = splitIntoSections(DOC);
    const day1 = sections.find((s) => s.label.includes('Day 1'));

    const facts = selectFactsForSection({
      section: day1,
      scope: { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' },
      bundle: BUNDLE,
      itineraryEvidence: { facts: [] },
    });

    expect(facts.map((f) => f.id)).toContain(olymClosure.id);
    expect(facts.map((f) => f.id)).not.toContain(glacClosure.id);
  });

  test('the projection hides internal bookkeeping from the model', () => {
    const projected = projectFactForReviewer(olymClosure);
    expect(Object.keys(projected).sort()).toEqual(
      ['authority', 'category', 'id', 'localDate', 'parkCode', 'parkName', 'source', 'status', 'text', 'url', 'validFrom', 'validTo'].sort()
    );
    expect(projected).not.toHaveProperty('terms');
    expect(projected).not.toHaveProperty('cacheStatus');
  });

  test('the payload carries scope, ownership guidance and facts', () => {
    const sections = splitIntoSections(DOC);
    const windows = buildReviewWindows(DOC, sections);
    const payload = JSON.parse(
      buildSectionReviewPayload({
        window: windows[1],
        scope: { sectionParkCodes: ['olym'], scopeSource: 'resolved_metadata' },
        facts: [olymClosure],
        itineraryExcerpt: null,
        constraints: null,
      })
    );

    expect(payload.sectionId).toBe(windows[1].sectionId);
    expect(payload.ownedRangeDescription).toMatch(/only quote text inside this section/i);
    expect(payload.facts[0].id).toBe(olymClosure.id);
  });
});

describe('section coverage and failure isolation', () => {
  test('every canonical section gets a review call', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(reviewMeta.sectionsTotal).toBe(3);
    expect(reviewMeta.sectionsReviewed).toBe(3);
    expect(reviewMeta.reviewCoverageRatio).toBe(1);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(3);
  });

  test('one failing section does not erase the others', async () => {
    const anthropic = stubAnthropic((payload) => {
      if (payload.sectionLabel.includes('Day 1')) throw new Error('provider exploded');
      return NO_ISSUES();
    });

    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(reviewMeta.sectionsReviewed).toBe(2);
    expect(reviewMeta.sectionsFailed).toBe(1);
    expect(reviewMeta.reviewStatus).toBe('partial');
    expect(reviewMeta.reviewerPassed).toBe(false);
  });

  test('malformed reviewer JSON affects only its own section', async () => {
    const anthropic = stubAnthropic((payload) =>
      payload.sectionLabel.includes('Day 2') ? 'sorry, no JSON here' : NO_ISSUES()
    );

    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(reviewMeta.sectionsFailed).toBe(1);
    expect(reviewMeta.sectionsReviewed).toBe(2);
  });

  test('a total provider failure is never reported as passed', async () => {
    const anthropic = stubAnthropic(() => {
      throw new Error('down');
    });

    const { content, reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(content).toBe(DOC);
    expect(reviewMeta.reviewStatus).toBe('error');
    expect(reviewMeta.reviewerPassed).toBe(false);
  });

  test('concurrency stays within the configured limit', async () => {
    let active = 0;
    let peak = 0;
    const anthropic = {
      messages: {
        create: jest.fn(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return { content: [{ type: 'text', text: NO_ISSUES() }] };
        }),
      },
    };

    const bigDoc = Array.from({ length: 12 }, (_, i) => `## Day ${i + 1} — Stop\nBody text.\n`).join('\n');
    await runTrailieReviewPipeline({
      anthropic,
      responseContent: bigDoc,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(anthropic.messages.create.mock.calls.length).toBeGreaterThan(4);
  });

  test('mapWithConcurrency isolates a rejection to its own slot', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return { status: 'ok', n };
    });

    expect(results[0].status).toBe('ok');
    expect(results[1].status).toBe('error');
    expect(results[2].status).toBe('ok');
  });
});

describe('oversized sections split without losing coverage', () => {
  test('owned subranges tile the original owned range exactly', () => {
    const window = {
      sectionId: '0:day-1',
      label: 'Day 1',
      ownedStartOffset: 0,
      ownedEndOffset: 10000,
      reviewStartOffset: 0,
      reviewEndOffset: 10000,
      reviewText: 'x',
    };

    const units = splitOversizedWindow(window, 3000);
    expect(units.length).toBeGreaterThan(1);
    expect(units[0].ownedStartOffset).toBe(0);
    expect(units[units.length - 1].ownedEndOffset).toBe(10000);

    for (let i = 0; i < units.length - 1; i += 1) {
      expect(units[i].ownedEndOffset).toBe(units[i + 1].ownedStartOffset);
    }
    expect(units.every((u) => u.parentSectionId === '0:day-1')).toBe(true);
  });

  test('a section within the limit is not split', () => {
    const window = { sectionId: '0:x', ownedStartOffset: 0, ownedEndOffset: 100 };
    expect(splitOversizedWindow(window, 6000)).toHaveLength(1);
  });
});

describe('shadow mode is structurally incapable of changing content', () => {
  test('content leaving the reviewer equals content entering it', async () => {
    const anthropic = stubAnthropic((payload) =>
      JSON.stringify({
        issues: payload.sectionLabel.includes('Day 1')
          ? [
              {
                type: 'closure_conflict',
                severity: 'high',
                exactQuote: 'The Hoh Road is open right now.',
                recommendedAction: 'replace',
                replacementText: 'The Hoh Road is closed.',
                evidenceFactIds: [olymClosure.id],
                rationale: 'contradicts live closure',
              },
            ]
          : [],
      })
    );

    const { content, reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      resolvedMetadata: { parkCode: 'olym' },
      mode: 'shadow',
    });

    expect(content).toBe(DOC); // byte-for-byte
    expect(reviewMeta.issuesDetected).toBeGreaterThan(0);
    expect(reviewMeta.patchesApplied).toBe(0);
    expect(reviewMeta.wouldApply).toBeGreaterThan(0);
  });

  test('Stage 6B: an approved hypothetical correction is verified against real evidence, still applying nothing', async () => {
    const anthropic = stubAnthropic((payload) =>
      JSON.stringify({
        issues: payload.sectionLabel.includes('Day 1')
          ? [
              {
                type: 'closure_conflict',
                severity: 'high',
                exactQuote: 'The Hoh Road is open right now.',
                recommendedAction: 'replace',
                replacementText: 'The Hoh Road is closed.',
                evidenceFactIds: [olymClosure.id],
                rationale: 'contradicts live closure',
              },
            ]
          : [],
      })
    );

    const { content, reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      resolvedMetadata: { parkCode: 'olym' },
      mode: 'shadow',
    });

    expect(content).toBe(DOC); // shadow: byte-for-byte
    expect(reviewMeta.wouldApply).toBeGreaterThan(0); // a hypothetical patch exists
    expect(reviewMeta.verificationRan).toBe(true);
    expect(reviewMeta.hypotheticalPatchesVerified).toBeGreaterThan(0);
    expect(reviewMeta.hypotheticalPatchesFailed).toBe(0);
    expect(reviewMeta.contentUnverified).toBe(false); // the correction checks out
    expect(reviewMeta.patchesApplied).toBe(0); // never mutates in shadow
  });

  test('enforce without the enforcement flag resolves to shadow', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const { content, reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'enforce',
      enforcementEnabled: false,
    });

    expect(reviewMeta.reviewerMode).toBe('shadow');
    expect(content).toBe(DOC);
  });

  test('an invalid mode resolves to shadow', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'ENFORCE_EVERYTHING',
      enforcementEnabled: true,
    });

    expect(reviewMeta.reviewerMode).toBe('shadow');
  });

  test('off mode makes no provider calls and returns the original', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const { content, reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'off',
    });

    expect(content).toBe(DOC);
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(reviewMeta.reviewerRan).toBe(false);
  });
});

describe('itinerary immutability', () => {
  test('the pipeline returns no itineraryData at all', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const itineraryData = {
      days: [{ id: 'day-1', stops: [{ id: 's1', name: 'Hall of Mosses' }] }],
    };
    const snapshot = JSON.stringify(itineraryData);

    const result = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      itineraryData,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(Object.keys(result).sort()).toEqual(['content', 'reviewMeta']);
    expect(result).not.toHaveProperty('itineraryData');
    expect(JSON.stringify(itineraryData)).toBe(snapshot); // unchanged by reference and value
  });

  test('reviewer criticality cannot override code criticality', async () => {
    const anthropic = stubAnthropic((payload) =>
      JSON.stringify({
        issues: payload.sectionLabel.includes('Day 1')
          ? [
              {
                type: 'closure_conflict',
                severity: 'low',
                critical: false,
                exactQuote: 'The Hoh Road is open right now.',
                recommendedAction: 'replace',
                replacementText: 'x',
                evidenceFactIds: [olymClosure.id],
              },
            ]
          : [],
      })
    );

    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      resolvedMetadata: { parkCode: 'olym' },
      mode: 'shadow',
    });

    expect(reviewMeta.reviewerSeverity).toBe('high');
    expect(reviewMeta.reviewerPassed).toBe(false);
  });

  test('unknown evidence ids fail policy rather than mutating', async () => {
    const anthropic = stubAnthropic((payload) =>
      JSON.stringify({
        issues: payload.sectionLabel.includes('Day 1')
          ? [
              {
                type: 'closure_conflict',
                severity: 'high',
                exactQuote: 'The Hoh Road is open right now.',
                recommendedAction: 'replace',
                replacementText: 'x',
                evidenceFactIds: ['nps:olym:closure:invented'],
              },
            ]
          : [],
      })
    );

    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      resolvedMetadata: { parkCode: 'olym' },
      mode: 'shadow',
    });

    expect(reviewMeta.policyApproved).toBe(0);
    expect(reviewMeta.wouldApply).toBe(0);
  });
});

describe('metadata', () => {
  test('legacy repaired stays false and audit data carries no response text', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      mode: 'shadow',
    });

    expect(reviewMeta.repaired).toBe(false);
    expect(reviewMeta.reviewStrategy).toBe('deterministic_patch_v1');

    const serialized = JSON.stringify(reviewMeta);
    expect(serialized).not.toContain('The Hoh Road is open right now.');
    expect(serialized).not.toContain('Tide pools at low tide.');
    expect(serialized).not.toContain(DOC);
  });

  test('factIdsBySection records what each section actually received', async () => {
    const anthropic = stubAnthropic(NO_ISSUES);
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic,
      responseContent: DOC,
      canonicalFactBundle: BUNDLE,
      resolvedMetadata: { parkCode: 'olym' },
      mode: 'shadow',
    });

    const allIds = Object.values(reviewMeta.factIdsBySection).flat();
    expect(allIds).toContain(olymClosure.id);
    expect(allIds).not.toContain(glacClosure.id);
  });
});

describe('itinerary park identity enrichment', () => {
  test('a single-park conversation attaches the resolved park to park stops', () => {
    const { itineraryData, coverage } = enrichItineraryParkIdentity({
      itineraryData: {
        days: [
          {
            id: 'day-1',
            label: 'Day 1',
            stops: [
              { id: 's1', name: 'Hall of Mosses', type: 'trail', evidenceEntityId: 'nps:park:olym:place:hall-of-mosses' },
              { id: 's2', name: 'Kalaloch Lodge', type: 'lodging' },
            ],
          },
        ],
      },
      resolvedMetadata: { parkCode: 'olym' },
    });

    expect(itineraryData.days[0].stops[0].parkCode).toBe('olym');
    expect(itineraryData.days[0].stops[1].parkCode).toBeNull(); // lodging is not a park stop
    expect(coverage).toEqual({ stopsTotal: 2, stopsWithParkCode: 1, stopsUnknownPark: 1 });
  });

  test('ambiguous multi-park stops stay null rather than guessing', () => {
    const { itineraryData, coverage } = enrichItineraryParkIdentity({
      itineraryData: {
        days: [{ id: 'day-1', label: 'Day 1', stops: [{ id: 's1', name: 'A scenic overlook', type: 'landmark' }] }],
      },
      allExtractedParks: [{ parkCode: 'olym' }, { parkCode: 'glac' }],
    });

    expect(itineraryData.days[0].stops[0].parkCode).toBeNull();
    expect(coverage.stopsUnknownPark).toBe(1);
  });

  test('a day label cannot assign park containment without evidence', () => {
    const { itineraryData } = enrichItineraryParkIdentity({
      itineraryData: {
        days: [
          { id: 'day-2', label: 'Day 2 — Glacier National Park', stops: [{ id: 's1', name: 'Logan Pass', type: 'landmark' }] },
        ],
      },
      allExtractedParks: [{ parkCode: 'olym' }, { parkCode: 'glac' }],
    });

    expect(itineraryData.days[0].stops[0].parkCode).toBeNull();
    expect(itineraryData.days[0].parkCodes).toEqual([]);
  });

  test('identity already attached upstream is never overwritten', () => {
    const { itineraryData } = enrichItineraryParkIdentity({
      itineraryData: {
        days: [{ id: 'day-1', label: 'Day 1', stops: [{ id: 's1', name: 'Somewhere', parkCode: 'glac', parkIdentityEvidenceId: 'ev-glacier' }] }],
      },
      resolvedMetadata: { parkCode: 'olym' },
    });

    expect(itineraryData.days[0].stops[0].parkCode).toBe('glac');
  });

  test('coverage measurement matches the enriched itinerary', () => {
    const { itineraryData } = enrichItineraryParkIdentity({
      itineraryData: {
        days: [{ id: 'day-1', label: 'Day 1', stops: [{ id: 's1', name: 'Hoh', type: 'trail', evidenceEntityId: 'nps:park:olym:place:hoh' }, { id: 's2', name: 'Diner', type: 'restaurant' }] }],
      },
      resolvedMetadata: { parkCode: 'olym' },
    });

    expect(measureParkIdentityCoverage(itineraryData)).toEqual({
      stopsTotal: 2,
      stopsWithParkCode: 1,
      stopsUnknownPark: 1,
    });
  });
});
