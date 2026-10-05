const {
  POLICY_STATUS,
  CLAIM,
  classifyClaims,
  buildItineraryEvidence,
  renderPermitUnknownCorrection,
  renderClosureCorrection,
  evaluateIssuePolicy,
} = require('../responsePatchPolicy');
const { makeFact, buildFactBundle, AUTHORITY, STATUS } = require('../canonicalFacts');
const { splitIntoSections } = require('../responseSections');
const { planPatches, applyPatches, MATCH_STATUS } = require('../responsePatching');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

function fact(overrides) {
  return makeFact({ retrievedAt: RETRIEVED_AT, ...overrides });
}

const glacClosure = fact({
  source: 'nps',
  category: 'closure',
  sourceId: 'a1',
  text: 'Rialto Beach access road closed',
  parkCode: 'glac',
  parkName: 'Glacier National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.ACTIVE_CLOSURE,
});

const olymClosure = fact({
  source: 'nps',
  category: 'closure',
  sourceId: 'b1',
  text: 'Rialto Beach access road closed',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.ACTIVE_CLOSURE,
});

const olymListingOnly = fact({
  source: 'recreation_gov',
  category: 'permit',
  sourceId: 'F1',
  text: 'Wilderness Permit [Overnight] — Recreation.gov listing only; does not confirm the requirement is currently active.',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  url: 'https://www.recreation.gov/permits/72940',
  authority: AUTHORITY.LISTING_ONLY,
  status: STATUS.LISTING_ONLY,
});

const olymListingNotFound = fact({
  source: 'recreation_gov',
  category: 'permit',
  text: 'No Recreation.gov permit listing was returned for Olympic National Park. This does NOT confirm that no permit is required.',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.LISTING_ONLY,
  status: STATUS.LISTING_NOT_FOUND,
});

const olymConfirmedRequired = fact({
  source: 'nps',
  category: 'permit',
  sourceId: 'P9',
  text: 'Wilderness camping permits are required year-round',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.CONFIRMED_REQUIRED,
});

const olymConfirmedNotRequired = fact({
  source: 'nps',
  category: 'permit',
  sourceId: 'P8',
  text: 'Day hiking requires no permit',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.CONFIRMED_NOT_REQUIRED,
});

const olymNoAlerts = fact({
  source: 'nps',
  category: 'closure',
  text: 'No active NPS alerts were returned for Olympic National Park. This does NOT confirm that nothing is closed.',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.LISTING_NOT_FOUND,
});

const webSecondary = fact({
  source: 'web_search',
  category: 'web',
  sourceId: 'w1',
  text: 'A blog says Rialto Beach is open and no permit is required.',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.SECONDARY,
  status: STATUS.STATUS_UNKNOWN,
});

const climateEstimate = fact({
  source: 'openweather',
  category: 'weather',
  sourceId: 'c1',
  text: 'July highs typically near 70F',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.STATUS_UNKNOWN,
  weatherMode: 'climate_estimate',
});

/** Build the section/match context the policy layer expects. */
function contextFor(content, quote) {
  const sections = splitIntoSections(content);
  const start = content.indexOf(quote);
  const section = sections.find((s) => start >= s.startOffset && start < s.endOffset);
  return {
    section,
    match: {
      status: MATCH_STATUS.CANDIDATE,
      absoluteStart: start,
      absoluteEnd: start + quote.length,
      matchedText: quote,
      matchTier: 'exact',
    },
  };
}

const OLYM_DOC = '## Day 1 — Olympic National Park\nRialto Beach is open right now.\n';

describe('claim classification', () => {
  test('hedged verification wording asserts nothing', () => {
    const claims = classifyClaims(
      'Check Recreation.gov to confirm whether this permit is currently needed for Olympic National Park.'
    );
    expect(claims).toEqual([CLAIM.NEUTRAL_VERIFICATION]);
    expect(claims).not.toContain(CLAIM.ASSERTS_REQUIRED);
    expect(claims).not.toContain(CLAIM.ASSERTS_NOT_REQUIRED);
  });

  test('direct assertions are detected', () => {
    expect(classifyClaims('A permit is required.')).toContain(CLAIM.ASSERTS_REQUIRED);
    expect(classifyClaims('No permit is required.')).toContain(CLAIM.ASSERTS_NOT_REQUIRED);
    expect(classifyClaims('The road is closed.')).toContain(CLAIM.ASSERTS_CLOSED);
    expect(classifyClaims('Rialto Beach is open right now.')).toContain(CLAIM.ASSERTS_OPEN);
  });
});

describe('closure evidence', () => {
  test('an authoritative active closure authorizes a closure correction', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'ignored — renderer wins',
        evidenceFactIds: [olymClosure.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.derivedCritical).toBe(true);
    expect(res.patch.issue.replacementText).toBe(renderClosureCorrection(olymClosure));
    expect(res.acceptedFactIds).toEqual([olymClosure.id]);
  });

  test('a closure from another park is out of scope', () => {
    const bundle = buildFactBundle([[glacClosure, olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [glacClosure.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.EVIDENCE_OUT_OF_SCOPE);
    expect(res.patch).toBeNull();
  });

  test('zero NPS alerts cannot authorize "the trail is open"', () => {
    const doc = '## Day 1 — Olympic National Park\nThe Hoh River Trail is open.\n';
    const bundle = buildFactBundle([[olymNoAlerts]]);
    const { section, match } = contextFor(doc, 'The Hoh River Trail is open.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'The Hoh River Trail is open.',
        evidenceFactIds: [olymNoAlerts.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    // Per policy this downgrades to a verification warning rather than being
    // rejected outright — what matters is that nothing asserts the trail is open.
    expect(res.allowedAction).not.toBe('replace');
    if (res.status === POLICY_STATUS.APPROVED) {
      expect(res.allowedAction).toBe('add_warning');
      expect(classifyClaims(res.patch.issue.replacementText)).not.toContain(CLAIM.ASSERTS_OPEN);
    }
  });

  test('secondary web evidence cannot override an authoritative closure', () => {
    const bundle = buildFactBundle([[webSecondary]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'Rialto Beach is open.',
        evidenceFactIds: [webSecondary.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).not.toBe(POLICY_STATUS.APPROVED);
  });
});

describe('permit evidence', () => {
  const doc = '## Day 1 — Olympic National Park\nTimed entry permits are required in July.\n';
  const quote = 'Timed entry permits are required in July.';

  test('listing_only cannot put a "permit required" assertion into the response', () => {
    const bundle = buildFactBundle([[olymListingOnly]]);
    const { section, match } = contextFor(doc, quote);

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'A wilderness permit is required for Olympic National Park.',
        evidenceFactIds: [olymListingOnly.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    // The deterministic renderer overrides the model's overreaching text, so the
    // requirement assertion never reaches the response.
    expect(res.replacementSource).toBe('renderer');
    expect(res.patch.issue.replacementText).not.toMatch(/\bis required\b/i);
    expect(classifyClaims(res.patch.issue.replacementText)).not.toContain(CLAIM.ASSERTS_REQUIRED);
  });

  test('a model replacement asserting more than its evidence is rejected outright', () => {
    const bundle = buildFactBundle([[olymListingOnly]]);
    const noRendererDoc = '## Day 1 — Olympic National Park\nThe forest is quiet in July.\n';
    const { section, match } = contextFor(noRendererDoc, 'The forest is quiet in July.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'replace',
        replacementText: 'A wilderness permit is required.',
        evidenceFactIds: [olymListingOnly.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    // Non-critical quote, so no renderer intervenes and the claim gate applies.
    expect(res.derivedCritical).toBe(false);
    expect(res.status).not.toBe(POLICY_STATUS.APPROVED);
  });

  test('listing_only authorizes only neutral verification wording', () => {
    const bundle = buildFactBundle([[olymListingOnly]]);
    const { section, match } = contextFor(doc, quote);

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'anything — renderer replaces this',
        evidenceFactIds: [olymListingOnly.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.patch.issue.replacementText).toBe(renderPermitUnknownCorrection(olymListingOnly));
    expect(classifyClaims(res.patch.issue.replacementText)).toEqual([CLAIM.NEUTRAL_VERIFICATION]);
  });

  test('listing_not_found cannot authorize "no permit is required"', () => {
    const bundle = buildFactBundle([[olymListingNotFound]]);
    const { section, match } = contextFor(doc, quote);

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'No permit is required for Olympic National Park.',
        evidenceFactIds: [olymListingNotFound.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).not.toBe(POLICY_STATUS.APPROVED);
  });

  test('authoritative confirmed_required authorizes requirement wording', () => {
    const bundle = buildFactBundle([[olymConfirmedRequired]]);
    const { section, match } = contextFor(doc, quote);

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [olymConfirmedRequired.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(classifyClaims(res.patch.issue.replacementText)).toContain(CLAIM.ASSERTS_REQUIRED);
  });

  test('authoritative confirmed_not_required authorizes no-requirement wording', () => {
    const noPermitDoc = '## Day 1 — Olympic National Park\nA permit is required for day hiking.\n';
    const bundle = buildFactBundle([[olymConfirmedNotRequired]]);
    const { section, match } = contextFor(noPermitDoc, 'A permit is required for day hiking.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [olymConfirmedNotRequired.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(classifyClaims(res.patch.issue.replacementText)).toContain(CLAIM.ASSERTS_NOT_REQUIRED);
  });

  test('the permit-unknown renderer never asserts either direction', () => {
    const text = renderPermitUnknownCorrection(olymListingOnly);
    expect(text).not.toMatch(/\bis required\b/i);
    expect(text).not.toMatch(/\bno permit\b/i);
    expect(classifyClaims(text)).toEqual([CLAIM.NEUTRAL_VERIFICATION]);
  });
});

describe('weather evidence', () => {
  test('a climate estimate cannot be rewritten as current conditions', () => {
    const doc = '## Day 1 — Olympic National Park\nExpect sun all week.\n';
    const bundle = buildFactBundle([[climateEstimate]]);
    const { section, match } = contextFor(doc, 'Expect sun all week.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'replace',
        replacementText: 'The forecast today is sunny and clear.',
        evidenceFactIds: [climateEstimate.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).not.toBe(POLICY_STATUS.APPROVED);
  });
});

describe('contradiction versus absence', () => {
  test('an unsupported but uncontradicted claim cannot be deleted', () => {
    const doc = '## Day 1 — Olympic National Park\nThe visitor center opens at 09:00.\n';
    const bundle = buildFactBundle([[olymListingOnly]]);
    const { section, match } = contextFor(doc, 'The visitor center opens at 09:00.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'delete',
        evidenceFactIds: [olymListingOnly.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.NOT_CONTRADICTED);
    expect(res.patch).toBeNull();
  });

  test('a positively contradicted critical claim is replaced', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [olymClosure.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.allowedAction).toBe('replace');
  });

  test('an uncontradicted critical claim is downgraded to a warning', () => {
    const doc = '## Day 1 — Olympic National Park\nThe wilderness permit office closes at 16:00.\n';
    const bundle = buildFactBundle([[olymListingOnly]]);
    const { section, match } = contextFor(doc, 'The wilderness permit office closes at 16:00.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'replace',
        replacementText: 'The office is open all day.',
        evidenceFactIds: [olymListingOnly.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.allowedAction).toBe('add_warning');
    expect(res.derivedCritical).toBe(true);
  });
});

describe('criticality is code-derived', () => {
  test('reviewer critical:false cannot downgrade a closure conflict', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        critical: false,
        replacementText: 'x',
        evidenceFactIds: [olymClosure.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.derivedCritical).toBe(true);
  });

  test('reviewer critical:true cannot escalate harmless prose', () => {
    const doc = '## Day 1 — Olympic National Park\nThe mossy trees are lovely.\n';
    const bundle = buildFactBundle([[olymListingOnly]]);
    const { section, match } = contextFor(doc, 'The mossy trees are lovely.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'unsupported_claim',
        action: 'delete',
        critical: true,
        evidenceFactIds: [olymListingOnly.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.derivedCritical).toBe(false);
  });
});

describe('evidence and action validation', () => {
  test('an unknown evidence id returns evidence_missing', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: ['nps:olym:closure:does-not-exist'],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.EVIDENCE_MISSING);
  });

  test('an action outside the issue policy is unsupported_action', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'drive_time_issue',
        action: 'delete',
        evidenceFactIds: [olymClosure.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    expect(res.status).toBe(POLICY_STATUS.UNSUPPORTED_ACTION);
  });

  test('a newly introduced unsupported URL is rejected', () => {
    const bundle = buildFactBundle([[olymConfirmedRequired]]);
    const doc = '## Day 1 — Olympic National Park\nBook ahead.\n';
    const { section, match } = contextFor(doc, 'Book ahead.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'missing_permit_warning',
        action: 'replace',
        replacementText: 'A permit is required. See https://totally-made-up.example.com/permits',
        evidenceFactIds: [olymConfirmedRequired.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    // The renderer is used for critical claims, so assert the validator directly too.
    const { findUnsupportedValues } = require('../responsePatchPolicy');
    expect(
      findUnsupportedValues({
        replacementText: 'See https://totally-made-up.example.com/permits',
        matchedText: 'Book ahead.',
        acceptedFacts: [olymConfirmedRequired],
      })
    ).toContain('https://totally-made-up.example.com/permits');
    expect(res.status).toBe(POLICY_STATUS.APPROVED); // renderer replaced the bad text
    expect(res.patch.issue.replacementText).not.toContain('totally-made-up');
  });

  test('an unsupported price, time or distance is rejected', () => {
    const { findUnsupportedValues } = require('../responsePatchPolicy');
    const unsupported = findUnsupportedValues({
      replacementText: 'Entrance is $99 and the drive is 250 miles, arriving 07:30 in 2031.',
      matchedText: 'Entrance is cheap.',
      acceptedFacts: [olymConfirmedRequired],
    });

    expect(unsupported).toEqual(
      expect.arrayContaining(['$99', '250 miles', '07:30', '2031'])
    );
  });

  test('a value already present in the original quote is permitted', () => {
    const { findUnsupportedValues } = require('../responsePatchPolicy');
    const unsupported = findUnsupportedValues({
      replacementText: 'The drive is 250 miles.',
      matchedText: 'It is roughly 250 miles from Seattle.',
      acceptedFacts: [],
    });

    expect(unsupported).toEqual([]);
  });
});

describe('immutable itinerary evidence', () => {
  const itineraryData = {
    days: [
      {
        id: 'day-1',
        dayNumber: 1,
        label: 'Day 1',
        stops: [{ id: 's1-1', name: 'Hall of Mosses' }],
      },
    ],
  };

  test('itinerary evidence ids are built in code, not invented by the model', () => {
    const evidence = buildItineraryEvidence(itineraryData);
    expect(evidence.byId['itinerary:day-1:stop:s1-1']).toBeDefined();
    expect(evidence.stopNames).toEqual(['hall of mosses']);
  });

  test('prose recommending a stop absent from the itinerary may be deleted', () => {
    const doc = '## Day 1 — Olympic National Park\nThen head to Hurricane Ridge for sunset.\n';
    const { section, match } = contextFor(doc, 'Then head to Hurricane Ridge for sunset.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'prose_json_mismatch',
        action: 'delete',
        evidenceFactIds: ['itinerary:day-1:stop:s1-1'],
      },
      match,
      section,
      canonicalFactBundle: buildFactBundle([[]]),
      itineraryData,
    });

    expect(res.status).toBe(POLICY_STATUS.APPROVED);
    expect(res.allowedAction).toBe('delete');
  });

  test('a stop that exists in the itinerary cannot be deleted on reviewer say-so', () => {
    const doc = '## Day 1 — Olympic National Park\nWalk the Hall of Mosses loop.\n';
    const { section, match } = contextFor(doc, 'Walk the Hall of Mosses loop.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'prose_json_mismatch',
        action: 'delete',
        evidenceFactIds: ['itinerary:day-1:stop:s1-1'],
      },
      match,
      section,
      canonicalFactBundle: buildFactBundle([[]]),
      itineraryData,
    });

    expect(res.status).toBe(POLICY_STATUS.NOT_CONTRADICTED);
  });

  test('an itinerary issue with no valid itinerary evidence is rejected', () => {
    const doc = '## Day 1 — Olympic National Park\nThen head to Hurricane Ridge.\n';
    const { section, match } = contextFor(doc, 'Then head to Hurricane Ridge.');

    const res = evaluateIssuePolicy({
      issue: { type: 'prose_json_mismatch', action: 'delete', evidenceFactIds: [] },
      match,
      section,
      canonicalFactBundle: buildFactBundle([[]]),
      itineraryData,
    });

    expect(res.status).toBe(POLICY_STATUS.ITINERARY_EVIDENCE_MISSING);
  });
});

describe('failure isolation', () => {
  /** A bundle whose fact index throws on access, simulating corrupt evidence. */
  function corruptBundle() {
    return {
      facts: [],
      get byId() {
        throw new Error('corrupt fact index');
      },
    };
  }

  test('a malformed issue returns policy_error without throwing', () => {
    const res = evaluateIssuePolicy({
      issue: { type: 'closure_conflict', action: 'replace', evidenceFactIds: ['x'] },
      match: { matchedText: 'x' },
      section: { text: '' },
      // Corrupt fact index — evidence lookup throws part-way through evaluation.
      canonicalFactBundle: corruptBundle(),
    });

    expect(res.status).toBe(POLICY_STATUS.POLICY_ERROR);
    expect(res.patch).toBeNull();
  });

  test('one broken issue does not block independent valid issues', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const results = [
      evaluateIssuePolicy({
        issue: { type: 'closure_conflict', action: 'replace', evidenceFactIds: ['y'] },
        match: { matchedText: 'x' },
        section: { text: '' },
        canonicalFactBundle: corruptBundle(),
      }),
      evaluateIssuePolicy({
        issue: {
          type: 'closure_conflict',
          action: 'replace',
          replacementText: 'x',
          evidenceFactIds: [olymClosure.id],
        },
        match,
        section,
        canonicalFactBundle: bundle,
      }),
    ];

    expect(results[0].status).toBe(POLICY_STATUS.POLICY_ERROR);
    expect(results[1].status).toBe(POLICY_STATUS.APPROVED);
  });
});

describe('policy output feeds planPatches', () => {
  test('approved results flow into a patch plan and mutate content', () => {
    const bundle = buildFactBundle([[olymClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const policyResults = [
      evaluateIssuePolicy({
        issue: {
          type: 'closure_conflict',
          action: 'replace',
          replacementText: 'x',
          evidenceFactIds: [olymClosure.id],
        },
        match,
        section,
        canonicalFactBundle: bundle,
      }),
    ];

    const approved = policyResults
      .filter((r) => r.status === POLICY_STATUS.APPROVED)
      .map((r) => r.patch);

    const { accepted } = planPatches(approved);
    const { content } = applyPatches(OLYM_DOC, accepted);

    expect(content).toContain('NPS currently reports');
    expect(content).not.toContain('Rialto Beach is open right now.');
  });

  test('no approved policies leaves the response byte-for-byte identical', () => {
    const bundle = buildFactBundle([[glacClosure]]);
    const { section, match } = contextFor(OLYM_DOC, 'Rialto Beach is open right now.');

    const res = evaluateIssuePolicy({
      issue: {
        type: 'closure_conflict',
        action: 'replace',
        replacementText: 'x',
        evidenceFactIds: [glacClosure.id],
      },
      match,
      section,
      canonicalFactBundle: bundle,
    });

    const approved = [res].filter((r) => r.status === POLICY_STATUS.APPROVED).map((r) => r.patch);
    const { accepted } = planPatches(approved);
    const { content } = applyPatches(OLYM_DOC, accepted);

    expect(accepted).toHaveLength(0);
    expect(content).toBe(OLYM_DOC);
  });
});
