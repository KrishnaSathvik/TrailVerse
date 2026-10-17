'use strict';

/**
 * PHASE 4T — ENTITY-FIRST OPERATIONAL FACT BINDING.
 *
 * Every control here is one Phase 4S pre-registered, and the fixtures are the
 * real identities and requirements the live Grand Teton bundle carries.
 *
 * The rule under test:
 *
 *     a blocking operational fact must belong to the EXACT place the traveler is
 *     being sent to, not merely to something with a similar name.
 */


const {
  BINDING_MECHANISM, bindFactsToStop, indexFactsByPlace, factsForStop,
  operationalFactsFromBundle, resolveStopEntity, extractOperationalFacts,
} = require('../operationalFactExtraction');
const {
  canonicalEntityKey, entitiesConflict, labelVariants, parseEvidenceEntityId, sameEvidenceEntity,
} = require('../evidenceEntityIdentity');
const { evaluateTravelerFit } = require('../travelerFitEvaluation');

// Public normalized evidence only; no capture session, request, or database metadata.
const BUNDLE = require('./fixtures/operational-binding-evidence.json');
const indexOf = (bundle) => indexFactsByPlace({ facts: operationalFactsFromBundle(bundle), bundle });
const INDEX = indexOf(BUNDLE);

const entityOf = (name) => (BUNDLE.evidence
  .find((e) => e?.claim?.normalizedValue?.name === name)?.claim?.normalizedValue?.entityId) ?? null;

describe('the identity primitive', () => {
  it('ignores the collection namespace — `place` and `thingstodo` are one record', () => {
    const fact = 'nps:park:grte:place:A58D2B71-B34E-4FD3-8DA3-C303FA1EBEFD';
    const evidence = 'nps:park:grte:thingstodo:A58D2B71-B34E-4FD3-8DA3-C303FA1EBEFD';
    expect(sameEvidenceEntity(fact, evidence)).toBe(true);
    expect(canonicalEntityKey(fact)).toBe(canonicalEntityKey(evidence));
    expect(parseEvidenceEntityId(evidence)).toMatchObject({ provider: 'nps', parkCode: 'grte', namespace: 'thingstodo' });
  });

  it('refuses a positional fallback id as an identity', () => {
    // `npsEvidenceProvider` falls back to the item's INDEX when NPS supplies no
    // id. A position is not stable across fetches and is not an identity.
    expect(canonicalEntityKey('nps:park:grte:place:7')).toBeNull();
    expect(sameEvidenceEntity('nps:park:grte:place:7', 'nps:park:grte:thingstodo:7')).toBe(false);
  });

  it('reports a conflict only when BOTH sides carry an identity', () => {
    expect(entitiesConflict('nps:park:grte:place:A', 'nps:park:grte:place:B')).toBe(true);
    expect(entitiesConflict('nps:park:grte:place:A', null)).toBe(false);
    expect(entitiesConflict(null, null)).toBe(false);
  });

  it('strips a decoration without cutting a place whose own name contains a dash', () => {
    // Phase 4S's classifier mis-read this one; the helper is defined once so the
    // whole name is always compared before any truncation.
    expect(labelVariants('Death Canyon - Static Peak Divide Junction')[0])
      .toBe('death canyon - static peak divide junction');
    expect(labelVariants('Summit Meadow — sunset photography'))
      .toEqual(['summit meadow — sunset photography', 'summit meadow']);
  });
});

describe('CONTROL — same GUID, different evidence namespace', () => {
  it('binds directly', () => {
    const bound = bindFactsToStop({ name: 'Grassy Lake Road' }, INDEX);
    expect(bound.facts.length).toBeGreaterThan(0);
    expect(bound.mechanism).toBe(BINDING_MECHANISM.ENTITY_IDENTIFIER);
    expect(bound.facts.every((f) => f.type === 'vehicle_restriction')).toBe(true);
  });

  it('binds when the stop carries the identifier itself, whatever its label', () => {
    const bound = bindFactsToStop(
      { name: 'an afternoon drive', evidenceEntityId: entityOf('Grassy Lake Road') }, INDEX
    );
    expect(bound.mechanism).toBe(BINDING_MECHANISM.ENTITY_IDENTIFIER);
    expect(bound.facts.length).toBeGreaterThan(0);
  });
});

describe('CONTROL — same-looking name, different GUID (the Phase 4S finding)', () => {
  it('does NOT inherit a 4WD requirement onto Grassy Lake Road Campsites', () => {
    expect(entitiesConflict(entityOf('Grassy Lake Road Campsites'), entityOf('Grassy Lake Road'))).toBe(true);
    expect(factsForStop({ name: 'Grassy Lake Road Campsites' }, INDEX)).toEqual([]);
  });

  it('does NOT inherit permits onto overlooks, trailheads or entrance stations', () => {
    for (const name of [
      'Phelps Lake Overlook',
      'Granite Canyon Trailhead',
      'Granite Canyon Entrance Station',
      'Leigh Lake Trailhead',
      'Colter Bay–Hermitage Point Trailhead',
    ]) {
      expect(factsForStop({ name }, INDEX)).toEqual([]);
    }
  });

  it('still binds the permit to the place that actually owns it', () => {
    for (const name of ['Phelps Lake', 'Granite Canyon', 'Leigh Lake', 'Hermitage Point']) {
      const bound = bindFactsToStop({ name }, INDEX);
      expect(bound.facts.map((f) => f.type)).toContain('reservation_required');
      expect(bound.mechanism).toBe(BINDING_MECHANISM.ENTITY_IDENTIFIER);
    }
  });

  it('never emits the related-place mechanism', () => {
    for (const item of BUNDLE.evidence) {
      const name = item?.claim?.normalizedValue?.name;
      if (!name) continue;
      expect(bindFactsToStop({ name }, INDEX).mechanism).not.toBe(BINDING_MECHANISM.RELATED_PLACE);
    }
  });
});

describe('CONTROL — no identifier anywhere: identity-equivalent name is the fallback', () => {
  const facts = extractOperationalFacts({
    item: {
      id: 'maze-1', title: 'Explore the Maze District',
      longDescription: 'Access requires a high-clearance four-wheel-drive vehicle.',
    },
    parkCode: 'cany',
  });
  // A legacy index built from facts alone — no bundle, so no entity resolution
  // for the stop side.
  const legacy = indexFactsByPlace(facts);

  it('binds an exact name', () => {
    const bound = bindFactsToStop({ name: 'The Maze District' }, legacy);
    expect(bound.facts.length).toBeGreaterThan(0);
    expect(bound.mechanism).toBe(BINDING_MECHANISM.IDENTITY_EQUIVALENT_NAME);
  });

  it('binds a decorated exact identity', () => {
    expect(factsForStop({ name: 'The Maze District — remote landscape photography' }, legacy).length)
      .toBeGreaterThan(0);
  });

  it('does NOT bind a merely overlapping name', () => {
    expect(factsForStop({ name: 'The Maze District Overlook' }, legacy)).toEqual([]);
    expect(factsForStop({ name: 'Grand View Point Overlook' }, legacy)).toEqual([]);
  });
});

describe('CONTROL — collision: distinct identities stay distinct', () => {
  it('does not let `placeKey` collapse Murie Ranch and Murie Ranch Hike', () => {
    // `placeKey` strips "hike", so both normalize to "murie ranch". Their
    // identifiers differ, so the entity path keeps them apart.
    expect(entitiesConflict(entityOf('Murie Ranch'), entityOf('Murie Ranch Hike'))).toBe(true);
    expect(resolveStopEntity({ name: 'Murie Ranch' }, INDEX))
      .not.toBe(resolveStopEntity({ name: 'Murie Ranch Hike' }, INDEX));
  });
});

describe('a blocking fact can name its subject', () => {
  const plan = {
    days: [{
      day: 1,
      stops: [
        { name: 'Jenny Lake Loop', type: 'hike', duration: 90, note: 'n', why: 'w' },
        { name: 'Grassy Lake Road', type: 'scenic_drive', duration: 30, note: 'n', why: 'w' },
      ],
    }],
  };

  it('carries direct provenance on a hard-capability finding', () => {
    const result = evaluateTravelerFit({
      itineraryData: plan, constraints: { durationDays: 1 },
      userPrompt: 'Plan a day in Grand Teton.', evidenceBundle: BUNDLE,
    });
    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.stopName === 'Grassy Lake Road');
    expect(finding.requirements[0].binding).toMatchObject({
      relationship: 'direct',
      mechanism: BINDING_MECHANISM.ENTITY_IDENTIFIER,
      subjectName: 'Grassy Lake Road',
    });
  });

  it('a HARD_CAPABILITY requirement is never bound by anything but a direct relationship', () => {
    const result = evaluateTravelerFit({
      itineraryData: plan, constraints: { durationDays: 1 },
      userPrompt: 'Plan a day in Grand Teton.', evidenceBundle: BUNDLE,
    });
    const hard = [...result.findings.flatMap((f) => f.requirements || []), ...(result.requirements || [])]
      .filter((r) => r.dependencyClass === 'hard_capability');
    expect(hard.length).toBeGreaterThan(0);
    for (const requirement of hard) expect(requirement.binding.relationship).toBe('direct');
  });

  it('the neighbouring campsite is now clean', () => {
    const result = evaluateTravelerFit({
      itineraryData: {
        days: [{
          day: 1,
          stops: [
            { name: 'Jenny Lake Loop', type: 'hike', duration: 90, note: 'n', why: 'w' },
            { name: 'Grassy Lake Road Campsites', type: 'campground', duration: 30, note: 'n', why: 'w' },
          ],
        }],
      },
      constraints: { durationDays: 1 },
      userPrompt: 'Plan a day in Grand Teton.',
      evidenceBundle: BUNDLE,
    });
    expect(result.ok).toBe(true);
    expect(result.reasonCodes).toEqual([]);
  });
});

describe('the repair path does not depend on names at all', () => {
  const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
  const { resolveCoverageRepairScope, applyDayContainedCoverageRepair } = require('../dayContainedCoverageRepair');

  it('stamps the catalogue entity onto a merged stop, and that identity binds', () => {
    const plan = {
      days: [
        { day: 1, stops: [{ name: 'Jenny Lake Visitor Center', type: 'visitor_center', duration: 45, note: 'n', why: 'w' }] },
        { day: 2, stops: [{ name: 'Taggart Lake', type: 'hike', duration: 120, note: 'n', why: 'w' }, { name: 'Snake River Overlook', type: 'viewpoint', duration: 45, note: 'n', why: 'w' }] },
      ],
    };
    const scope = resolveCoverageRepairScope({
      itineraryData: plan,
      dayDiagnostics: [{ dayNumber: 1, codes: ['insufficient_day_coverage'], coverageReasonCode: 'single_short_experience_alone' }],
      reasonCodes: ['insufficient_day_coverage'],
    });
    const catalog = buildEvidenceBoundRepairCandidates({ bundle: BUNDLE, candidatePlan: plan, repairScope: scope });
    const restricted = catalog.candidates.find((c) => c.canonicalName === 'Grassy Lake Road');
    expect(restricted).toBeTruthy();

    const merged = applyDayContainedCoverageRepair({
      itineraryData: plan, scope, candidates: catalog.candidates,
      dayRepairs: [{ dayRef: 1, operations: [{ op: 'add_stop', stop: { placeRef: restricted.ref, durationMinutes: 45, note: 'n', why: 'w' } }] }],
    });
    expect(merged.ok).toBe(true);
    const added = merged.plan.days[0].stops.at(-1);
    expect(added.evidenceEntityId).toBe(restricted.entityId);
    // The binding is now an identifier comparison, not a name match.
    expect(bindFactsToStop(added, INDEX).mechanism).toBe(BINDING_MECHANISM.ENTITY_IDENTIFIER);
  });
});
