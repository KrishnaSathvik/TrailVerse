'use strict';

const { extractOperationalFacts } = require('../operationalFactExtraction');
const { classifyCandidateFit, FIT, evaluateTravelerFit, buildTravelerFitRepairInstructions } = require('../travelerFitEvaluation');
const { CONSTRAINT_TYPE } = require('../trailieOperationalConstraints');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');

/**
 * P0-5 wiring (audit 2026-08-31): the 24-ft RV / 21-ft Going-to-the-Sun Road
 * case. The official limit must become a structured operational fact; the
 * traveler's vehicle must become canonical state; and an exceeded limit must
 * be a position-independent INCOMPATIBLE verdict that shapes construction via
 * repair instructions naming both numbers — never a prose caveat.
 */

const GTSR_ITEM = {
  id: 'F1D269CE-3893-4D30-BA06-67C6A2FBBEC8',
  title: 'Going-to-the-Sun Road',
  url: 'https://www.nps.gov/glac/planyourvisit/goingtothesunroad.htm',
  longDescription:
    'This iconic road crosses Logan Pass. Vehicles, and vehicle combinations, longer than 21 feet (6.4 m) are prohibited between Avalanche Campground and Rising Sun.',
};

const factsFor = (item) => extractOperationalFacts({ item, parkCode: 'glac' });
const dimensionFact = () => factsFor(GTSR_ITEM).find((f) => f.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION);

describe('official length limits become structured vehicle_dimension facts', () => {
  test('the GTSR wording produces a machine-readable 21 ft maximum', () => {
    const fact = dimensionFact();
    expect(fact).toBeDefined();
    expect(fact.dimension).toMatchObject({ kind: 'length', maxLengthFeet: 21 });
    expect(fact.plannerRule).toContain('21');
  });

  test('an item without limit language produces no dimension fact', () => {
    const facts = factsFor({ id: 'x', title: 'Apgar Visitor Center', longDescription: 'A lovely visitor center with exhibits.' });
    expect(facts.find((f) => f.type === CONSTRAINT_TYPE.VEHICLE_DIMENSION)).toBeUndefined();
  });
});

describe('dimension fit is arithmetic, not capability matching', () => {
  const stop = { name: 'Going-to-the-Sun Road scenic drive' };
  const verdictFor = (userPrompt) => classifyCandidateFit({
    stop,
    constraints: {},
    userPrompt,
    authoritativeFacts: [dimensionFact()],
  });

  test('24-ft RV against the 21-ft limit is INCOMPATIBLE with both numbers stated', () => {
    const verdict = verdictFor('Plan 4 days in Glacier with our 24-foot RV.');
    expect(verdict.fit).toBe(FIT.INCOMPATIBLE);
    const requirement = verdict.requirements.find((r) => r.kind === 'vehicle_dimension');
    expect(requirement).toBeDefined();
    expect(requirement.requirement).toContain('24');
    expect(requirement.requirement).toContain('21');
  });

  test('20-ft RV is compatible', () => {
    expect(verdictFor('Plan 4 days in Glacier with our 20-foot RV.').fit).toBe(FIT.COMPATIBLE);
  });

  test('an RV of unstated length keeps the requirement as UNKNOWN (fail-closed)', () => {
    const verdict = verdictFor('Plan 4 days in Glacier — we are bringing our RV.');
    expect(verdict.fit).toBe(FIT.UNKNOWN);
  });

  test('no oversized vehicle mentioned → the limit does not block an ordinary car', () => {
    expect(verdictFor('Plan 4 days in Glacier for two hikers.').fit).toBe(FIT.COMPATIBLE);
  });

  test('unit conversion: a 7.3 m camper is incompatible with the 21 ft limit', () => {
    expect(verdictFor('Plan Glacier for us — we rented a 7.3 m camper.').fit).toBe(FIT.INCOMPATIBLE);
  });
});

describe('decorated stop labels bind to the road entity (4T decoration, not containment)', () => {
  const { indexFactsByPlace, bindFactsToStop } = require('../operationalFactExtraction');
  const facts = factsFor(GTSR_ITEM);
  const index = () => indexFactsByPlace({
    facts,
    bundle: { evidence: [{ claim: { normalizedValue: { operationalFacts: facts } } }] },
  });

  test.each([
    'Going-to-the-Sun Road scenic drive',
    'Going-to-the-Sun Road west-side orientation drive',
    'Going-to-the-Sun Road scenic day',
    'Going-to-the-Sun Road to Logan Pass',
  ])('%j binds the road fact', (stopName) => {
    const bound = bindFactsToStop({ name: stopName }, index());
    expect(bound.facts.length).toBeGreaterThan(0);
  });

  test('a stop stamped with the catalog entity still binds a page-derived fact (identity join via bundle labels)', () => {
    // The fit layer is entity-first: a stop carrying a catalog entityId skips
    // name matching entirely. A page-derived fact has a synthetic subject id,
    // so without joining through the bundle's own label→entity declarations
    // the fact silently unbinds — and "Drive Going-to-the-Sun Road" sailed
    // through validation on the repair attempt exactly this way.
    const joined = indexFactsByPlace({
      facts,
      bundle: {
        evidence: [
          { claim: { normalizedValue: { operationalFacts: facts } } },
          { claim: { normalizedValue: { entityId: 'nps:park:glac:thingstodo:ABC123', name: 'Going-to-the-Sun Road' } } },
        ],
      },
    });
    const bound = bindFactsToStop({ name: 'Drive Going-to-the-Sun Road', evidenceEntityId: 'nps:park:glac:thingstodo:ABC123' }, joined);
    expect(bound.facts.length).toBeGreaterThan(0);
  });

  test('a place-forming suffix is a DIFFERENT place and never binds (Phelps trap)', () => {
    const lakeFacts = factsFor({ id: 'p1', title: 'Phelps Lake', longDescription: 'Vehicles over 21 feet are prohibited on this road.' });
    const lakeIndex = indexFactsByPlace({ facts: lakeFacts, bundle: { evidence: [{ claim: { normalizedValue: { operationalFacts: lakeFacts } } }] } });
    expect(bindFactsToStop({ name: 'Phelps Lake Overlook' }, lakeIndex).facts).toHaveLength(0);
    expect(bindFactsToStop({ name: 'Phelps Lake Campground' }, lakeIndex).facts).toHaveLength(0);
  });
});

describe('position independence and repair shaping', () => {
  test('an exceeded limit fails the plan wherever the road appears, with exact numbers in repair text', () => {
    const itineraryData = {
      days: [
        { day: 1, stops: [{ name: 'Apgar Visitor Center' }] },
        { day: 2, stops: [{ name: 'Going-to-the-Sun Road scenic drive', duration: 45 }] },
      ],
    };
    // The persisted evidence shape: facts ride inside
    // evidence[].claim.normalizedValue.operationalFacts.
    const evidenceBundle = {
      evidence: [{ claim: { normalizedValue: { operationalFacts: factsFor(GTSR_ITEM) } } }],
    };
    const result = evaluateTravelerFit({
      itineraryData,
      constraints: {},
      userPrompt: 'Plan 4 days in Glacier in early October with our 24-foot RV.',
      evidenceBundle,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('traveler_fit_incompatible');
    const finding = result.findings.find((f) => /Going-to-the-Sun/i.test(f.stopName));
    expect(finding).toBeDefined();

    const repair = buildTravelerFitRepairInstructions({ reasonCodes: result.reasonCodes, findings: result.findings });
    expect(repair).toContain('24');
    expect(repair).toContain('21');
  });
});

describe('traveler vehicle becomes canonical state', () => {
  test('the Glacier audit prompt yields an explicit vehicle constraint', () => {
    const turn = buildTurnUnderstanding({
      userPrompt: 'Plan 4 days in Glacier in early October with our 24-foot RV. What permits or vehicle restrictions do we need to know about?',
    });
    const vehicle = turn.explicitConstraints.find((c) => c.field === 'vehicle');
    expect(vehicle).toBeDefined();
    expect(vehicle.value).toMatchObject({ kind: 'rv', lengthFeet: 24 });
  });

  test('no vehicle mention yields no vehicle constraint', () => {
    const turn = buildTurnUnderstanding({ userPrompt: 'Plan me 3 days in Zion.' });
    expect(turn.explicitConstraints.find((c) => c.field === 'vehicle')).toBeUndefined();
  });
});
