'use strict';

/**
 * OPERATIONAL FACT PRODUCTION.
 *
 * `trailieOperationalConstraints` has owned `VEHICLE_RESTRICTION`,
 * `RESERVATION_REQUIRED` and `ACCESS_UNCERTAIN` all along, and
 * `finalizeItinerary` consumes operational rules. But `OFFICIAL_RULES` is empty
 * and `constraints.operationalEvidence` is read in two places and written in
 * none — so the vocabulary resolves to `[]` on every turn.
 *
 * The data was never missing. `_getParkEvidenceListPaginated` pushes NPS items
 * through RAW, and the product's own activity page already renders
 * `isReservationRequired`, `seasonDescription` and `accessibilityInformation`.
 * The Trailie evidence provider simply never read them: it takes
 * `shortDescription || description` (dropping `longDescription`, where NPS puts
 * access detail) and `item.accessibility`, a field NPS does not supply under
 * that name.
 *
 * This module is the missing producer.
 */

const {
  extractOperationalFacts,
  indexFactsByPlace,
  factsForStop,
  OPERATIONAL_FACT_CONFIDENCE,
} = require('../operationalFactExtraction');
const { CONSTRAINT_TYPE } = require('../trailieOperationalConstraints');

/** Real NPS /thingstodo field shape. */
const mazeItem = {
  id: 'maze-1',
  title: 'Explore the Maze District',
  shortDescription: 'Remote canyon scenery and backcountry exploration.',
  longDescription: 'The Maze is one of the most remote and inaccessible areas in the country. '
    + 'Access requires a high-clearance four-wheel-drive vehicle and travel on rough, unpaved roads. '
    + 'A permit is required for all overnight trips. There is no water, food, or fuel available.',
  url: 'https://www.nps.gov/thingstodo/maze-1.htm',
  isReservationRequired: 'false',
  latitude: 38.2, longitude: -110.2,
};

const paradiseItem = {
  id: 'pd-1',
  title: 'Drive the Newfound Gap Road',
  shortDescription: 'A paved scenic drive across the crest of the mountains.',
  longDescription: 'This paved road climbs from Cherokee to Gatlinburg with overlooks along the way.',
  url: 'https://www.nps.gov/thingstodo/pd-1.htm',
  isReservationRequired: 'false',
};

const permitItem = {
  id: 'pm-1',
  title: 'Hike to the summit',
  shortDescription: 'A popular summit hike.',
  isReservationRequired: 'true',
  reservationDescription: 'A day-use permit must be reserved in advance on Recreation.gov.',
  url: 'https://www.nps.gov/thingstodo/pm-1.htm',
};

describe('extractOperationalFacts — reads what the provider was dropping', () => {
  it('produces a vehicle restriction from official long description text', () => {
    const facts = extractOperationalFacts({ item: mazeItem, parkCode: 'cany' });
    const vehicle = facts.find((f) => f.type === CONSTRAINT_TYPE.VEHICLE_RESTRICTION);
    expect(vehicle).toBeTruthy();
    expect(vehicle.requirement).toMatch(/four-wheel-drive|high-clearance/i);
    expect(vehicle.provenance.field).toBe('longDescription');
    expect(vehicle.provenance.sourceUrl).toBe(mazeItem.url);
    expect(vehicle.subject.name).toBe('Explore the Maze District');
  });

  it('produces a permit dependency and a self-sufficiency note for the same place', () => {
    const kinds = extractOperationalFacts({ item: mazeItem, parkCode: 'cany' }).map((f) => f.type);
    expect(kinds).toEqual(expect.arrayContaining([
      CONSTRAINT_TYPE.VEHICLE_RESTRICTION,
      CONSTRAINT_TYPE.RESERVATION_REQUIRED,
      CONSTRAINT_TYPE.ACCESS_UNCERTAIN,
    ]));
  });

  it('trusts the structured reservation flag over prose', () => {
    const facts = extractOperationalFacts({ item: permitItem, parkCode: 'test' });
    const permit = facts.find((f) => f.type === CONSTRAINT_TYPE.RESERVATION_REQUIRED);
    expect(permit).toBeTruthy();
    expect(permit.confidence).toBe(OPERATIONAL_FACT_CONFIDENCE.STATED);
    expect(permit.provenance.field).toBe('isReservationRequired');
  });

  it('produces NOTHING for an ordinary paved scenic drive', () => {
    expect(extractOperationalFacts({ item: paradiseItem, parkCode: 'grsm' })).toEqual([]);
  });

  it('never invents a fact from a title alone', () => {
    expect(extractOperationalFacts({
      item: { id: 'x', title: 'Remote Backcountry Overlook', url: 'u' }, parkCode: 'x',
    })).toEqual([]);
  });

  it('carries provenance and authority on every fact', () => {
    for (const f of extractOperationalFacts({ item: mazeItem, parkCode: 'cany' })) {
      expect(f.provenance.authority).toBe('official_owner');
      expect(f.provenance.sourceUrl).toBeTruthy();
      expect(Object.values(OPERATIONAL_FACT_CONFIDENCE)).toContain(f.confidence);
      expect(f.subject.entityId).toContain('cany');
    }
  });
});

describe('factsForStop — binding facts to a plan stop by identity, not by its prose', () => {
  const facts = extractOperationalFacts({ item: mazeItem, parkCode: 'cany' });
  const index = indexFactsByPlace(facts);

  it('matches a stop whose name refers to the same place', () => {
    for (const name of ['The Maze district', 'The Maze District — remote landscape photography', 'Maze District']) {
      expect(factsForStop({ name }, index).length).toBeGreaterThan(0);
    }
  });

  it('does NOT match an unrelated stop', () => {
    for (const name of ['Grand View Point Overlook', 'Island in the Sky Visitor Center', 'The Needles Visitor Center']) {
      expect(factsForStop({ name }, index)).toEqual([]);
    }
  });

  /**
   * A1 — THE POINT OF THE WHOLE PHASE.
   * The requirement is a property of the PLACE. It does not stop being true
   * because the generated note happened not to mention it.
   */
  it('binds regardless of whether the stop discloses the dependency itself', () => {
    const disclosed = { name: 'The Maze district', note: 'Reached by rough dirt roads; check conditions.' };
    const silent = { name: 'The Maze district', note: 'Remote canyon scenery and photography.' };
    expect(factsForStop(disclosed, index).length).toBe(factsForStop(silent, index).length);
    expect(factsForStop(silent, index).length).toBeGreaterThan(0);
  });
});
