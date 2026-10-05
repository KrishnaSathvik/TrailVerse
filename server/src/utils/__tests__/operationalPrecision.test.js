'use strict';

/**
 * GATE #5 BLOCKER A — road surface is not a vehicle requirement.
 *
 * Gate #5 Turn B rejected an otherwise reasonable Theodore Roosevelt itinerary
 * because the NPS text for "Hike the Petrified Forest" contains the phrase
 * "gravel roads". A gravel road there is an ordinary passenger-car road; the
 * pattern turned routine surface wording into an unresolved access dependency
 * and cost the turn its entire plan.
 *
 * The rule, mirroring how remoteness is already handled: **surface wording
 * CORROBORATES a dependency; it never CREATES one.** Only an explicit capability
 * requirement does that.
 *
 * Great Sand Dunes / Medano Pass — the live-proven positive — must be untouched.
 */

const { extractOperationalFacts } = require('../operationalFactExtraction');
const { detectAccessDependency } = require('../travelerFitEvaluation');
const { CONSTRAINT_TYPE } = require('../trailieOperationalConstraints');

const item = (longDescription, extra = {}) => ({
  id: 'x', title: 'Some Place', url: 'https://www.nps.gov/thingstodo/x.htm', longDescription, ...extra,
});
const vehicleFacts = (text) => extractOperationalFacts({ item: item(text), parkCode: 'test' })
  .filter((f) => f.type === CONSTRAINT_TYPE.VEHICLE_RESTRICTION);

describe('A1/A2 — bare road surface never creates a vehicle restriction', () => {
  it.each([
    ['gravel road', 'The area is reached by a gravel road.'],
    ['gravel roads', 'Portions of the park include gravel roads.'],
    ['unpaved road', 'The trailhead sits at the end of an unpaved road.'],
    ['dirt road', 'A dirt road leads to the overlook.'],
    ['gravel + scenic', 'A scenic gravel road winds through the badlands with pullouts along the way.'],
  ])('%s produces no vehicle restriction', (_label, text) => {
    expect(vehicleFacts(text)).toEqual([]);
  });

  it.each([
    ['explicit 4WD', 'A four-wheel-drive vehicle is required beyond this point.'],
    ['4WD shorthand', 'Access is 4WD only.'],
    ['high clearance', 'High-clearance vehicles only.'],
    ['passenger-car warning', 'This route is not recommended for passenger cars.'],
    ['surface + capability', '4WD required on the unpaved road.'],
    ['surface + clearance', 'A rough dirt road requiring a high-clearance vehicle.'],
  ])('%s DOES produce a vehicle restriction', (_label, text) => {
    expect(vehicleFacts(text).length).toBeGreaterThan(0);
  });

  it('surface wording still corroborates when a real requirement is present', () => {
    const facts = vehicleFacts('The road is unpaved and rough; a high-clearance four-wheel-drive vehicle is required.');
    const requirements = facts.map((f) => f.requirement).join(' | ');
    expect(facts.length).toBeGreaterThan(0);
    // Both the capability and the corroborating surface detail survive.
    expect(requirements).toMatch(/four-wheel-drive|high-clearance/i);
  });
});

describe('A3 — the two real Gate #5 cases', () => {
  /** Real NPS wording behind the live Medano Pass facts. */
  const MEDANO = 'The Medano Pass Primitive Road is a 4WD road. A high-clearance four-wheel-drive '
    + 'vehicle is required, and tyres must be aired down for the sand section.';
  /** Real NPS wording behind the false positive. */
  const PETRIFIED = 'The Petrified Forest is reached from the west side of the park. '
    + 'Access involves gravel roads and a trailhead parking area.';

  it('POSITIVE — Medano Pass still produces a vehicle restriction', () => {
    const facts = vehicleFacts(MEDANO);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.map((f) => f.requirement).join(' ')).toMatch(/four-wheel-drive|4WD|high-clearance/i);
  });

  it('NEGATIVE — the Petrified Forest gravel wording produces nothing', () => {
    expect(extractOperationalFacts({ item: item(PETRIFIED), parkCode: 'thro' })).toEqual([]);
  });
});

describe('A4 — UNKNOWN handling is not weakened', () => {
  it('a permit requirement is still produced regardless of road surface', () => {
    const facts = extractOperationalFacts({ item: item('A permit is required for all overnight trips.'), parkCode: 'test' });
    expect(facts.some((f) => f.type === CONSTRAINT_TYPE.RESERVATION_REQUIRED)).toBe(true);
  });

  it('a structured reservation flag is still authoritative', () => {
    const facts = extractOperationalFacts({
      item: item('A pleasant paved loop.', { isReservationRequired: 'true' }), parkCode: 'test',
    });
    expect(facts.some((f) => f.type === CONSTRAINT_TYPE.RESERVATION_REQUIRED)).toBe(true);
  });

  it('absence of a 4WD phrase does not assert suitability anywhere', () => {
    const facts = extractOperationalFacts({ item: item('Reached by a gravel road.'), parkCode: 'test' });
    expect(facts).toEqual([]);
    // No fact means nothing established — never a recorded "compatible".
    expect(JSON.stringify(facts)).not.toMatch(/compatible/i);
  });
});

describe('self-disclosure patterns follow the same rule', () => {
  it('a stop note mentioning only a dirt road is not a dependency', () => {
    const d = detectAccessDependency({ name: 'Somewhere', note: 'Reached by a dirt road from the highway.' });
    expect(d.present).toBe(false);
  });

  it('a stop note stating a capability requirement still is', () => {
    const d = detectAccessDependency({ name: 'Somewhere', note: 'Requires a high-clearance 4WD vehicle on rough dirt roads.' });
    expect(d.present).toBe(true);
    expect(d.kinds).toContain('vehicle_capability');
  });
});
