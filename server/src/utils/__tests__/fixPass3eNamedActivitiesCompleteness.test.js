'use strict';

/**
 * Fix Pass #3E — NPS named-activities completeness + direct fallback.
 * Offline only. No network. No model.
 */

const { NPSService } = require('../../services/npsService');
const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const { evaluateRequirementCoverage } = require('../../services/evidenceCoverageEvaluator');
const {
  NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
} = require('../evidenceContractVersions');

const NOW = new Date('2026-08-11T18:00:00.000Z');

const ZION_PARTIAL_BULK = {
  thingstodo: [
    {
      id: '6AD66A92-B0EB-4064-A52A-2DDB02CF9143',
      title: 'La Verkin Creek Trail to Kolob Arch',
      parkCode: 'zion',
      shortDescription: 'Wilderness solitude hike to Kolob Arch.',
    },
    {
      id: '9B081DDD-4C3E-47C0-901A-E92A159B0078',
      title: 'Kayenta Trail',
      parkCode: 'zion',
      shortDescription: 'The moderate, 2.0 mi Kayenta Trail. Long drop-offs are present along this trail.',
    },
  ],
  places: [
    { id: 'B3C06994-D80C-44CF-8F6C-9C197D9CA1CF', title: 'Big Bend', parkCode: 'zion' },
    { id: '0D93CA13-99EC-4592-B2B8-AAA68238F5AF', title: 'Canyon Junction', parkCode: 'zion' },
  ],
};

const ZION_DIRECT_FULL = {
  thingstodo: [
    ...ZION_PARTIAL_BULK.thingstodo,
    {
      id: 'parus',
      title: "Pa'rus Trail",
      parkCode: 'zion',
      shortDescription: 'Easy paved walk with scenic views along the Virgin River.',
    },
    {
      id: 'riverside',
      title: 'Riverside Walk',
      parkCode: 'zion',
      shortDescription: 'Easy, relatively flat and paved trail into Zion Canyon.',
    },
    {
      id: 'emerald-lower',
      title: 'Lower Emerald Pool Trail',
      parkCode: 'zion',
      shortDescription: 'Easy rough paved trail to the lower pool with scenic views.',
    },
    {
      id: 'overlook',
      title: 'Canyon Overlook',
      parkCode: 'zion',
      shortDescription: 'Long drop-offs, mostly fenced. Rocky uneven trail to a viewpoint.',
    },
  ],
  places: [
    ...ZION_PARTIAL_BULK.places,
    { id: 'weeping', title: 'Weeping Rock', parkCode: 'zion', shortDescription: 'Paved spur with steep sections.' },
  ],
};

function activitiesRequirement() {
  return {
    requirementId: 'req:zion:activities',
    entity: {
      entityId: 'nps:park:zion',
      entityType: 'national_park',
      parkCode: 'zion',
      displayName: 'Zion National Park',
    },
    topic: 'activities',
    evidenceTypes: ['fact'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'stable',
    maxAgeSeconds: 30 * 24 * 3600,
    maxStaleSeconds: 90 * 24 * 3600,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    reasonCodes: [
      'requested_named_hike_or_walk',
      'requested_viewpoint_or_scenic',
      'requested_low_exposure_candidates',
    ],
  };
}

function taxonomyV1Rows() {
  return ['Arts and Culture', 'Biking', 'Hiking'].map((name, i) => {
    const observedAt = new Date(NOW.getTime() - 24 * 3600 * 1000).toISOString();
    return {
      evidenceId: `ev:v1:${i}`,
      entityId: 'nps:park:zion',
      topic: 'activities',
      evidenceType: 'fact',
      claim: {
        text: name,
        normalizedValue: { name, category: 'taxonomy' },
        qualifiers: ['activity_taxonomy'],
        polarity: 'positive',
      },
      scope: { geographicEntityIds: ['nps:park:zion'], validFrom: null, validThrough: null, audience: 'public' },
      source: { provider: 'nps', sourceId: `tax-${i}`, sourceClass: 'official_owner' },
      quality: { authorityClass: 'official_owner', conflictStatus: 'none', scopeMatch: 'exact' },
      provenance: {
        extractorVersion: 'nps-evidence-v1',
        extractionMethod: 'structured_adapter',
        contentHash: `tax-${i}`,
      },
      observation: {
        observedAt,
        fetchedAt: observedAt,
        expiresAt: new Date(NOW.getTime() + 29 * 24 * 3600 * 1000).toISOString(),
        staleUntil: new Date(NOW.getTime() + 89 * 24 * 3600 * 1000).toISOString(),
      },
      isCurrent: true,
    };
  });
}

describe('Fix Pass #3E named activities source selection', () => {
  let svc;

  beforeEach(() => {
    svc = new NPSService({ apiKey: 'test-nps-key-not-used-for-network' });
  });

  test('CASE A: complete bulk → direct NOT called', async () => {
    svc._loadBulkSnapshotWithCompleteness = jest.fn(async (key) => {
      if (key === 'bulk-activities') {
        return {
          data: ZION_PARTIAL_BULK.thingstodo,
          reportedTotal: 2,
          recordsFetched: 2,
          paginationComplete: true,
          generationComplete: true,
        };
      }
      return {
        data: { zion: ZION_PARTIAL_BULK.places },
        reportedTotal: 2,
        recordsFetched: 2,
        paginationComplete: true,
        generationComplete: true,
      };
    });
    svc._getParkEvidenceListPaginated = jest.fn();

    const result = await svc.getParkNamedActivitiesEvidence('zion');
    expect(svc._getParkEvidenceListPaginated).not.toHaveBeenCalled();
    expect(result.source).toBe('snapshot_hit_complete');
    expect(result.isComplete).toBe(true);
    expect(result.data.thingstodo).toHaveLength(2);
    expect(result.data.places).toHaveLength(2);
  });

  test('CASE B: incomplete bulk → direct fallback', async () => {
    svc._loadBulkSnapshotWithCompleteness = jest.fn(async (key) => {
      if (key === 'bulk-activities') {
        return {
          data: ZION_PARTIAL_BULK.thingstodo,
          reportedTotal: 20,
          recordsFetched: 2,
          paginationComplete: false,
          generationComplete: false,
        };
      }
      return {
        data: { zion: ZION_PARTIAL_BULK.places },
        reportedTotal: 20,
        recordsFetched: 2,
        paginationComplete: false,
      };
    });
    svc._getParkEvidenceListPaginated = jest.fn(async (endpoint) => {
      if (endpoint === '/thingstodo') {
        return { data: ZION_DIRECT_FULL.thingstodo, isComplete: true, observedAt: NOW.toISOString() };
      }
      return { data: ZION_DIRECT_FULL.places, isComplete: true, observedAt: NOW.toISOString() };
    });

    const result = await svc.getParkNamedActivitiesEvidence('zion');
    expect(svc._getParkEvidenceListPaginated).toHaveBeenCalledWith('/thingstodo', 'zion', expect.any(Object));
    expect(svc._getParkEvidenceListPaginated).toHaveBeenCalledWith('/places', 'zion', expect.any(Object));
    expect(result.source).toBe('direct_fallback');
    expect(result.data.thingstodo.map((r) => r.title)).toEqual(
      expect.arrayContaining(["Pa'rus Trail", 'Riverside Walk', 'Lower Emerald Pool Trail'])
    );
  });

  test('CASE C: small complete park accepted (no min-count rule)', async () => {
    svc._loadBulkSnapshotWithCompleteness = jest.fn(async () => ({
      data: [{ id: '1', title: 'Only Trail', parkCode: 'tiny' }],
      reportedTotal: 1,
      recordsFetched: 1,
      paginationComplete: true,
      generationComplete: true,
    }));
    // places complete empty-ish
    svc._loadBulkSnapshotWithCompleteness
      .mockResolvedValueOnce({
        data: [{ id: '1', title: 'Only Trail', parkCode: 'tiny' }],
        reportedTotal: 1,
        recordsFetched: 1,
        paginationComplete: true,
        generationComplete: true,
      })
      .mockResolvedValueOnce({
        data: { tiny: [{ id: 'p1', title: 'Overlook', parkCode: 'tiny' }] },
        reportedTotal: 1,
        recordsFetched: 1,
        paginationComplete: true,
        generationComplete: true,
      });
    svc._getParkEvidenceListPaginated = jest.fn();

    const result = await svc.getParkNamedActivitiesEvidence('tiny');
    expect(svc._getParkEvidenceListPaginated).not.toHaveBeenCalled();
    expect(result.data.thingstodo).toHaveLength(1);
    expect(result.source).toBe('snapshot_hit_complete');
  });

  test('CASE D: legacy snapshot without completeness fields → direct', async () => {
    svc._loadBulkSnapshotWithCompleteness = jest.fn(async (key) => {
      if (key === 'bulk-activities') return { data: ZION_PARTIAL_BULK.thingstodo };
      return { data: { zion: ZION_PARTIAL_BULK.places } };
    });
    svc._getParkEvidenceListPaginated = jest.fn(async (endpoint) => ({
      data: endpoint === '/thingstodo' ? ZION_DIRECT_FULL.thingstodo : ZION_DIRECT_FULL.places,
      isComplete: true,
      observedAt: NOW.toISOString(),
    }));

    const result = await svc.getParkNamedActivitiesEvidence('zion');
    expect(result.selection.activitiesReason).toBe('snapshot_incomplete');
    expect(result.source).toBe('direct_fallback');
  });

  test('CASE E: direct fallback fails → not marked complete', async () => {
    svc._loadBulkSnapshotWithCompleteness = jest.fn(async () => ({
      data: ZION_PARTIAL_BULK.thingstodo,
      paginationComplete: false,
    }));
    svc._getParkEvidenceListPaginated = jest.fn(async () => ({
      data: ZION_PARTIAL_BULK.thingstodo.slice(0, 1),
      isComplete: false,
      observedAt: NOW.toISOString(),
    }));

    const result = await svc.getParkNamedActivitiesEvidence('zion');
    expect(result.isComplete).toBe(false);
    expect(result.source).toBe('direct_refresh_failed');
  });

  test('CASE F: dedupe by stable id across merge-ready lists', async () => {
    svc._loadBulkSnapshotWithCompleteness = jest.fn(async () => ({ paginationComplete: false }));
    svc._getParkEvidenceListPaginated = jest.fn(async (endpoint) => {
      if (endpoint === '/thingstodo') {
        return {
          data: [
            { id: 'parus', title: "Pa'rus Trail" },
            { id: 'parus', title: "Pa'rus Trail duplicate" },
            { id: 'riverside', title: 'Riverside Walk' },
          ],
          isComplete: true,
          observedAt: NOW.toISOString(),
        };
      }
      return { data: [], isComplete: true, observedAt: NOW.toISOString() };
    });

    const result = await svc.getParkNamedActivitiesEvidence('zion');
    expect(result.data.thingstodo).toHaveLength(2);
    expect(result.data.thingstodo[0].title).toBe("Pa'rus Trail");
  });
});

describe('Fix Pass #3E Zion offline preflight replay', () => {
  test('schema mismatch → incomplete snapshot → direct → v2 low-exposure in Prompt v2', async () => {
    const preCoverage = evaluateRequirementCoverage(
      activitiesRequirement(),
      taxonomyV1Rows(),
      { now: NOW }
    );
    expect(preCoverage.status).toBe('missing');
    expect(preCoverage.candidateSummary.schemaMismatch).toBeGreaterThan(0);
    expect(preCoverage.refresh.needed).toBe(true);

    const npsClient = {
      getParkNamedActivitiesEvidence: jest.fn().mockResolvedValue({
        data: ZION_DIRECT_FULL,
        isComplete: true,
        observedAt: NOW.toISOString(),
        source: 'direct_fallback',
        selection: {
          activitiesReason: 'snapshot_incomplete',
          placesReason: 'snapshot_incomplete',
          thingstodoSource: 'direct_fallback',
          placesSource: 'direct_fallback',
        },
      }),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const requirement = activitiesRequirement();
    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    expect(fetched.completeness.isComplete).toBe(true);
    expect(fetched.metadata.namedActivitiesSource).toBe('direct_fallback');
    expect(npsClient.getParkNamedActivitiesEvidence).toHaveBeenCalledWith('zion', expect.any(Object));

    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates.every((c) => c.provenance.extractorVersion === NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION)).toBe(true);
    expect(candidates.every((c) => c.claim.qualifiers.includes('source_ingestion_complete'))).toBe(true);

    const evidence = candidates.map((c, i) => ({
      ...c,
      evidenceId: `ev:${i}`,
      observation: { observedAt: fetched.metadata.observedAt },
      retention: { storeClaimText: true },
    }));
    const byName = Object.fromEntries(
      evidence.map((e) => [e.claim.normalizedValue.name, e.claim.normalizedValue])
    );
    expect(byName["Pa'rus Trail"]).toMatchObject({ difficulty: 'easy', exposureLevel: 'low' });
    expect(byName['Riverside Walk']).toMatchObject({ difficulty: 'easy', exposureLevel: 'low' });
    expect(byName['Lower Emerald Pool Trail']).toMatchObject({ difficulty: 'easy', exposureLevel: 'low' });

    const lowExposureCount = evidence.filter((e) => e.claim.normalizedValue.exposureLevel === 'low').length;
    const unknownExposureCount = evidence.filter((e) => e.claim.normalizedValue.exposureLevel == null).length;
    const moderateHighCount = evidence.filter((e) =>
      /moderate|high/i.test(String(e.claim.normalizedValue.exposureLevel || ''))
    ).length;

    expect(evidence.length).toBeGreaterThanOrEqual(6);
    expect(lowExposureCount).toBeGreaterThanOrEqual(2);

    const rendered = renderEvidenceBundleForPrompt({
      bundle: {
        evidence,
        resolutions: [{
          requirementId: requirement.requirementId,
          status: 'satisfied_fresh',
          evidenceIds: evidence.map((e) => e.evidenceId),
          selectedEvidence: evidence,
        }],
      },
      requirements: [requirement],
      maxTokens: 1800,
    });

    expect(rendered.text).toMatch(/Pa.?rus Trail/i);
    expect(rendered.text).toMatch(/Riverside Walk/i);
    expect(rendered.text).toMatch(/exposureLevel=low/i);
    // High-exposure Kayenta should not outrank low walks for this request shape.
    const parusIdx = rendered.text.search(/Pa.?rus Trail/i);
    const kayentaIdx = rendered.text.search(/Kayenta Trail/i);
    if (kayentaIdx >= 0) {
      expect(parusIdx).toBeGreaterThanOrEqual(0);
      expect(parusIdx).toBeLessThan(kayentaIdx);
    }

    // Persist counts for report consumers.
    expect({
      candidateCount: evidence.length,
      lowExposureCount,
      unknownExposureCount,
      moderateHighCount,
    }).toMatchObject({
      candidateCount: expect.any(Number),
      lowExposureCount: expect.any(Number),
    });
  });

  test('provider prefers evidence seam over legacy tab helpers when both exist', async () => {
    const npsClient = {
      getParkNamedActivitiesEvidence: jest.fn().mockResolvedValue({
        data: { thingstodo: ZION_DIRECT_FULL.thingstodo, places: [] },
        isComplete: true,
        observedAt: NOW.toISOString(),
        source: 'direct_fallback',
        selection: { activitiesReason: 'snapshot_incomplete' },
      }),
      getParkActivities: jest.fn().mockResolvedValue(ZION_PARTIAL_BULK.thingstodo),
      getParkPlaces: jest.fn().mockResolvedValue(ZION_PARTIAL_BULK.places),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest(activitiesRequirement());
    await provider.fetch(request, { signal: new AbortController().signal });
    expect(npsClient.getParkNamedActivitiesEvidence).toHaveBeenCalled();
    expect(npsClient.getParkActivities).not.toHaveBeenCalled();
  });
});
