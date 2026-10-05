'use strict';

const { planEvidenceRequirements } = require('../evidencePlannerService');
const { createDirectOfficialPageEvidenceProvider } = require('../providers/directOfficialPageEvidenceProvider');
const { WEB_PROVIDER_BY_TOPIC, buildPublicWebQuery } = require('../webEvidencePolicyService');
const { SUPPORTED_TOPICS } = require('../providers/npsEvidenceProvider');
const { CONSTRAINT_TYPE } = require('../../utils/trailieOperationalConstraints');

/**
 * P0-5 acquisition (audit 2026-08-31): the veto machinery was complete but the
 * official 21-ft fact had no path into the frozen bundle — Glacier's GTSR
 * evidence was alert titles and search-result titles only.
 *
 * Demand-driven chain, no destination-specific tables:
 *   traveler supplies vehicle dimensions
 *   → planner emits a `vehicle_restrictions` requirement
 *   → structured NPS first; if inadequate, web discovery → official page
 *   → official page TEXT yields a structured vehicle_dimension fact
 *   → frozen into the normal EvidenceBundle.
 */

const NOW = new Date('2026-09-01T12:00:00Z');
const GLACIER = [{ entityId: 'nps:park:glac', entityType: 'national_park', displayName: 'Glacier National Park', resolutionConfidence: 1 }];

const plan = (userPrompt, constraints = null) => planEvidenceRequirements({
  turnId: 'turn-p05',
  userPrompt,
  intent: { primaryIntent: 'simple_itinerary' },
  resolvedEntities: GLACIER,
  dates: null,
  priorTripState: null,
  constraints,
  now: NOW,
  timezone: 'America/Denver',
});

describe('demand signal: traveler vehicle dimensions plan the requirement', () => {
  test('a stated 24-ft RV plans vehicle_restrictions', () => {
    const requirements = plan('Plan 4 days in Glacier in early October with our 24-foot RV.');
    const requirement = requirements.find((r) => r.topic === 'vehicle_restrictions');
    expect(requirement).toBeDefined();
    expect(requirement.criticality).not.toBe('optional');
  });

  test('a dimensional vehicle with unstated length still plans it', () => {
    const requirements = plan('Plan 4 days in Glacier — we are bringing our RV.');
    expect(requirements.find((r) => r.topic === 'vehicle_restrictions')).toBeDefined();
  });

  test('no vehicle mentioned → not planned (the demand signal, not park identity)', () => {
    const requirements = plan('Plan 4 days in Glacier in early October for two hikers.');
    expect(requirements.find((r) => r.topic === 'vehicle_restrictions')).toBeUndefined();
  });
});

describe('provider chain declares the topic end to end', () => {
  test('structured NPS wave serves the topic first', () => {
    expect(SUPPORTED_TOPICS.has('vehicle_restrictions')).toBe(true);
  });

  test('web discovery has a provider and a bounded official query', () => {
    expect(WEB_PROVIDER_BY_TOPIC.vehicle_restrictions).toBeDefined();
    const query = buildPublicWebQuery({
      entity: { displayName: 'Glacier National Park' },
      topic: 'vehicle_restrictions',
      reasonCodes: ['traveler_vehicle_dimension'],
    });
    expect(query).toMatch(/vehicle/i);
    expect(query).toMatch(/Glacier National Park/);
    expect(query).toMatch(/length|size|restriction/i);
  });
});

describe('coverage: only fact-carrying candidates satisfy the parsed-rule topic', () => {
  const { evaluateRequirementCoverage } = require('../evidenceCoverageEvaluator');
  const NOW2 = new Date('2026-09-01T12:00:00Z');
  const req = () => ({
    requirementId: 'req:veh:1',
    entity: { entityId: 'nps:park:glac' },
    topic: 'vehicle_restrictions',
    evidenceTypes: ['rule', 'fact'],
    temporalScope: { mode: 'timeless', requestedAt: NOW2.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'stable',
    maxAgeSeconds: 30 * 86400,
    maxStaleSeconds: 90 * 86400,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
  });
  const pageCandidate = (normalizedValue, id = 'ev:veh:1') => ({
    evidenceId: id,
    entityId: 'nps:park:glac',
    topic: 'vehicle_restrictions',
    evidenceType: 'rule',
    claim: { identity: id, normalizedValue },
    scope: { geographicEntityIds: ['nps:park:glac'], validFrom: null, validThrough: null, audience: 'public' },
    source: { provider: 'direct_official_page', sourceClass: 'official_owner' },
    observation: {
      observedAt: new Date(NOW2.getTime() - 60000).toISOString(),
      fetchedAt: new Date(NOW2.getTime() - 60000).toISOString(),
      expiresAt: new Date(NOW2.getTime() + 30 * 86400000).toISOString(),
      staleUntil: new Date(NOW2.getTime() + 90 * 86400000).toISOString(),
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
  });

  test('an official page WITHOUT the parsed rule cannot satisfy the requirement', () => {
    const result = evaluateRequirementCoverage(req(), [pageCandidate({ title: 'Vehicle Reservations' })], { now: NOW2 });
    expect(String(result.status).startsWith('satisfied_')).toBe(false);
  });

  test('an official page WITH the parsed rule satisfies it', () => {
    const withFact = pageCandidate({
      title: 'Going-to-the-Sun Road',
      operationalFacts: [{ type: 'vehicle_dimension', dimension: { kind: 'length', maxLengthFeet: 21 }, subject: { name: 'Going-to-the-Sun Road' } }],
    }, 'ev:veh:2');
    const result = evaluateRequirementCoverage(req(), [withFact], { now: NOW2 });
    expect(String(result.status).startsWith('satisfied_')).toBe(true);
  });
});

describe('parsed-rule adequacy: page content without the rule never closes the topic', () => {
  const { planWebEvidenceFallbacks } = require('../webEvidencePolicyService');
  const requirement = {
    requirementId: 'req-vehicle-1',
    entity: { entityId: 'nps:park:glac', displayName: 'Glacier National Park' },
    topic: 'vehicle_restrictions',
    criticality: 'required',
    reasonCodes: ['traveler_vehicle_dimension'],
  };
  const bundleWith = (evidence) => ({
    resolutions: [{ requirementId: 'req-vehicle-1', status: 'satisfied_fresh', authorityClasses: ['official_owner'] }],
    evidence,
  });

  test('a satisfied resolution whose evidence lacks the parsed fact still re-enters the web chain', () => {
    const planned = planWebEvidenceFallbacks({
      requirements: [requirement],
      structuredBundle: bundleWith([
        { entityId: 'nps:park:glac', topic: 'vehicle_restrictions', claim: { normalizedValue: { title: 'Vehicle Reservations' } } },
      ]),
    });
    expect(planned).toHaveLength(1);
  });

  test('once any bundle evidence for the entity carries a vehicle_dimension fact, the chain stops', () => {
    const planned = planWebEvidenceFallbacks({
      requirements: [requirement],
      structuredBundle: bundleWith([
        { entityId: 'nps:park:glac', topic: 'activities', claim: { normalizedValue: { operationalFacts: [{ type: 'vehicle_dimension', dimension: { kind: 'length', maxLengthFeet: 21 }, subject: { name: 'Going-to-the-Sun Road' } }] } } },
      ]),
    });
    expect(planned).toHaveLength(0);
  });
});

describe('bounded multi-page official follow', () => {
  const { pickOfficialFollowCandidates } = require('../providers/webEvidenceProviderShared');
  const candidate = (url) => ({ source: { url } });

  test('returns up to the limit of distinct official pages, nps.gov first', () => {
    const picked = pickOfficialFollowCandidates([
      candidate('https://www.recreation.gov/timed-entry/1'),
      candidate('https://www.nps.gov/glac/planyourvisit/vehicle-reservations2026.htm'),
      candidate('https://www.nps.gov/glac/planyourvisit/directions.htm'),
      candidate('https://www.nps.gov/glac/planyourvisit/directions.htm'),
      candidate('https://www.nps.gov/glac/planyourvisit/logan2026faq.htm'),
      candidate('https://www.nps.gov/glac/planyourvisit/gtsrinfo.htm'),
    ], 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((p) => p.sourceUrl)).size).toBe(3);
    for (const p of picked) expect(p.sourceUrl).toMatch(/nps\.gov/);
  });

  test('single-candidate behavior matches the existing picker', () => {
    const picked = pickOfficialFollowCandidates([candidate('https://www.nps.gov/glac/planyourvisit/gtsrinfo.htm')], 3);
    expect(picked).toHaveLength(1);
  });
});

describe('official page text yields a frozen vehicle_dimension fact', () => {
  const GTSR_PAGE = {
    url: 'https://www.nps.gov/glac/planyourvisit/goingtothesunroad.htm',
    title: 'Going-to-the-Sun Road - Glacier National Park (U.S. National Park Service)',
    text: 'Vehicle Size Restrictions. Vehicles, and vehicle combinations, longer than 21 feet (6.4 m) or wider than 8 feet (2.4 m) are prohibited between Avalanche Campground and Rising Sun. Free shuttle service operates along the road in summer.',
    status: 200,
  };

  const provider = () => createDirectOfficialPageEvidenceProvider({
    officialPageClient: { fetchPage: async () => GTSR_PAGE },
    stageRaw: async () => ({ rawPayloadHash: 'hash-p05' }),
    now: () => NOW,
  });

  const requirement = {
    entity: { entityId: 'nps:park:glac', displayName: 'Glacier National Park' },
    topic: 'vehicle_restrictions',
    evidenceTypes: ['rule'],
    webScope: { sourceUrl: GTSR_PAGE.url },
  };

  test('normalize produces operationalFacts with the parsed limit and road subject', async () => {
    const p = provider();
    const request = p.buildRequest(requirement);
    const { raw, metadata } = await p.fetch(request, {});
    const candidates = p.normalize(raw, request, metadata);
    expect(candidates.length).toBeGreaterThan(0);

    const facts = candidates.flatMap((c) => c?.claim?.normalizedValue?.operationalFacts || []);
    const dimension = facts.find((f) => f.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION);
    expect(dimension).toBeDefined();
    expect(dimension.dimension).toMatchObject({ kind: 'length', maxLengthFeet: 21 });
    // 4T identity: the subject is the road the page is about, name-normalized
    // from the official title — never broad token containment.
    expect(dimension.subject.name).toBe('Going-to-the-Sun Road');
    expect(dimension.subject.parkCode).toBe('glac');
  });

  test('a general page names the road from the rule’s own context, not the page title', async () => {
    // Glacier's directions.htm: generic title, road named just before the rule.
    const p = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: async () => ({
        ...GTSR_PAGE,
        title: 'Directions, Transportation, & Road Conditions - Glacier National Park (U.S. National Park Service)',
        text: 'Are there restrictions on Going-to-the-Sun Road? Specific Vehicle Size Limits 21 ft (6.4 m) long. Vehicles and vehicle combinations longer than 21 feet (including bumpers) or wider than 8 feet (including mirrors) are prohibited between Avalanche Creek and Rising Sun.',
      }) },
      stageRaw: async () => ({ rawPayloadHash: 'hash-p05e' }),
      now: () => NOW,
    });
    const request = p.buildRequest(requirement);
    const { raw, metadata } = await p.fetch(request, {});
    const facts = p.normalize(raw, request, metadata).flatMap((c) => c?.claim?.normalizedValue?.operationalFacts || []);
    expect(facts[0]?.subject?.name).toBe('Going-to-the-Sun Road');
  });

  test('page-descriptor title suffixes do not pollute the subject identity', async () => {
    // The real page is titled "Going-to-the-Sun Road General Info - Glacier
    // National Park (U.S. National Park Service)"; the subject is the road.
    const p = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: async () => ({ ...GTSR_PAGE, title: 'Going-to-the-Sun Road General Info - Glacier National Park (U.S. National Park Service)' }) },
      stageRaw: async () => ({ rawPayloadHash: 'hash-p05c' }),
      now: () => NOW,
    });
    const request = p.buildRequest(requirement);
    const { raw, metadata } = await p.fetch(request, {});
    const facts = p.normalize(raw, request, metadata).flatMap((c) => c?.claim?.normalizedValue?.operationalFacts || []);
    expect(facts[0]?.subject?.name).toBe('Going-to-the-Sun Road');
  });

  test('a limit stated deep in the page still parses; stored claim text stays bounded', async () => {
    // Glacier's directions.htm states the rule at ~char 4050 of stripped text.
    const padded = `${'Navigation and park introduction. '.repeat(140)}${GTSR_PAGE.text}`;
    const p = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: async () => ({ ...GTSR_PAGE, text: padded.slice(0, 8000) }) },
      stageRaw: async () => ({ rawPayloadHash: 'hash-p05d' }),
      now: () => NOW,
    });
    const request = p.buildRequest(requirement);
    const { raw, metadata } = await p.fetch(request, {});
    const candidates = p.normalize(raw, request, metadata);
    const facts = candidates.flatMap((c) => c?.claim?.normalizedValue?.operationalFacts || []);
    expect(facts.find((f) => f.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION)).toBeDefined();
    expect(String(candidates[0].claim.text).length).toBeLessThanOrEqual(4000);
  });

  test('an official page without limit language produces no dimension fact', async () => {
    const p = createDirectOfficialPageEvidenceProvider({
      officialPageClient: { fetchPage: async () => ({ ...GTSR_PAGE, text: 'The road offers spectacular views of glacially carved valleys. Shuttle service available.' }) },
      stageRaw: async () => ({ rawPayloadHash: 'hash-p05b' }),
      now: () => NOW,
    });
    const request = p.buildRequest(requirement);
    const { raw, metadata } = await p.fetch(request, {});
    const candidates = p.normalize(raw, request, metadata);
    const facts = candidates.flatMap((c) => c?.claim?.normalizedValue?.operationalFacts || []);
    expect(facts.find((f) => f.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION)).toBeUndefined();
  });
});
