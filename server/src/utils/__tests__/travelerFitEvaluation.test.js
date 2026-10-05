'use strict';

/**
 * TRAVELER FIT / OPERATIONAL FEASIBILITY.
 *
 * Gate #4, both independent Canyonlands runs, delivered this to a traveler who
 * asked for "three relaxed days ... a couple of easy hikes":
 *
 *   Day 2/3 anchor: "The Maze district", 240 minutes
 *   note: "accessible by dirt roads from UT 24 or Green River, check conditions"
 *   note: "roads and locations rangers confirm are appropriate for your vehicle
 *          and permitted where required"
 *
 * The place is real, the evidence exists, the duration is plausible, and every
 * validator passed it. What no validator asked was whether this traveler can
 * GET there, and whether it should be the thing their day is built around.
 *
 * The rule is deliberately about ANCHORING, not banning. A dependency-bearing
 * place may appear in a plan with its dependency stated. It may not silently
 * become the day's centrepiece for a traveler who never indicated the required
 * capability.
 */

const {
  evaluateTravelerFit,
  detectAccessDependency,
  classifyCandidateFit,
  buildTravelerFitRepairInstructions,
  FIT,
} = require('../travelerFitEvaluation');

const stop = (name, duration, extra = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  order: 1, type: 'viewpoint', name, note: '', startTime: '', duration, ...extra,
});
const plan = (days) => ({ intro: 'x', days });

// PHASE 4G — stated in the shape `parseConstraints` actually produces.
// These fixtures used to say `fitness` and a flat `wheelchair`, which is the
// shape the OFFLINE GATE HARNESSES emit, not production's. The module read that
// same wrong dialect, so the suite passed while the rule was inert on every
// real turn. See canonicalRuntimeProjection.js.
const RELAXED = { pace: 'relaxed', fitnessLevel: 'easy', durationDays: 3 };
const WHEELCHAIR = { ...RELAXED, mobility: { wheelchair: true } };

describe('detectAccessDependency', () => {
  /**
   * REVISED after Gate #5. This expectation used to be `present: true` on the
   * strength of "dirt roads" alone, and that is precisely what rejected a good
   * Theodore Roosevelt itinerary over the phrase "gravel roads". A surface is
   * not a capability requirement — it corroborates one.
   */
  it('does NOT treat a bare surface description as a dependency', () => {
    const d = detectAccessDependency(stop('The Maze district', 240, {
      type: 'photography',
      note: 'The Maze remains accessible by dirt roads from UT 24 or Green River, but check conditions before beginning the drive.',
    }));
    expect(d.present).toBe(false);
  });

  it('reads a specialized-vehicle dependency when the stop states a real requirement', () => {
    const d = detectAccessDependency(stop('The Maze district', 240, {
      type: 'photography',
      note: 'Reached only by rough dirt roads requiring a high-clearance 4WD vehicle.',
    }));
    expect(d.present).toBe(true);
    expect(d.kinds).toEqual(expect.arrayContaining(['vehicle_capability', 'unpaved_or_rough_road']));
  });

  it('reads permit and vehicle-suitability dependencies', () => {
    const d = detectAccessDependency(stop('The Maze district', 240, {
      note: 'using only roads and locations rangers confirm are appropriate for your vehicle and permitted where required.',
    }));
    expect(d.present).toBe(true);
    expect(d.kinds).toEqual(expect.arrayContaining(['vehicle_capability', 'permit']));
  });

  it('reads a self-sufficiency dependency', () => {
    const d = detectAccessDependency(stop('Hans Flat Ranger Station', 45, {
      note: 'Bring what you need: there is no potable water, food, fuel, or trash service here.',
    }));
    expect(d.present).toBe(true);
    expect(d.kinds).toContain('remote_self_sufficiency');
  });

  it('does not fire on ordinary scenic or visitor content', () => {
    for (const s of [
      stop('Grand View Point Overlook', 90, { type: 'viewpoint', note: 'A short paved walk to a wide canyon view.' }),
      stop('Island in the Sky Visitor Center', 45, { type: 'visitor_center', note: 'Maps, exhibits and restrooms.' }),
      stop('Cades Cove Loop Road', 180, { type: 'scenic_drive', note: 'An 11-mile one-way loop through open valley.' }),
      stop('Freeman Homestead Trail', 60, { type: 'trail', note: 'An easy one-mile loop past a historic homestead site.' }),
    ]) {
      expect(detectAccessDependency(s).present).toBe(false);
    }
  });

  it('does not treat the bare word "remote" as an access requirement on its own', () => {
    // "remote landscape photography" is a mood, not a 4WD requirement. Remoteness
    // corroborates a dependency; it does not create one.
    const d = detectAccessDependency(stop('Somewhere', 60, { note: 'A quiet, remote-feeling overlook right off the road.' }));
    expect(d.present).toBe(false);
  });
});

describe('classifyCandidateFit — hard / dependency / unknown / soft (B4, B5)', () => {
  it('is COMPATIBLE when nothing is required', () => {
    expect(classifyCandidateFit({
      stop: stop('Grand View Point Overlook', 90, { type: 'viewpoint' }),
      constraints: RELAXED,
    }).fit).toBe(FIT.COMPATIBLE);
  });

  it('is INCOMPATIBLE when a dependency directly violates an explicit constraint', () => {
    const r = classifyCandidateFit({
      stop: stop('The Maze district', 240, { note: 'Requires a high-clearance 4WD vehicle and a backcountry permit.' }),
      constraints: WHEELCHAIR,
    });
    expect(r.fit).toBe(FIT.INCOMPATIBLE);
  });

  it('is UNKNOWN — never COMPATIBLE — when capability was never established', () => {
    const r = classifyCandidateFit({
      stop: stop('The Maze district', 240, { note: 'A high-clearance 4WD vehicle is required on the unpaved road.' }),
      constraints: RELAXED,
    });
    expect(r.fit).toBe(FIT.UNKNOWN);
    // The single most important property: unknown must not read as "great for you".
    expect(r.fit).not.toBe(FIT.COMPATIBLE);
  });

  it('does not invent numeric thresholds from "relaxed" or "easy"', () => {
    const r = classifyCandidateFit({
      stop: stop('Some Trail', 60, { type: 'trail' }),
      constraints: RELAXED,
    });
    expect(JSON.stringify(r)).not.toMatch(/\b(?:miles|1\.5|2\.0|3000)\b/);
    expect(r.fit).toBe(FIT.COMPATIBLE);
  });
});

describe('evaluateTravelerFit — the anchoring rule', () => {
  const mazeDay = (anchorDuration) => plan([
    {
      day: 1, dayNumber: 1,
      stops: [
        stop('Hans Flat Ranger Station', 45, {
          type: 'visitor_center',
          note: 'Begin with maps at this remote ranger contact station. There is no potable water, food, fuel, or trash service here.',
        }),
        stop('The Maze district', anchorDuration, {
          type: 'photography',
          // States a real capability requirement. A bare "dirt roads" mention is
          // deliberately NOT enough any more — see the Gate #5 gravel-road fix.
          note: 'Reached by rough dirt roads that require a high-clearance four-wheel-drive vehicle.',
        }),
      ],
    },
  ]);

  it('flags an unverified access dependency that has become the day\'s anchor', () => {
    const r = evaluateTravelerFit({
      itineraryData: mazeDay(240),
      constraints: RELAXED,
      userPrompt: 'Give us three relaxed days in Canyonlands with a couple of easy hikes.',
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toContain('unverified_access_dependency');
    const finding = r.findings.find((f) => /Maze/.test(f.stopName));
    expect(finding).toBeTruthy();
    expect(finding.fit).toBe(FIT.UNKNOWN);
    expect(finding.dayNumber).toBe(1);
  });

  /**
   * PHASE 4Q — THIS TEST USED TO ASSERT THE OPPOSITE.
   *
   * The old rule flagged an unverified dependency only when the place had become
   * the day's anchor, so the same 4WD requirement on a 30-minute stop passed.
   * Phase 4P measured that with a real official fact and a real traveler: the
   * whole plan went green. A thirty-minute 4WD road still requires 4WD, so the
   * requirement is now position-independent.
   */
  it('flags the same place even when the day is built around something else', () => {
    const r = evaluateTravelerFit({
      itineraryData: plan([{
        day: 1, dayNumber: 1,
        stops: [
          stop('Grand View Point Trail', 120, { type: 'trail', note: 'An easy rim walk with wide canyon views.' }),
          stop('Grand View Point Overlook', 90, { type: 'viewpoint' }),
          stop('The Maze overlook viewpoint', 30, {
            type: 'viewpoint',
            note: 'Visible in the distance; the district itself needs a high-clearance 4WD vehicle and is not part of this trip.',
          }),
        ],
      }]),
      constraints: RELAXED,
      userPrompt: 'three relaxed days',
    });
    expect(r.reasonCodes).toContain('unverified_access_dependency');
    const finding = r.findings.find((f) => /Maze/.test(f.stopName));
    // Importance survives — as presentation weight, never as existence.
    expect(finding.presentationWeight).toBe('inline');
  });

  /**
   * PHASE 4Q — ALSO INVERTED. `lowEffort` gated whether the requirement existed,
   * so a traveler who simply said nothing about themselves was never warned about
   * any official operational fact, at any position. Pace is not capability.
   */
  it('flags it for a traveler who has said nothing about themselves', () => {
    const r = evaluateTravelerFit({
      itineraryData: mazeDay(240),
      constraints: { durationDays: 3 },
      userPrompt: 'Plan three days in Canyonlands.',
    });
    expect(r.reasonCodes).toContain('unverified_access_dependency');
  });

  it('raises the hard code when an explicit mobility constraint is violated', () => {
    const r = evaluateTravelerFit({
      itineraryData: mazeDay(240),
      constraints: WHEELCHAIR,
      userPrompt: 'three relaxed days, my partner uses a wheelchair',
    });
    expect(r.reasonCodes).toContain('traveler_fit_incompatible');
  });

  it('accepts an ordinary relaxed plan without complaint', () => {
    const r = evaluateTravelerFit({
      itineraryData: plan([{
        day: 1, dayNumber: 1,
        stops: [
          stop('Red Hills Visitor Center', 45, { type: 'visitor_center' }),
          stop('Tucson Mountain District loop drive', 120, { type: 'scenic_drive' }),
          stop('Red Hills Visitor Center Patio — sunset photography', 75, { type: 'photography' }),
        ],
      }]),
      constraints: { pace: 'relaxed', fitness: 'easy', durationDays: 2 },
      userPrompt: 'two relaxed days in Saguaro with sunset photography',
    });
    expect(r.ok).toBe(true);
    expect(r.reasonCodes).toEqual([]);
  });
});

describe('buildTravelerFitRepairInstructions', () => {
  it('asks for the requirement to be honoured, not for the place to be deleted', () => {
    const text = buildTravelerFitRepairInstructions({
      reasonCodes: ['unverified_access_dependency'],
      findings: [{
        dayNumber: 2, stopName: 'The Maze district', fit: FIT.UNKNOWN,
        kinds: ['unpaved_or_rough_road', 'vehicle_capability'],
      }],
    });
    expect(text).toMatch(/Day 2/);
    expect(text).toMatch(/The Maze district/);
    // No longer "make it not the anchor" — the obligation does not depend on that.
    expect(text).toMatch(/cannot appear as an ordinary stop/i);
    expect(text).not.toMatch(/Do not make it the anchor/i);
    // It must not read as "never mention this place".
    expect(text).toMatch(/state the requirement|say so|mention/i);
    // And it must not invent a substitute.
    expect(text).not.toMatch(/instead visit [A-Z]/);
  });

  it('returns nothing when there is nothing to say', () => {
    expect(buildTravelerFitRepairInstructions({ reasonCodes: [] })).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* A1 — the fit layer must not depend on the artifact confessing       */
/* ------------------------------------------------------------------ */

const { extractOperationalFacts } = require('../operationalFactExtraction');

describe('A1 — authoritative facts beat model self-disclosure', () => {
  /** Real NPS /thingstodo shape for a 4WD/permit district. */
  const MAZE_ITEM = {
    id: 'maze-1',
    title: 'Explore the Maze District',
    shortDescription: 'Remote canyon scenery and backcountry exploration.',
    longDescription: 'Access requires a high-clearance four-wheel-drive vehicle on rough, unpaved roads. '
      + 'A permit is required for overnight trips. There is no water, food, or fuel available.',
    url: 'https://www.nps.gov/thingstodo/maze-1.htm',
  };

  const bundleWith = (item, parkCode = 'cany') => ({
    evidence: [{
      topic: 'activities',
      evidenceId: 'e1',
      claim: {
        text: `${item.title}: ${item.shortDescription}`,
        normalizedValue: {
          name: item.title,
          operationalFacts: extractOperationalFacts({ item, parkCode }),
        },
      },
    }],
  });

  const dayAnchoredOn = (note) => plan([{
    day: 2, dayNumber: 2,
    stops: [
      stop('Island in the Sky Visitor Center', 45, { type: 'visitor_center' }),
      stop('The Maze District', 240, { type: 'photography', note }),
    ],
  }]);

  it('CONFESSING artifact — flagged (this already worked)', () => {
    const r = evaluateTravelerFit({
      itineraryData: dayAnchoredOn('Reached by rough dirt roads; check conditions before driving.'),
      constraints: RELAXED,
      userPrompt: 'three relaxed days with a couple of easy hikes',
      evidenceBundle: bundleWith(MAZE_ITEM),
    });
    expect(r.reasonCodes).toContain('unverified_access_dependency');
  });

  /**
   * THE FALSE NEGATIVE THAT MATTERED. Same real place, same real requirement,
   * and the generated note says nothing about it. A self-disclosure-only rule
   * would return COMPATIBLE and ship a 4WD-only district as an ordinary
   * relaxed day. The road did not become paved because the model went quiet.
   */
  it('SILENT artifact — still flagged, from official evidence alone', () => {
    const r = evaluateTravelerFit({
      itineraryData: dayAnchoredOn('Remote canyon scenery and photography.'),
      constraints: RELAXED,
      userPrompt: 'three relaxed days with a couple of easy hikes',
      evidenceBundle: bundleWith(MAZE_ITEM),
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toContain('unverified_access_dependency');
    const finding = r.findings.find((f) => /Maze/i.test(f.stopName));
    expect(finding.source).toBe('official');
    expect(finding.kinds).toEqual(expect.arrayContaining(['vehicle_capability', 'permit']));
  });

  it('the silent artifact is INCOMPATIBLE, not merely unknown, for a wheelchair user', () => {
    const r = evaluateTravelerFit({
      itineraryData: dayAnchoredOn('Remote canyon scenery and photography.'),
      constraints: WHEELCHAIR,
      userPrompt: 'three relaxed days, my partner uses a wheelchair',
      evidenceBundle: bundleWith(MAZE_ITEM),
    });
    expect(r.reasonCodes).toContain('traveler_fit_incompatible');
  });

  it('no authoritative fact does NOT become a clean bill of health', () => {
    // A5 — absence of evidence is not evidence of paved access. With no facts
    // and no self-disclosure the stop is simply not flagged; nothing anywhere
    // records it as verified-suitable.
    const r = evaluateTravelerFit({
      itineraryData: dayAnchoredOn('Remote canyon scenery and photography.'),
      constraints: RELAXED,
      userPrompt: 'three relaxed days',
      evidenceBundle: { evidence: [] },
    });
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    // …and crucially nothing claims COMPATIBLE was established.
    const verdict = classifyCandidateFit({
      stop: { name: 'The Maze District', note: 'Remote canyon scenery.' },
      constraints: RELAXED,
      authoritativeFacts: [],
    });
    expect(verdict.dependency.source).toBe('none');
  });

  it('an ordinary paved scenic drive produces no facts and no findings', () => {
    const paved = {
      id: 'pd-1', title: 'Newfound Gap Road',
      shortDescription: 'A paved scenic drive across the crest.',
      longDescription: 'This paved road climbs from Cherokee to Gatlinburg with overlooks along the way.',
      url: 'https://www.nps.gov/thingstodo/pd-1.htm',
    };
    expect(extractOperationalFacts({ item: paved, parkCode: 'grsm' })).toEqual([]);
    const r = evaluateTravelerFit({
      itineraryData: plan([{ day: 1, dayNumber: 1, stops: [stop('Newfound Gap Road', 150, { type: 'scenic_drive' })] }]),
      constraints: RELAXED,
      userPrompt: 'four easygoing days',
      evidenceBundle: bundleWith(paved, 'grsm'),
    });
    expect(r.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* PHASE 4Q — typed capability matching, and the class split           */
/* ------------------------------------------------------------------ */

describe('PHASE 4Q — a declared capability satisfies only its OWN kind', () => {
  const { extractOperationalFacts: extract } = require('../operationalFactExtraction');

  /** Real producer output for one official requirement. */
  const factsFor = (title, longDescription, extra = {}) =>
    extract({ item: { id: title, title, longDescription, ...extra }, parkCode: 'cany' });

  const REQUIREMENTS = {
    vehicle: factsFor('Elephant Hill Road',
      'The road requires a high-clearance four-wheel-drive vehicle.'),
    permit: factsFor('Chesler Park backcountry site',
      'A permit is required for overnight trips at this site.'),
    boat: factsFor('Horseshoe Landing',
      'The landing is boat access only.'),
    selfSufficiency: factsFor('Doll House',
      'There is no water, food or fuel available beyond this point.'),
  };

  const DECLARATIONS = {
    none: 'Plan two days in Canyonlands.',
    vehicle: 'Plan two days in Canyonlands. We have a 4WD and are happy on rough roads.',
    permit: 'Plan two days in Canyonlands. We already have a permit.',
    boat: 'Plan two days in Canyonlands. We have a boat.',
    backcountry: 'Plan two days in Canyonlands. We are experienced backcountry backpackers.',
  };

  const bundleOf = (name, facts) => ({
    evidence: [{
      topic: 'activities', evidenceId: `e:${name}`,
      claim: { text: name, normalizedValue: { name, operationalFacts: facts } },
    }],
  });

  const judge = (name, facts, prompt) => evaluateTravelerFit({
    itineraryData: plan([{
      day: 1, dayNumber: 1,
      stops: [
        stop('Grand View Point Trail', 120, { type: 'trail' }),
        // Deliberately SHORT and not the anchor: under the old rule this alone
        // made every requirement invisible.
        stop(name, 30, { type: 'trail' }),
      ],
    }]),
    constraints: { durationDays: 2 },
    userPrompt: prompt,
    evidenceBundle: bundleOf(name, facts),
  });

  const requires = (result, name) => (result.requirements || []).filter((r) => r.stopName === name);

  it.each([
    ['vehicle', 'vehicle', true],
    ['vehicle', 'permit', false],
    ['vehicle', 'boat', false],
    ['vehicle', 'selfSufficiency', false],
    ['permit', 'vehicle', false],
    ['permit', 'permit', true],
    ['boat', 'boat', true],
    ['boat', 'vehicle', false],
    ['backcountry', 'selfSufficiency', true],
    ['backcountry', 'permit', false],
    ['none', 'vehicle', false],
    ['none', 'permit', false],
  ])('declared %s vs required %s -> satisfied: %s', (declared, requirement, shouldSatisfy) => {
    const name = `Probe ${declared} ${requirement}`;
    const facts = REQUIREMENTS[requirement].map((f) => ({ ...f, subject: { ...f.subject, name } }));
    const result = judge(name, facts, DECLARATIONS[declared]);
    const isHard = requirement === 'vehicle';
    if (shouldSatisfy) {
      // Satisfied: no failure, and no outstanding obligation left to carry.
      expect(result.reasonCodes).not.toContain('unverified_access_dependency');
      expect(requires(result, name)).toEqual([]);
    } else if (isHard) {
      // A HARD capability the traveler does not hold invalidates, at any position.
      expect(result.ok).toBe(false);
      expect(result.reasonCodes).toContain('unverified_access_dependency');
    } else {
      // An ACTION_REQUIRED obligation stays valid but must survive as metadata.
      expect(result.reasonCodes).not.toContain('unverified_access_dependency');
      expect(requires(result, name).length).toBeGreaterThan(0);
    }
  });

  it('a stated 4WD does not silently discharge a permit', () => {
    const name = 'Chesler Park backcountry site';
    const result = judge(name, REQUIREMENTS.permit, DECLARATIONS.vehicle);
    expect(result.ok).toBe(true);
    const carried = requires(result, name);
    expect(carried.map((r) => r.kind)).toEqual(['permit']);
    expect(carried[0].dependencyClass).toBe('action_required');
  });

  it('carries the requirement wording the producer already wrote', () => {
    const name = 'Chesler Park backcountry site';
    const carried = requires(judge(name, REQUIREMENTS.permit, DECLARATIONS.none), name);
    expect(carried[0]).toMatchObject({
      kind: 'permit',
      dependencyClass: 'action_required',
      requirement: 'a permit',
      confidence: 'official_text',
      source: 'official',
    });
    expect(carried[0].plannerRule).toMatch(/requires a permit/i);
  });

  it('a hard capability requirement fails identically at every position', () => {
    const name = 'Elephant Hill Road';
    const facts = REQUIREMENTS.vehicle;
    const asAnchor = evaluateTravelerFit({
      itineraryData: plan([{ day: 1, dayNumber: 1, stops: [stop('Mesa Arch Trail', 60, { type: 'trail' }), stop(name, 240, { type: 'trail' })] }]),
      constraints: { durationDays: 2 }, userPrompt: DECLARATIONS.none, evidenceBundle: bundleOf(name, facts),
    });
    const asShortStop = judge(name, facts, DECLARATIONS.none);
    expect(asAnchor.ok).toBe(false);
    expect(asShortStop.ok).toBe(false);
    expect(asAnchor.reasonCodes).toEqual(asShortStop.reasonCodes);
  });
});
