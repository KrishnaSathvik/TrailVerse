'use strict';

/**
 * Phase 9C.1D.5B — explicit named-experience preservation (deterministic).
 *
 * The 9C.1D.4 Yosemite run: the traveler asked for Mist Trail; the only
 * surviving obligation was "some hike", identity repair steered to other
 * trails, and Bridalveil Fall Trailhead satisfied the generic check. These
 * tests pin the contract that replaces that: a named request is resolved to
 * evidence identity, satisfied only by a stop bound to that identity, and
 * never genericized across retries.
 *
 * Evidence is the REAL cached Yosemite activities catalogue (capture fidelity).
 */

const path = require('path');
const {
  extractNamedExperienceRequests,
  resolveNamedExperienceRequirements,
  evaluateNamedExperienceSatisfaction,
  buildRequestedExperienceUnavailableMessage,
  requiredNamedPlacesPromptBlock,
  pinnedEvidenceIdsFor,
} = require('../namedExperienceRequirements');
const { buildEvidenceBundle } = require('../evidenceBundle');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { createRepairLedger } = require('../repairLedger');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');

const FIXTURE = require(path.join(__dirname, '../../services/__tests__/fixtures/namedExperience/yose-activities-2026-09-15.json'));
const CANDIDATES = FIXTURE.candidates;
const idOf = (name) => {
  const found = CANDIDATES.find((c) => c.claim.normalizedValue.name === name);
  if (!found) throw new Error(`fixture lacks ${name}`);
  return found.evidenceId;
};

const bundle = () => buildEvidenceBundle({
  requestId: 'named-exp',
  resolutions: [{ requirementId: 'acts', status: 'satisfied_fresh', evidenceIds: CANDIDATES.map((c) => c.evidenceId) }],
  candidates: CANDIDATES,
});

const YOSEMITE_REQUEST = 'Plan me a day in Yosemite Valley. I want to hike the Mist Trail in the morning, including Vernal Fall Footbridge and Vernal Fall as stops, then do one separate scenic experience later in the day.';

const names = (requests) => requests.map((r) => r.requestedName);

function plan(stops) {
  return {
    days: [{
      id: 'd1', dayNumber: 1, label: 'Valley day',
      stops: stops.map(([name, type, extra = {}], i) => ({
        id: `s${i}`, order: i, name, type, note: `${name} note.`, why: `${name} why.`, duration: 90, ...extra,
      })),
    }],
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

describe('extractNamedExperienceRequests — conservative explicit frames', () => {
  test('the captured Yosemite request yields exactly the three named stops, not the valley', () => {
    expect(names(extractNamedExperienceRequests(YOSEMITE_REQUEST)))
      .toEqual(['Mist Trail', 'Vernal Fall Footbridge', 'Vernal Fall']);
  });

  test.each([
    ['I want to hike Angels Landing', ['Angels Landing']],
    ['include Mist Trail please', ['Mist Trail']],
    ['I want to do Mist Trail', ['Mist Trail']],
    ['stop at Grand Prismatic Spring on the way', ['Grand Prismatic Spring']],
    ['we want to visit Delicate Arch at sunset', ['Delicate Arch']],
    ["don't skip Old Faithful", ['Old Faithful']],
    ['do not miss Glacier Point', ['Glacier Point']],
    ['visit Old Faithful, Grand Prismatic Spring and Artist Point', ['Old Faithful', 'Grand Prismatic Spring', 'Artist Point']],
  ])('%j', (text, expected) => {
    expect(names(extractNamedExperienceRequests(text))).toEqual(expected);
  });

  test.each([
    'Plan me 2 days in Yellowstone with the major geothermal areas',
    'Include a good hike and a scenic viewpoint',
    'visit Yosemite Valley',
    'visit Yellowstone',
    'visit Grand Canyon National Park next spring',
    'visit Utah and Arizona',
    'include Day 2 as a rest day',
    'see Morning light on the cliffs',
    'Plan a trip to Zion, I want to hike',
  ])('(8) no named obligation from %j', (text) => {
    expect(extractNamedExperienceRequests(text)).toEqual([]);
  });

  test('region-noun endings are not experiences, but a real landmark containing a park word is', () => {
    expect(names(extractNamedExperienceRequests('visit Lamar Valley'))).toEqual([]);
    expect(names(extractNamedExperienceRequests('visit Glacier Point'))).toEqual(['Glacier Point']);
  });

  test('duplicate mentions collapse to one requirement', () => {
    expect(names(extractNamedExperienceRequests('hike Mist Trail. Really, include Mist Trail.'))).toEqual(['Mist Trail']);
  });
});

// ---------------------------------------------------------------------------
// Resolution against the frozen candidate universe
// ---------------------------------------------------------------------------

describe('resolveNamedExperienceRequirements — evidence identity', () => {
  test('Mist Trail, Vernal Fall Footbridge and Vernal Fall are unavailable in the real Yosemite universe', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests(YOSEMITE_REQUEST),
      evidenceBundle: bundle(),
    });
    expect(reqs.map((r) => [r.requestedName, r.status])).toEqual([
      ['Mist Trail', 'unavailable'],
      ['Vernal Fall Footbridge', 'unavailable'],
      ['Vernal Fall', 'unavailable'],
    ]);
  });

  test('Mist Trail is NOT resolved to "Mist and John Muir Trailhead" (no alias authority until 5C)', () => {
    const [req] = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('hike Mist Trail'),
      evidenceBundle: bundle(),
    });
    expect(req.status).toBe('unavailable');
    expect(req.evidenceIds).toEqual([]);
  });

  test('an exact authoritative name resolves to its evidence identity', () => {
    const [req] = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Glacier Point'),
      evidenceBundle: bundle(),
    });
    expect(req.status).toBe('resolved');
    expect(req.evidenceIds).toContain(idOf('Glacier Point'));
    expect(req.canonicalPlaceName).toBe('Glacier Point');
    expect(req.obligationId).toBe('requested_named_experience_1');
    expect(req.reasonCode).toBe('missing_requested_named_experience_1');
  });

  test('a match to a directive-excluded candidate is ineligible, not resolved', () => {
    const [req] = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Glacier Point'),
      evidenceBundle: bundle(),
      excludedEvidenceIds: [idOf('Glacier Point')],
    });
    expect(req.status).toBe('ineligible');
  });

  test('an unresolved name with no feature signal (a town, a business) creates no obligation — never a false refusal', () => {
    for (const text of ['stop at Springdale for lunch', 'stop at Whole Foods in Mariposa', 'visit Old Faithful Inn']) {
      expect(resolveNamedExperienceRequirements({
        requests: extractNamedExperienceRequests(text),
        evidenceBundle: bundle(),
      })).toEqual([]);
    }
  });

  test('an unresolved name with a clear park-feature signal IS enforced as unavailable', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Taft Point Arch and stop at Sentinel Falls'),
      evidenceBundle: bundle(),
    });
    expect(reqs.map((r) => [r.requestedName, r.status])).toEqual([
      ['Taft Point Arch', 'unavailable'],
      ['Sentinel Falls', 'unavailable'],
    ]);
  });

  test('an empty place catalogue creates no obligations (mirrors the identity boundary)', () => {
    const empty = buildEvidenceBundle({ requestId: 'x', resolutions: [], candidates: [] });
    expect(resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Glacier Point'),
      evidenceBundle: empty,
    })).toEqual([]);
  });

  test('(11) multiple named requirements are tracked independently', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Glacier Point and Tunnel View, and hike Mist Trail'),
      evidenceBundle: bundle(),
    });
    expect(reqs.map((r) => [r.requestedName, r.status, r.obligationId])).toEqual([
      ['Glacier Point', 'resolved', 'requested_named_experience_1'],
      ['Tunnel View', 'resolved', 'requested_named_experience_2'],
      ['Mist Trail', 'unavailable', 'requested_named_experience_3'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Satisfaction — evidence identity, never category or strings
// ---------------------------------------------------------------------------

describe('evaluateNamedExperienceSatisfaction', () => {
  const glacier = () => resolveNamedExperienceRequirements({
    requests: extractNamedExperienceRequests('visit Glacier Point'),
    evidenceBundle: bundle(),
  });

  test('(2) a stop resolving to the authoritative identity satisfies the obligation', () => {
    const out = evaluateNamedExperienceSatisfaction({
      itineraryData: plan([['Glacier Point', 'viewpoint'], ['El Capitan Meadow', 'viewpoint']]),
      requirements: glacier(),
      evidenceBundle: bundle(),
    });
    expect(out.ok).toBe(true);
    expect(out.reasonCodes).toEqual([]);
  });

  test('the model naming flourish still resolves through the same identity matcher', () => {
    const out = evaluateNamedExperienceSatisfaction({
      itineraryData: plan([['Sunset at Glacier Point', 'viewpoint']]),
      requirements: glacier(),
      evidenceBundle: bundle(),
    });
    expect(out.ok).toBe(true);
  });

  test('(1) an unrelated grounded viewpoint does not satisfy the named obligation', () => {
    const out = evaluateNamedExperienceSatisfaction({
      itineraryData: plan([['Tunnel View', 'viewpoint'], ['Washburn Point', 'viewpoint']]),
      requirements: glacier(),
      evidenceBundle: bundle(),
    });
    expect(out.ok).toBe(false);
    expect(out.reasonCodes).toEqual(['missing_requested_named_experience_1']);
    expect(out.unsatisfied.map((r) => r.requestedName)).toEqual(['Glacier Point']);
  });

  test('(10) a spoofed evidenceRef on an unrelated stop does not satisfy it — identity is re-derived', () => {
    const out = evaluateNamedExperienceSatisfaction({
      itineraryData: plan([['Lunch break', 'custom', { evidenceRef: idOf('Glacier Point'), canonicalPlaceName: 'Glacier Point' }]]),
      requirements: glacier(),
      evidenceBundle: bundle(),
    });
    expect(out.ok).toBe(false);
  });

  test('(9) activityGroups cannot satisfy named identity', () => {
    const itin = plan([['Four Mile Trailhead', 'trail'], ['Washburn Point', 'viewpoint']]);
    itin.days[0].activityGroups = [{ id: 'glacier-point-hike', stopIds: ['s0', 's1'] }];
    const out = evaluateNamedExperienceSatisfaction({ itineraryData: itin, requirements: glacier(), evidenceBundle: bundle() });
    expect(out.ok).toBe(false);
  });

  test('unavailable/ineligible requirements are not satisfiable obligations here (they terminate upstream)', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('hike Mist Trail'),
      evidenceBundle: bundle(),
    });
    const out = evaluateNamedExperienceSatisfaction({ itineraryData: plan([['Glacier Point', 'viewpoint']]), requirements: reqs, evidenceBundle: bundle() });
    expect(out.evaluatedObligationIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Completeness — named and generic obligations coexist
// ---------------------------------------------------------------------------

describe('evaluateItineraryCompleteness with named requirements', () => {
  const request = 'I want to hike to Glacier Point from the valley, then visit Glacier Point at sunset';
  const reqs = () => resolveNamedExperienceRequirements({
    requests: extractNamedExperienceRequests('visit Glacier Point'),
    evidenceBundle: bundle(),
  });
  const run = (stops, namedExperienceRequirements) => evaluateItineraryCompleteness({
    itineraryData: plan(stops),
    userPrompt: request,
    evidenceBundle: bundle(),
    namedExperienceRequirements,
  });

  test('(1) generic requested_hike passes on Four Mile Trailhead while the named obligation fails', () => {
    const out = run([['Four Mile Trailhead', 'trail'], ['Tunnel View', 'viewpoint']], reqs());
    expect(out.reasonCodes).toContain('missing_requested_named_experience_1');
    expect(out.reasonCodes).not.toContain('missing_requested_hike');
    expect(out.ok).toBe(false);
  });

  test('named code leads the reason list so a bounded reason slice can never drop it', () => {
    const out = run([['Four Mile Trailhead', 'trail']], reqs());
    expect(out.reasonCodes[0]).toBe('missing_requested_named_experience_1');
  });

  test('(2) the bound authoritative stop clears the named obligation', () => {
    const out = run([['Four Mile Trailhead', 'trail'], ['Glacier Point', 'viewpoint']], reqs());
    expect(out.reasonCodes).not.toContain('missing_requested_named_experience_1');
  });

  test('(3)(12) without named requirements completeness is byte-identical to before', () => {
    const stops = [['Four Mile Trailhead', 'trail'], ['Tunnel View', 'viewpoint']];
    const withEmpty = run(stops, []);
    const without = evaluateItineraryCompleteness({ itineraryData: plan(stops), userPrompt: request, evidenceBundle: bundle() });
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(without));
  });
});

// ---------------------------------------------------------------------------
// Repair ledger — named obligations are hard, specific and never genericized
// ---------------------------------------------------------------------------

describe('repair ledger named obligations', () => {
  const reqs = () => resolveNamedExperienceRequirements({
    requests: extractNamedExperienceRequests('visit Glacier Point and hike Four Mile Trailhead'),
    evidenceBundle: bundle(),
  });

  test('each resolved named requirement is its own hard obligation carrying the exact name', () => {
    const ledger = createRepairLedger({ userPrompt: 'visit Glacier Point and hike Four Mile Trailhead', namedExperienceRequirements: reqs() });
    expect(ledger.obligationIds()).toEqual(expect.arrayContaining(['requested_named_experience_1', 'requested_named_experience_2', 'requested_hike']));
    expect(ledger.labelFor('requested_named_experience_1')).toContain('Glacier Point');
  });

  test('(7) a failed named obligation is a MUST FIX naming that place, with no substitute allowed', () => {
    const ledger = createRepairLedger({ userPrompt: 'visit Glacier Point', namedExperienceRequirements: reqs() });
    ledger.recordAttempt({ attempt: 1, reasonCodes: ['missing_requested_named_experience_1'] });
    const contract = ledger.buildRepairContract();
    expect(contract).toMatch(/MUST FIX:[\s\S]*Glacier Point/);
    expect(contract).toMatch(/no other place/i);
    expect(contract).not.toMatch(/- missing_requested_named_experience_1$/m);
  });

  test('(12) no named requirements → ledger obligations unchanged', () => {
    const a = createRepairLedger({ userPrompt: 'Include a good hike' }).obligationIds();
    const b = createRepairLedger({ userPrompt: 'Include a good hike', namedExperienceRequirements: [] }).obligationIds();
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// Evidence rendering — an explicit requirement can never be hidden by the cap
// ---------------------------------------------------------------------------

describe('(4) pinned evidence survives the render cap', () => {
  const activitiesReq = [{ requirementId: 'acts', topic: 'activities', reasonCodes: ['itinerary_activity_support', 'requested_named_hike_or_walk'] }];
  const render = (pinnedEvidenceIds) => renderEvidenceBundleForPrompt({
    bundle: bundle(), requirements: activitiesReq, userRequest: 'stop at Washburn Point', maxTokens: 1200, pinnedEvidenceIds,
  });

  test('Washburn Point is outside the ordinary window', () => {
    expect(render().includedEvidenceIds).not.toContain(idOf('Washburn Point'));
  });

  test('pinned, it is rendered first', () => {
    const out = render([idOf('Washburn Point')]);
    expect(out.includedEvidenceIds[0]).toBe(idOf('Washburn Point'));
    expect(out.text).toContain('Washburn Point');
  });

  test('(12) empty pin list renders byte-identically', () => {
    expect(render([]).text).toBe(render().text);
  });
});

describe('prompt and terminal copy', () => {
  test('pinnedEvidenceIdsFor returns only resolved identities', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Glacier Point and hike Mist Trail'),
      evidenceBundle: bundle(),
    });
    expect(pinnedEvidenceIdsFor(reqs)).toEqual(reqs[0].evidenceIds);
  });

  test('the prompt block names the traveler request and the exact place name, and forbids substitutes', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests('visit Glacier Point'),
      evidenceBundle: bundle(),
    });
    const block = requiredNamedPlacesPromptBlock(reqs);
    expect(block.places).toEqual([{ travelerAskedFor: 'Glacier Point', placeName: 'Glacier Point' }]);
    expect(block.instructions).toMatch(/no other place/i);
    expect(requiredNamedPlacesPromptBlock([])).toBeNull();
  });

  test('(5) unavailable copy names the request, does not substitute, and avoids system language', () => {
    const reqs = resolveNamedExperienceRequirements({
      requests: extractNamedExperienceRequests(YOSEMITE_REQUEST),
      evidenceBundle: bundle(),
    });
    const text = buildRequestedExperienceUnavailableMessage(reqs);
    expect(text).toContain('Mist Trail');
    expect(text).not.toMatch(/Bridalveil|Four Mile|Chilnualna|instead/);
    expect(text).not.toMatch(/evidence|validator|obligation|canonical/i);
  });
});
