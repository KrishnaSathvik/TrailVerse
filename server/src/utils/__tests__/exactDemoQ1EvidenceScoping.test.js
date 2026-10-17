'use strict';

const {
  activityBelongsToLogicalPark,
  filterActivitiesForLogicalPark,
  jointFetchCodeFor,
} = require('../npsJointUnitActivityScope');
const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');
const { evaluateEvidenceContractCompatibility } = require('../evidenceContractVersions');
const { createEvidenceBroker } = require('../../services/evidenceBrokerService');
const { buildEvidenceKeys } = require('../evidenceKey');
const { buildTrailiePromptV2 } = require('../../prompts/trailiePromptV2');
const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');

const NOW = new Date('2026-08-12T12:00:00.000Z');
const EXACT_Q1 = 'I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds? Pick one and explain why.';

const SEKI_JOINT_RELATED_PARKS = Object.freeze([{
  parkCode: 'seki',
  fullName: 'Sequoia & Kings Canyon National Parks',
  name: 'Sequoia & Kings Canyon National Parks',
}]);

const SEKI_MIXED_THINGSTODO = [
  {
    id: 'big-trees',
    title: 'Big Trees Trail',
    shortDescription: 'Easy accessible walk among giant sequoias in Giant Forest.',
  },
  {
    id: 'sherman',
    title: 'General Sherman Tree',
    shortDescription: 'Visit the largest tree on Earth in Giant Forest.',
  },
  {
    id: 'sunset-rock',
    title: 'View Sunset from Sunset Rock',
    shortDescription: 'Sunset views near Giant Forest.',
  },
  {
    id: 'grant-tree',
    title: 'General Grant Tree',
    shortDescription: 'Visit the General Grant Tree in Grant Grove.',
  },
  {
    id: 'grant-loop',
    title: 'Grant Grove Loop Winter Trail',
    shortDescription: 'Easy winter loop through Grant Grove.',
  },
  {
    id: 'roaring',
    title: 'Roaring River Falls',
    shortDescription: 'Short paved walk to Roaring River Falls near Cedar Grove.',
  },
  {
    id: 'kc-vc',
    title: 'Visit the Kings Canyon Visitor Center',
    shortDescription: 'Stop at the Kings Canyon Visitor Center in Grant Grove.',
  },
].map((item) => ({ ...item, relatedParks: SEKI_JOINT_RELATED_PARKS }));

function sequActivitiesRequirement() {
  return {
    requirementId: 'req:q1:activities:sequ',
    entity: { entityId: 'nps:park:sequ', displayName: 'Sequoia National Park' },
    topic: 'activities',
    evidenceTypes: ['fact'],
    temporalScope: {
      mode: 'current', requestedAt: NOW.toISOString(),
      validFrom: null, validThrough: null, timezone: 'UTC',
    },
    freshnessClass: 'stable',
    maxAgeSeconds: 30 * 24 * 3600,
    maxStaleSeconds: 90 * 24 * 3600,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    allowedFallbackProviders: [],
    reasonCodes: ['requested_hike_scenic_candidates'],
  };
}

function oldStoredSequActivity(name, id) {
  const candidate = {
    schemaVersion: 1,
    entityId: 'nps:park:sequ',
    topic: 'activities',
    evidenceType: 'fact',
    claim: {
      identity: `thingstodo:${id}`,
      text: `${name}: pre-fix stored evidence`,
      normalizedValue: { name, destinationId: 'nps:park:sequ', activityTypes: ['walk'] },
      qualifiers: ['named_activity_candidate', 'source_ingestion_complete'],
    },
    scope: {
      geographicEntityIds: ['nps:park:sequ'], validFrom: null, validThrough: null,
      audience: 'public', locale: 'en-US',
    },
    source: {
      provider: 'nps', sourceClass: 'official_owner', sourceId: id,
      url: null, title: name, publishedAt: null, sourceUpdatedAt: null,
    },
    observation: {
      observedAt: NOW, fetchedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 30 * 24 * 3600 * 1000),
      staleUntil: new Date(NOW.getTime() + 90 * 24 * 3600 * 1000),
      retrievalMode: 'live',
    },
    quality: {
      authorityClass: 'official_owner', freshnessStatus: 'fresh', scopeMatch: 'exact',
      corroboratingEvidenceIds: [], conflictingEvidenceIds: [], conflictStatus: 'none',
    },
    provenance: {
      extractionMethod: 'structured_adapter', extractorVersion: 'nps-activities-v8',
      rawPayloadHash: null, contentHash: 'pending',
    },
    retention: {
      class: 'public_stable_1y', licenseClass: 'government_public',
      storeClaimText: true, deleteAfter: null,
    },
    isCurrent: true,
  };
  const keys = buildEvidenceKeys(candidate);
  return {
    ...candidate, ...keys,
    provenance: { ...candidate.provenance, contentHash: keys.contentHash },
  };
}

function promptEvidence(candidate, index) {
  return {
    ...candidate,
    evidenceId: `ev:q1:${candidate.entityId}:${index}`,
    observation: {
      observedAt: NOW.toISOString(), fetchedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 30 * 24 * 3600 * 1000).toISOString(),
      staleUntil: new Date(NOW.getTime() + 90 * 24 * 3600 * 1000).toISOString(),
      retrievalMode: 'generated',
    },
    retention: { storeClaimText: true },
  };
}

describe('exact demo Q1 evidence scoping (offline)', () => {
  test('sequ/kica jointly fetch seki', () => {
    expect(jointFetchCodeFor('sequ')).toBe('seki');
    expect(jointFetchCodeFor('kica')).toBe('seki');
    expect(jointFetchCodeFor('yose')).toBeNull();
  });

  test('excludes Kings Canyon geography from Sequoia logical park', () => {
    const kept = filterActivitiesForLogicalPark(SEKI_MIXED_THINGSTODO, 'sequ')
      .map((item) => item.title);
    expect(kept).toEqual(expect.arrayContaining([
      'Big Trees Trail',
      'General Sherman Tree',
      'View Sunset from Sunset Rock',
    ]));
    expect(kept).not.toEqual(expect.arrayContaining([
      'General Grant Tree',
      'Grant Grove Loop Winter Trail',
      'Roaring River Falls',
      'Visit the Kings Canyon Visitor Center',
    ]));
  });

  test('joint administrative parent name alone does not trigger sibling exclusion', () => {
    const bigTrees = SEKI_MIXED_THINGSTODO.find((item) => item.id === 'big-trees');
    const generalGrant = SEKI_MIXED_THINGSTODO.find((item) => item.id === 'grant-tree');

    expect(activityBelongsToLogicalPark(bigTrees, 'sequ')).toBe(true);
    expect(activityBelongsToLogicalPark(generalGrant, 'kica')).toBe(true);
  });

  test('excludes Sequoia geography from Kings Canyon logical park', () => {
    const kept = filterActivitiesForLogicalPark(SEKI_MIXED_THINGSTODO, 'kica')
      .map((item) => item.title);
    expect(kept).toEqual(expect.arrayContaining([
      'General Grant Tree',
      'Grant Grove Loop Winter Trail',
      'Roaring River Falls',
    ]));
    expect(kept).not.toEqual(expect.arrayContaining([
      'Big Trees Trail',
      'General Sherman Tree',
      'View Sunset from Sunset Rock',
    ]));
  });

  test('non-joint parks keep all activities', () => {
    expect(filterActivitiesForLogicalPark(SEKI_MIXED_THINGSTODO, 'yose')).toHaveLength(
      SEKI_MIXED_THINGSTODO.length
    );
    expect(activityBelongsToLogicalPark(SEKI_MIXED_THINGSTODO[3], 'yose')).toBe(true);
  });

  test('npsEvidenceProvider normalize stamps only Sequoia-side SEKI activities on sequ', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue(SEKI_MIXED_THINGSTODO),
      getParkPlaces: jest.fn().mockResolvedValue([]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest({
      requirementId: 'req:activities:sequ',
      entity: { entityId: 'nps:park:sequ', displayName: 'Sequoia National Park' },
      topic: 'activities',
      preferredProviders: ['nps'],
    });
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    expect(npsClient.getParkActivities).toHaveBeenCalledWith('seki');
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    const names = candidates.map((c) => c.claim.normalizedValue.name);
    expect(names).toEqual(expect.arrayContaining([
      'Big Trees Trail',
      'General Sherman Tree',
      'View Sunset from Sunset Rock',
    ]));
    expect(names.some((n) => /grant grove|general grant|roaring river|kings canyon/i.test(n))).toBe(false);
    expect(candidates.every((c) => c.entityId === 'nps:park:sequ')).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) =>
      c.provenance.extractorVersion === require('../evidenceContractVersions').NPS_JOINT_UNIT_ACTIVITY_EXTRACTOR_VERSION
    )).toBe(true);
  });

  test('pre-fix joint-unit normalized evidence is contract-incompatible even while fresh', () => {
    const oldGeneralGrant = {
      entityId: 'nps:park:sequ',
      topic: 'activities',
      evidenceType: 'fact',
      claim: {
        identity: 'thingstodo:general-grant',
        text: 'General Grant Tree: Visit the General Grant Tree in Grant Grove.',
        normalizedValue: { name: 'General Grant Tree', destinationId: 'nps:park:sequ' },
        qualifiers: ['named_activity_candidate', 'source_ingestion_complete'],
      },
      source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'general-grant' },
      provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-activities-v8' },
    };

    expect(evaluateEvidenceContractCompatibility(oldGeneralGrant)).toEqual({
      ok: false,
      reasonCode: 'candidate_normalization_scope_version_mismatch',
    });
  });

  test('broker misses stale pre-fix SEKI normalization and freezes only refreshed Sequoia geography', async () => {
    const oldNames = ['General Grant Tree', 'Grant Grove Loop Winter Trail', 'Roaring River Falls'];
    const docs = oldNames.map((name, index) => oldStoredSequActivity(name, `old-${index}`));
    const npsClient = {
      getParkNamedActivitiesEvidence: jest.fn().mockResolvedValue({
        data: { thingstodo: SEKI_MIXED_THINGSTODO, places: [] },
        isComplete: true,
        observedAt: NOW.toISOString(),
        source: 'saved_fixture',
        selection: {
          activitiesReason: 'fixture', placesReason: 'fixture',
          thingstodoSource: 'saved_fixture', placesSource: 'saved_fixture',
        },
      }),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const broker = createEvidenceBroker({
      providers: [provider],
      queryEvidence: async (requirement) => docs.filter((item) =>
        item.entityId === requirement.entity.entityId
        && item.topic === requirement.topic
        && item.isCurrent
      ),
      persistCandidate: async ({ candidate }) => {
        const keys = buildEvidenceKeys(candidate);
        const evidence = {
          ...candidate, ...keys, isCurrent: true,
          provenance: { ...candidate.provenance, contentHash: keys.contentHash },
        };
        docs.push(evidence);
        return { outcome: 'created', evidence };
      },
      acquireLease: async ({ leaseKey, ownerId }) => ({
        outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 },
      }),
      releaseLease: async () => ({ released: true }),
      refreshHashSecret: 'q1-scope-v2-offline-only',
      now: () => NOW,
    });

    const requirement = sequActivitiesRequirement();
    const bundle = await broker.resolveEvidence({
      requirements: [requirement], requestId: 'q1-scope-v2-stale-store-offline',
    });
    const selectedNames = bundle.evidence.map((item) => item.claim.normalizedValue.name);

    expect(npsClient.getParkNamedActivitiesEvidence).toHaveBeenCalledTimes(1);
    expect(bundle.resolutions[0]).toMatchObject({
      status: 'satisfied_fresh', cacheStatus: 'refreshed',
    });
    expect(selectedNames.length).toBeGreaterThan(0);
    expect(selectedNames).toEqual(expect.arrayContaining([
      'Big Trees Trail', 'General Sherman Tree', 'View Sunset from Sunset Rock',
    ]));
    expect(selectedNames.some((name) => /general grant|grant grove|roaring river/i.test(name))).toBe(false);

    const rendered = renderEvidenceBundleForPrompt({
      bundle, requirements: [requirement], maxTokens: 1200,
    });
    expect(rendered.text).toMatch(/Big Trees Trail|General Sherman Tree|Sunset Rock/);
    expect(rendered.text).not.toMatch(/General Grant|Grant Grove|Roaring River/);
  });

  test('npsEvidenceProvider symmetrically retains nonzero Kings Canyon candidates', async () => {
    const npsClient = {
      getParkActivities: jest.fn().mockResolvedValue(SEKI_MIXED_THINGSTODO),
      getParkPlaces: jest.fn().mockResolvedValue([]),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const request = provider.buildRequest({
      requirementId: 'req:activities:kica',
      entity: { entityId: 'nps:park:kica', displayName: 'Kings Canyon National Park' },
      topic: 'activities',
      preferredProviders: ['nps'],
    });
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    expect(npsClient.getParkActivities).toHaveBeenCalledWith('seki');
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    const names = candidates.map((c) => c.claim.normalizedValue.name);
    expect(names).toEqual(expect.arrayContaining([
      'General Grant Tree',
      'Grant Grove Loop Winter Trail',
      'Roaring River Falls',
    ]));
    expect(names.some((n) => /big trees|general sherman|sunset rock/i.test(n))).toBe(false);
    expect(candidates.every((c) => c.entityId === 'nps:park:kica')).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
  });

  test('multi-entity prompt packing does not starve Yosemite under Sequoia volume', () => {
    const sequEvidence = Array.from({ length: 24 }, (_, i) => ({
      evidenceId: `ev:sequ:${i}`,
      entityId: 'nps:park:sequ',
      topic: 'activities',
      claim: {
        text: `Sequoia activity ${i}: Easy hike among giant sequoias with meadow views.`,
        normalizedValue: {
          name: `Sequoia Easy ${i}`,
          destinationId: 'nps:park:sequ',
          difficulty: 'easy',
          activityTypes: ['hike', 'walk'],
        },
        qualifiers: ['named_activity_candidate'],
      },
      source: { provider: 'nps', sourceClass: 'official_owner', title: `Sequoia Easy ${i}` },
      observation: { observedAt: '2026-08-12T12:00:00.000Z' },
      quality: { authorityClass: 'official_owner' },
      retention: { storeClaimText: true },
    }));
    const yoseEvidence = [
      {
        evidenceId: 'ev:yose:bridalveil',
        entityId: 'nps:park:yose',
        topic: 'activities',
        claim: {
          text: 'Bridalveil Fall Trailhead: Short walk to a classic Yosemite waterfall viewpoint.',
          normalizedValue: {
            name: 'Bridalveil Fall Trailhead',
            destinationId: 'nps:park:yose',
            difficulty: 'easy',
            activityTypes: ['hike', 'walk', 'viewpoint'],
          },
          qualifiers: ['named_place_candidate'],
        },
        source: { provider: 'nps', sourceClass: 'official_owner', title: 'Bridalveil Fall Trailhead' },
        observation: { observedAt: '2026-08-12T12:00:00.000Z' },
        quality: { authorityClass: 'official_owner' },
        retention: { storeClaimText: true },
      },
      {
        evidenceId: 'ev:yose:valley-view',
        entityId: 'nps:park:yose',
        topic: 'activities',
        claim: {
          text: 'Valley View: Scenic photography overlook of Yosemite Valley.',
          normalizedValue: {
            name: 'Valley View',
            destinationId: 'nps:park:yose',
            activityTypes: ['viewpoint', 'scenic'],
          },
          qualifiers: ['named_place_candidate'],
        },
        source: { provider: 'nps', sourceClass: 'official_owner', title: 'Valley View' },
        observation: { observedAt: '2026-08-12T12:00:00.000Z' },
        quality: { authorityClass: 'official_owner' },
        retention: { storeClaimText: true },
      },
    ];
    const all = [...sequEvidence, ...yoseEvidence];
    const bundle = {
      resolutions: [{
        requirementId: 'req-act',
        status: 'satisfied_fresh',
        evidenceIds: all.map((item) => item.evidenceId),
      }],
      evidence: all,
    };
    const result = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [{
        requirementId: 'req-act',
        topic: 'activities',
        reasonCodes: ['requested_hike_scenic_candidates'],
      }],
      maxTokens: 450,
    });
    expect(result.truncated).toBe(true);
    expect(result.text).toMatch(/Bridalveil Fall Trailhead|Valley View/);
    const included = new Set(result.includedEvidenceIds);
    expect(included.has('ev:yose:bridalveil') || included.has('ev:yose:valley-view')).toBe(true);
    expect([...included].some((id) => id.startsWith('ev:sequ:'))).toBe(true);
  });

  test('exact Q1 final compare prompt is balanced, scoped, and has no travel/stay section', () => {
    expect(resolveDestinationsFromMessage(EXACT_Q1).map((item) => item.parkCode))
      .toEqual(['yose', 'sequ']);
    const provider = createNpsEvidenceProvider({ npsClient: {}, now: () => NOW });
    const sequRequest = provider.buildRequest(sequActivitiesRequirement());
    const sequ = provider.normalize(
      { thingstodo: SEKI_MIXED_THINGSTODO, places: [] },
      sequRequest,
      { observedAt: NOW.toISOString(), sourceIngestionComplete: true }
    ).map(promptEvidence);
    const yoseRequest = provider.buildRequest({
      ...sequActivitiesRequirement(),
      requirementId: 'req:q1:activities:yose',
      entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park' },
    });
    const yose = provider.normalize({
      thingstodo: [
        {
          id: 'bridalveil', title: 'Bridalveil Fall Trailhead',
          shortDescription: 'An easy short walk to a classic waterfall photography viewpoint.',
          relatedParks: [{ parkCode: 'yose', fullName: 'Yosemite National Park' }],
        },
        {
          id: 'valley-view', title: 'Valley View',
          shortDescription: 'A scenic photography viewpoint across Yosemite Valley.',
          relatedParks: [{ parkCode: 'yose', fullName: 'Yosemite National Park' }],
        },
      ],
      places: [],
    }, yoseRequest, {
      observedAt: NOW.toISOString(), sourceIngestionComplete: true,
    }).map(promptEvidence);
    const requirements = [
      sequActivitiesRequirement(),
      {
        ...sequActivitiesRequirement(),
        requirementId: 'req:q1:activities:yose',
        entity: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park' },
      },
    ];
    const evidence = [...sequ, ...yose];
    const bundle = {
      evidence,
      resolutions: requirements.map((requirement) => ({
        requirementId: requirement.requirementId,
        status: 'satisfied_fresh',
        evidenceIds: evidence
          .filter((item) => item.entityId === requirement.entity.entityId)
          .map((item) => item.evidenceId),
      })),
    };
    const built = buildTrailiePromptV2({
      mode: 'compare', evidenceBundle: bundle, requirements,
      userRequest: EXACT_Q1,
    });

    expect(built.prompt).toContain(EXACT_Q1);
    expect(built.evidence.text).toMatch(/Big Trees Trail|General Sherman Tree|Sunset Rock/);
    expect(built.evidence.text).toMatch(/Bridalveil Fall Trailhead|Valley View/);
    expect(built.evidence.text).not.toMatch(/General Grant|Grant Grove|Roaring River/);
    expect(built.evidence.text).not.toMatch(/crowd level|crowd forecast|crowd score/i);
    expect(built.prompt).not.toMatch(/General Grant|Grant Grove|Roaring River/);
    expect(built.prompt).not.toMatch(/Travel & Stay/);
    expect(built.evidence.includedEvidenceIds.some((id) => id.includes('nps:park:sequ'))).toBe(true);
    expect(built.evidence.includedEvidenceIds.some((id) => id.includes('nps:park:yose'))).toBe(true);
  });
});
