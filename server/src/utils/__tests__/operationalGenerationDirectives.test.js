'use strict';

const { extractOperationalFacts } = require('../operationalFactExtraction');
const { CONSTRAINT_TYPE } = require('../trailieOperationalConstraints');
const {
  composeOperationalGenerationDirectives,
} = require('../operationalGenerationDirectives');

/**
 * RELIABILITY PASS R1/R2 (2026-09-01) — machine-composed operational truth
 * must reach generation attempt 1.
 *
 * Until now the frozen bundle's operational facts were read only AFTER
 * generation, by the traveler-fit veto — so Trailie learned "the 24-ft RV
 * cannot drive Going-to-the-Sun Road" by proposing it and being rejected.
 * This composer performs the SAME machine-owned resolution (dimension
 * arithmetic, declared capabilities, avoid-exposure arming) BEFORE the
 * architect call, emitting composed consequences: HARD prohibitions,
 * ACTION obligations, and the per-turn exposure legal pool.
 *
 * The validators stay exactly as they are — these directives are how attempt 1
 * stops fighting them, not a replacement for them.
 */

/* Real producer output, not hand-typed facts: the GTSR official wording. */
const GTSR_ITEM = {
  id: 'F1D269CE-3893-4D30-BA06-67C6A2FBBEC8',
  title: 'Going-to-the-Sun Road',
  url: 'https://www.nps.gov/glac/planyourvisit/goingtothesunroad.htm',
  longDescription:
    'This iconic road crosses Logan Pass. Vehicles, and vehicle combinations, longer than 21 feet (6.4 m) are prohibited between Avalanche Campground and Rising Sun.',
};

const PERMIT_ITEM = {
  id: 'PERMIT-1',
  title: 'Fiery Furnace',
  url: 'https://www.nps.gov/arch/planyourvisit/fiery-furnace.htm',
  longDescription: 'A permit is required to enter the Fiery Furnace. Tickets on recreation.gov.',
};

const FOURWD_ITEM = {
  id: '4WD-1',
  title: 'Medano Pass Primitive Road',
  url: 'https://www.nps.gov/grsa/planyourvisit/medano.htm',
  longDescription: 'A high-clearance four-wheel-drive vehicle is required to drive this road.',
};

function bundleWith(items, { parkCode = 'glac', extraCandidates = [] } = {}) {
  const evidence = items.map((item, i) => ({
    evidenceId: `ev:${i}`,
    entityId: `nps:park:${parkCode}`,
    topic: 'activities',
    claim: {
      identity: `place:${item.title}`,
      text: item.longDescription,
      normalizedValue: {
        name: item.title,
        entityId: `nps:park:${parkCode}:place:${item.id}`,
        operationalFacts: extractOperationalFacts({ item, parkCode }),
      },
    },
  }));
  return { requestId: 'req-test', evidence: [...evidence, ...extraCandidates] };
}

const lowExposureCandidate = (name) => ({
  evidenceId: `ev:${name}`,
  entityId: 'nps:park:zion',
  topic: 'activities',
  claim: {
    identity: `place:${name}`,
    text: `${name} is a gentle paved path.`,
    normalizedValue: { name, exposureLevel: 'low', operationalFacts: [] },
  },
});

const GLACIER_RV_PROMPT =
  "We're spending 5 days in Glacier in early October in our 24-foot RV — what about permits and Going-to-the-Sun Road?";
const ZION_KNEE_PROMPT =
  '3 days in Zion, easy walks only, I have a bad knee, love sunrise and sunset, no scary exposure.';

describe('vehicle dimension facts compose into attempt-1 prohibitions', () => {
  test('a 24-ft RV against the 21-ft GTSR limit composes a prohibition carrying both numbers and the subject', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([GTSR_ITEM]),
      constraints: null,
      userPrompt: GLACIER_RV_PROMPT,
    });
    expect(directives).not.toBeNull();
    expect(directives.hardProhibitions).toHaveLength(1);
    const rule = directives.hardProhibitions[0];
    expect(rule.kind).toBe('vehicle_dimension');
    expect(rule.subjectName).toBe('Going-to-the-Sun Road');
    expect(rule.text).toContain('24');
    expect(rule.text).toContain('21');
    expect(rule.text).toContain('Going-to-the-Sun Road');
    expect(rule.text).toMatch(/do not plan|do not build|do not include/i);
    expect(directives.obligations).toHaveLength(0);
  });

  test('a vehicle that fits the limit composes nothing', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([GTSR_ITEM]),
      constraints: null,
      userPrompt: 'Five days in Glacier in our 18-foot camper.',
    });
    expect(directives).toBeNull();
  });

  test('no vehicle mentioned composes nothing from a dimension fact', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([GTSR_ITEM]),
      constraints: null,
      userPrompt: 'Five relaxed days in Glacier with easy hikes.',
    });
    expect(directives).toBeNull();
  });

  test('a vehicle named without a length composes a do-not-rely prohibition stating the limit', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([GTSR_ITEM]),
      constraints: null,
      userPrompt: 'Five days in Glacier in our RV.',
    });
    expect(directives).not.toBeNull();
    expect(directives.hardProhibitions).toHaveLength(1);
    expect(directives.hardProhibitions[0].text).toContain('21');
    expect(directives.hardProhibitions[0].text).toMatch(/do not/i);
  });
});

describe('capability facts respect declared capabilities', () => {
  test('a 4WD requirement composes a prohibition for a traveler who never claimed 4WD', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([FOURWD_ITEM], { parkCode: 'grsa' }),
      constraints: null,
      userPrompt: 'Three relaxed days at Great Sand Dunes.',
    });
    expect(directives).not.toBeNull();
    expect(directives.hardProhibitions).toHaveLength(1);
    expect(directives.hardProhibitions[0].kind).toBe('vehicle_capability');
    expect(directives.hardProhibitions[0].text).toContain('Medano Pass Primitive Road');
    expect(directives.hardProhibitions[0].text).toMatch(/do not include/i);
  });

  test('a traveler who declared 4WD gets no vehicle-capability prohibition', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([FOURWD_ITEM], { parkCode: 'grsa' }),
      constraints: null,
      userPrompt: 'Three days at Great Sand Dunes — we have a 4x4 jeep.',
    });
    expect(directives).toBeNull();
  });
});

describe('ACTION_REQUIRED facts compose obligations, never exclusions', () => {
  test('a permit requirement composes an obligation that keeps the stop recommendable', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([PERMIT_ITEM], { parkCode: 'arch' }),
      constraints: null,
      userPrompt: 'Two days in Arches, we love scrambling around.',
    });
    expect(directives).not.toBeNull();
    expect(directives.hardProhibitions).toHaveLength(0);
    expect(directives.obligations).toHaveLength(1);
    const obligation = directives.obligations[0];
    expect(obligation.subjectName).toBe('Fiery Furnace');
    expect(obligation.text).toMatch(/may still recommend|may include/i);
    expect(obligation.text).not.toMatch(/do not include/i);
  });

  test('a traveler with permits in hand gets no permit obligation', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([PERMIT_ITEM], { parkCode: 'arch' }),
      constraints: null,
      userPrompt: 'Two days in Arches — we already have the permits for Fiery Furnace.',
    });
    expect(directives).toBeNull();
  });
});

describe('exposure directive (R2) — the per-turn legal pool', () => {
  test('the verbatim Zion audit prompt arms the exposure directive with no constraints object at all', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([], { parkCode: 'zion' }),
      constraints: null,
      userPrompt: ZION_KNEE_PROMPT,
    });
    expect(directives).not.toBeNull();
    expect(directives.exposure).not.toBeNull();
    expect(directives.exposure.confirmedLowNames).toEqual([]);
    expect(directives.exposure.text).toMatch(/never (?:author|invent|guess)/i);
    expect(directives.exposure.text).toMatch(/visitor center|museum|scenic drive/i);
    expect(directives.exposure.text).toMatch(/none .*confirmed/i);
  });

  test('confirmed low-exposure candidates are named as the legal pool', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([], {
        parkCode: 'zion',
        extraCandidates: [lowExposureCandidate('Pa’rus Trail'), lowExposureCandidate('Riverside Walk')],
      }),
      constraints: { avoidExposure: true },
      userPrompt: '3 days in Zion for our family.',
    });
    expect(directives).not.toBeNull();
    expect(directives.exposure.confirmedLowNames).toEqual(['Pa’rus Trail', 'Riverside Walk']);
    expect(directives.exposure.text).toContain('Pa’rus Trail');
    expect(directives.exposure.text).toContain('Riverside Walk');
  });

  test('canonical avoidExposure constraint arms the directive without prompt phrasing', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([], { parkCode: 'zion' }),
      constraints: { preferences: { avoidExposure: true } },
      userPrompt: 'Three days in Zion.',
    });
    expect(directives).not.toBeNull();
    expect(directives.exposure).not.toBeNull();
  });
});

describe('a hard-prohibited subject never also carries an obligation (matrix finding B)', () => {
  // Live Glacier composed BOTH "do not plan any segment on GTSR" and
  // "Drive Going-to-the-Sun Road may still be recommended (with reservation)".
  // The fit veto binds by subject identity and has no shuttle concept, so the
  // obligation invited exactly the stop the validator then refused — twice.
  const GTSR_WITH_RESERVATION = {
    id: 'GTSR-RES',
    title: 'Drive Going-to-the-Sun Road',
    url: 'https://www.nps.gov/glac/planyourvisit/gtsr.htm',
    isReservationRequired: 'true',
    longDescription:
      'Vehicles, and vehicle combinations, longer than 21 feet (6.4 m) are prohibited. A vehicle reservation is required in summer.',
  };

  test('the dimension prohibition suppresses the same subject\'s reservation obligation', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([GTSR_WITH_RESERVATION]),
      constraints: null,
      userPrompt: GLACIER_RV_PROMPT,
    });
    expect(directives).not.toBeNull();
    expect(directives.hardProhibitions).toHaveLength(1);
    expect(directives.obligations).toHaveLength(0);
  });

  test('the dimension prohibition does not invite the subject back via the shuttle', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([GTSR_ITEM]),
      constraints: null,
      userPrompt: GLACIER_RV_PROMPT,
    });
    const rule = directives.hardProhibitions[0];
    expect(rule.text).not.toMatch(/shuttle/i);
    expect(rule.text).toMatch(/do not include/i);
  });
});

describe('the exposure pool holds only exposure-relevant places (matrix finding A)', () => {
  test('lodges, museums and climbing programs never enter the confirmed-low pool', () => {
    const junk = (name) => ({
      evidenceId: `ev:${name}`,
      entityId: 'nps:park:zion',
      topic: 'activities',
      claim: {
        identity: `place:${name}`,
        text: `${name}.`,
        normalizedValue: { name, exposureLevel: 'low', operationalFacts: [] },
      },
    });
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([], {
        parkCode: 'zion',
        extraCandidates: [
          junk('The Zion Lodge'),
          junk('Climbing in Zion'),
          junk('Zion Human History Museum'),
          lowExposureCandidate('Pa’rus Trail'),
          lowExposureCandidate('Riverside Walk'),
        ],
      }),
      constraints: { avoidExposure: true },
      userPrompt: '3 days in Zion.',
    });
    expect(directives.exposure.confirmedLowNames).toEqual(['Pa’rus Trail', 'Riverside Walk']);
  });
});

describe('exposure arming suppresses obligations on exposure-ineligible subjects (matrix finding A2)', () => {
  // Live Zion attempt 2 picked exposure violations after the obligations named
  // Angels Landing and The Narrows as "may still recommend". For an armed
  // avoid-exposure traveler, an exposure-relevant subject with no confirmed low
  // exposure is ineligible anyway — its obligation must not re-invite it.
  const permitItem = (title, activityTypes) => ({
    id: `P-${title}`,
    title,
    url: `https://www.nps.gov/zion/${title}.htm`,
    longDescription: 'A permit is required for this experience.',
    activityTypes,
  });

  const bundleWithTyped = (items) => ({
    requestId: 'req-test',
    evidence: items.map((item, i) => ({
      evidenceId: `ev:${i}`,
      entityId: 'nps:park:zion',
      topic: 'activities',
      claim: {
        identity: `place:${item.title}`,
        text: item.longDescription,
        normalizedValue: {
          name: item.title,
          activityTypes: item.activityTypes || [],
          operationalFacts: extractOperationalFacts({ item, parkCode: 'zion' }),
        },
      },
    })),
  });

  test('an unknown-exposure hiking subject loses its obligation when avoidExposure is armed', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWithTyped([permitItem('Angels Landing', ['hiking', 'hike'])]),
      constraints: { avoidExposure: true },
      userPrompt: '3 days in Zion.',
    });
    expect(directives).not.toBeNull();
    expect(directives.obligations).toHaveLength(0);
    expect(directives.exposure).not.toBeNull();
  });

  test('the same subject keeps its obligation when exposure avoidance is not armed', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWithTyped([permitItem('Angels Landing', ['hiking', 'hike'])]),
      constraints: null,
      userPrompt: '3 days in Zion.',
    });
    expect(directives.obligations).toHaveLength(1);
  });

  test('a non-exposure-relevant subject keeps its obligation under an armed constraint', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWithTyped([permitItem('Zion Canyon Shuttle Tour', ['guided tours'])]),
      constraints: { avoidExposure: true },
      userPrompt: '3 days in Zion.',
    });
    expect(directives.obligations).toHaveLength(1);
  });
});

describe('exposure ineligibility is scoped to exposure-relevant candidates', () => {
  // The exposure constraint may only remove candidates for which exposure is
  // meaningful. A visitor center, museum, lodge, shuttle hub or picnic area has
  // no exposureLevel because none applies — an armed avoidExposure must not
  // read that absence as "unknown" and starve the construction catalogue.
  const place = (name, { exposureLevel, activityTypes = [] } = {}) => ({
    evidenceId: `ev:${name}`,
    entityId: 'nps:park:olym',
    topic: 'activities',
    claim: {
      identity: `place:${name}`,
      text: `${name}.`,
      normalizedValue: {
        name,
        ...(exposureLevel ? { exposureLevel } : {}),
        activityTypes,
        operationalFacts: [],
      },
    },
  });

  test('non-exposure-relevant places with no exposureLevel are never construction-ineligible', () => {
    const nonRelevant = [
      place('Olympic National Park Visitor Center'),
      place('Hoh Rain Forest Museum'),
      place('Lake Crescent Lodge'),
      place('Storm King Shuttle Hub'),
      place('East Beach Picnic Area'),
    ];
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: {
        requestId: 'req-test',
        evidence: [
          ...nonRelevant,
          place('Hurricane Ridge Trail', { activityTypes: ['hiking'] }), // unknown exposure, relevant
          place('Hall of Mosses Trail', { exposureLevel: 'low', activityTypes: ['hiking'] }),
          place('High Divide Trail', { exposureLevel: 'high', activityTypes: ['hiking'] }),
        ],
      },
      constraints: { avoidExposure: true },
      userPrompt: '3 days in Olympic, easy walks, bad knee, no scary drop-offs.',
    });
    expect(directives).not.toBeNull();
    expect(directives.exposure).not.toBeNull();
    // Exposure-relevant + unknown/high → removed from the attempt-1 pool.
    expect(directives.exposure.ineligibleEvidenceIds).toContain('ev:Hurricane Ridge Trail');
    expect(directives.exposure.ineligibleEvidenceIds).toContain('ev:High Divide Trail');
    // Exposure-relevant + confirmed low → eligible.
    expect(directives.exposure.ineligibleEvidenceIds).not.toContain('ev:Hall of Mosses Trail');
    expect(directives.exposure.confirmedLowNames).toContain('Hall of Mosses Trail');
    // Not exposure-relevant → the constraint does not apply, metadata or not.
    for (const candidate of nonRelevant) {
      expect(directives.exposure.ineligibleEvidenceIds).not.toContain(candidate.evidenceId);
    }
  });

  test('without an armed exposure constraint no candidate is exposure-excluded at all', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: {
        requestId: 'req-test',
        evidence: [
          place('High Divide Trail', { exposureLevel: 'high', activityTypes: ['hiking'] }),
        ],
      },
      constraints: null,
      userPrompt: '3 days in Olympic with big views.',
    });
    expect(directives).toBeNull();
  });
});

describe('the ordinary trip composes nothing (bar 3)', () => {
  test('no facts and no armed exposure constraint → null', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: bundleWith([], { parkCode: 'cany' }),
      constraints: { pace: 'relaxed' },
      userPrompt: 'Give us three relaxed days in Canyonlands without rushing between stops.',
    });
    expect(directives).toBeNull();
  });

  test('a null bundle composes nothing', () => {
    const directives = composeOperationalGenerationDirectives({
      evidenceBundle: null,
      constraints: null,
      userPrompt: 'Plan me three days in Canyonlands.',
    });
    expect(directives).toBeNull();
  });
});
