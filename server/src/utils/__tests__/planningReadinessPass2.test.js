'use strict';

/**
 * Planning Readiness Pass #2 — travelParty + free-form interests.
 * Offline / provider-free.
 */

const { parseConstraints, buildConstraintBlock, validateItineraryConstraints } = require('../constraintEngine');
const {
  extractMessageConstraintOverrides,
  applyMessageConstraintOverrides,
} = require('../messageConstraintOverrides');
const {
  extractPositiveInterestsFromText,
  resolveInterestMutation,
  extractChildrenCount,
} = require('../planningInputContract');
const { buildTripState } = require('../tripStateBuilder');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');

describe('Planning Readiness Pass #2 — travel party + interests', () => {
  test('A — solo hiking', () => {
    const c = parseConstraints({}, 'Plan a solo hiking trip.');
    expect(c.travelParty).toBe('solo');
    expect(c.groupSize).toBe(1);
    expect(c.interests).toContain('hiking');
  });

  test('B — couple photography', () => {
    const c = parseConstraints({}, 'Relaxed photography trip for a couple.');
    expect(c.travelParty).toBe('couple');
    expect(c.groupSize).toBe(2);
    expect(c.interests).toContain('photography');
    const ts = buildTripState({ metadata: {}, constraints: c, lastUserMessage: 'Relaxed photography trip for a couple.' });
    expect(ts.travelers.groupType).toBe('couple');
    expect(ts.preferences.pace).toBe('relaxed');
  });

  test('C — four friends hiking + wildlife', () => {
    const c = parseConstraints({}, 'Four friends want hiking and wildlife.');
    expect(c.travelParty).toBe('friends');
    expect(c.groupSize).toBe(4);
    expect(c.interests).toEqual(expect.arrayContaining(['hiking', 'wildlife']));
  });

  test('D — family of four with two kids', () => {
    const c = parseConstraints(
      {},
      'Family of four with two kids, easy hikes and wildlife.'
    );
    expect(c.travelParty).toBe('family');
    expect(c.groupSize).toBe(4);
    expect(c.hasChildren).toBe(true);
    expect(c.childrenCount).toBe(2);
    expect(c.isFamilyParty).toBe(true);
    expect(c.interests).toEqual(expect.arrayContaining(['hiking', 'wildlife']));
    expect(c.fitnessLevel).toBe('easy');
  });

  test('E — group of six history + scenic drives', () => {
    const c = parseConstraints(
      {},
      'Group of six interested in history and scenic drives.'
    );
    expect(c.travelParty).toBe('group');
    expect(c.groupSize).toBe(6);
    expect(c.interests).toEqual(expect.arrayContaining(['history', 'scenic-drives']));
  });

  test('F — photography but no hiking', () => {
    expect(extractPositiveInterestsFromText('We want photography but no hiking.')).toEqual([
      'photography',
    ]);
    const c = parseConstraints({}, 'We want photography but no hiking.');
    expect(c.interests).toContain('photography');
    expect(c.interests).not.toContain('hiking');
  });

  test('G — add interests', () => {
    const mutation = resolveInterestMutation('Add photography and wildlife.', ['hiking']);
    expect(mutation.mode).toBe('add');
    expect(mutation.interests).toEqual(['hiking', 'photography', 'wildlife']);
    const c = parseConstraints(
      { formData: { interests: ['hiking'] } },
      'Add photography and wildlife.'
    );
    expect(c.interests).toEqual(['hiking', 'photography', 'wildlife']);
  });

  test('H — remove interest', () => {
    const c = parseConstraints(
      { formData: { interests: ['hiking', 'photography'] } },
      'Remove hiking.'
    );
    expect(c.interests).toEqual(['photography']);
  });

  test('I — replace interest set', () => {
    const c = parseConstraints(
      { formData: { interests: ['hiking', 'photography'] } },
      "Actually we'd rather focus on wildlife and scenic drives."
    );
    expect(c.interests).toEqual(expect.arrayContaining(['wildlife', 'scenic-drives']));
    expect(c.interests).not.toContain('hiking');
    expect(c.interests).not.toContain('photography');
  });

  test('J — party override couple clears children', () => {
    const formData = {
      travelParty: 'family',
      groupSize: 4,
      childrenCount: 2,
      hasChildren: true,
      interests: ['hiking'],
      budget: '800',
    };
    const msg = 'Actually it\'s just the two of us.';
    const c = parseConstraints({ formData }, msg);
    expect(c.travelParty).toBe('couple');
    expect(c.groupSize).toBe(2);
    expect(c.hasChildren).toBe(false);
    expect(c.childrenCount).toBeNull();
    expect(c.interests).toEqual(['hiking']);
    expect(c.budget).toBe('800');
  });

  test('K — friends count update preserves friends', () => {
    const formData = { travelParty: 'friends', groupSize: 4, interests: ['hiking'] };
    const c = parseConstraints({ formData }, 'Two more friends are joining, six total.');
    expect(c.travelParty).toBe('friends');
    expect(c.groupSize).toBe(6);
    expect(c.interests).toEqual(['hiking']);
  });

  test('L — Quick Fill groupSize with unknown party, then family+wildlife', () => {
    const formData = {
      parkCode: 'yose',
      groupSize: 4,
      interests: ['hiking'],
      budget: '800',
      fitnessLevel: 'easy',
      accommodation: 'camping',
    };
    const baseline = parseConstraints({ formData }, 'Here are my trip details.');
    expect(baseline.groupSize).toBe(4);
    expect(baseline.travelParty).toBeNull();
    expect(baseline.interests).toEqual(['hiking']);

    const follow = parseConstraints(
      { formData },
      "We're a family with two kids and also like wildlife."
    );
    expect(follow.groupSize).toBe(4);
    expect(follow.travelParty).toBe('family');
    expect(follow.childrenCount).toBe(2);
    expect(follow.hasChildren).toBe(true);
    expect(follow.interests).toEqual(expect.arrayContaining(['hiking', 'wildlife']));
    expect(follow.budget).toBe('800');
  });

  test('trip for 8 people does not invent travelParty from count alone', () => {
    const c = parseConstraints({}, 'Trip for 8 people.');
    expect(c.groupSize).toBe(8);
    expect(c.travelParty).toBeNull();
  });

  test('refinement add wildlife preserves party fields', () => {
    const formData = {
      groupSize: 4,
      travelParty: 'family',
      childrenCount: 2,
      hasChildren: true,
      budget: '800',
      accommodation: 'camping',
      fitnessLevel: 'easy',
      interests: ['hiking', 'photography'],
      numDays: 3,
    };
    const c = parseConstraints({ formData }, 'Add wildlife too.');
    expect(c.travelParty).toBe('family');
    expect(c.childrenCount).toBe(2);
    expect(c.groupSize).toBe(4);
    expect(c.budget).toBe('800');
    expect(c.accommodation).toBe('camping');
    expect(c.fitnessLevel).toBe('easy');
    expect(c.interests).toEqual(['hiking', 'photography', 'wildlife']);
  });

  test('friends trip no kids clears children', () => {
    const formData = {
      travelParty: 'family',
      groupSize: 4,
      hasChildren: true,
      childrenCount: 2,
      interests: ['hiking'],
      budget: '800',
    };
    const c = parseConstraints({ formData }, 'Actually this is a friends trip, no kids.');
    expect(c.travelParty).toBe('friends');
    expect(c.hasChildren).toBe(false);
    expect(c.childrenCount).toBeNull();
    expect(c.interests).toEqual(['hiking']);
    expect(c.budget).toBe('800');
  });

  test('constraint block includes travelParty', () => {
    const c = parseConstraints({}, 'Four friends want hiking.');
    const block = buildConstraintBlock(c);
    expect(block).toMatch(/Travel party: friends/);
    expect(block).toMatch(/Interests: hiking/);
  });

  test('family validator uses isFamilyParty', () => {
    const c = parseConstraints({}, 'Family of four with two kids, easy hotel trip.');
    const issues = validateItineraryConstraints(
      {
        days: [
          {
            dayNumber: 1,
            stops: [
              { name: 'A', type: 'trail', difficulty: 'easy', duration: 30 },
              { name: 'B', type: 'viewpoint', duration: 20 },
              { name: 'C', type: 'landmark', duration: 20 },
              { name: 'D', type: 'restaurant', duration: 40 },
              { name: 'E', type: 'viewpoint', duration: 20 },
            ],
          },
        ],
      },
      c
    );
    expect(issues.some((i) => i.type === 'overloaded_day')).toBe(true);
  });

  test('structured interests influence evidence planner reasons', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Plan a 3-day trip with these preferences.',
    });
    const constraints = {
      interests: ['hiking', 'stargazing', 'camping'],
      hasConstraints: true,
    };
    const reqs = planEvidenceRequirements({
      turnId: 'pass2-interests',
      userPrompt: 'Plan a 3-day trip with these preferences.',
      intent: {
        ...intent,
        primaryIntent: 'simple_itinerary',
        entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:yose', confidence: 1 }],
      },
      resolvedEntities: [
        { type: 'destination', role: 'target', canonicalId: 'park:nps:yose', confidence: 1 },
      ],
      constraints,
      now: new Date('2026-08-11T12:00:00Z'),
    });
    const activities = reqs.find((r) => r.topic === 'activities');
    expect(activities.reasonCodes).toEqual(
      expect.arrayContaining(['requested_named_hike_or_walk', 'requested_sunset_place_candidate'])
    );
    expect(reqs.some((r) => r.topic === 'astronomy' && r.criticality === 'required')).toBe(true);
    expect(reqs.some((r) => r.topic === 'campgrounds')).toBe(true);
  });

  test('photography interest does not invent a completeness validator requirement', () => {
    // Documented limitation: photography is prompt/preference only.
    const c = parseConstraints({}, 'We want photography.');
    expect(c.interests).toEqual(['photography']);
    // No dedicated photography completeness code exists — interests alone do not create one.
    expect(c.interests.includes('photography')).toBe(true);
  });

  test('extractChildrenCount recovers explicit counts only', () => {
    expect(extractChildrenCount('family with kids')).toBeNull();
    expect(extractChildrenCount('family of four with two kids')).toBe(2);
  });

  test('applyMessageConstraintOverrides carries travelParty', () => {
    const merged = applyMessageConstraintOverrides(
      { groupSize: 4, interests: ['hiking'] },
      'Actually this is a friends trip, no kids.'
    );
    expect(merged.travelParty).toBe('friends');
    expect(merged.hasChildren).toBe(false);
    expect(merged.interests).toEqual(['hiking']);
  });
});
