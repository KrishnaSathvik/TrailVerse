const {
  REVIEWER_MODE,
  OP_TYPE,
  resolveReviewerMode,
  applyMutationPlan,
  expectedLengthFor,
  auditFinalResponse,
  runReviewerFailSafe,
} = require('../reviewerFailSafe');
const { POLICY_STATUS, POLICY_BASIS } = require('../responsePatchPolicy');
const { splitIntoSections } = require('../responseSections');
const { makeFact, buildFactBundle, AUTHORITY, STATUS } = require('../canonicalFacts');
const { findPlaceholderSpans, stripPlaceholderSpans } = require('../itineraryPlaceholders');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

const DOC = [
  'Here is your Olympic plan.',
  '',
  '## Day 1 — Hoh Rain Forest',
  'Rialto Beach is open right now.',
  'Timed entry is required in July.',
  '',
  '## Day 2 — Ruby Beach',
  'Tide pools at low tide.',
  '',
].join('\n');

const closureFact = makeFact({
  source: 'nps',
  category: 'closure',
  sourceId: 'c1',
  text: 'Rialto Beach access road closed',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  authority: AUTHORITY.AUTHORITATIVE,
  status: STATUS.ACTIVE_CLOSURE,
  retrievedAt: RETRIEVED_AT,
});

const permitFact = makeFact({
  source: 'recreation_gov',
  category: 'permit',
  sourceId: 'F1',
  text: 'Wilderness Permit — Recreation.gov listing only',
  parkCode: 'olym',
  parkName: 'Olympic National Park',
  url: 'https://www.recreation.gov/permits/72940',
  authority: AUTHORITY.LISTING_ONLY,
  status: STATUS.LISTING_ONLY,
  retrievedAt: RETRIEVED_AT,
});

const BUNDLE = buildFactBundle([[closureFact, permitFact]]);

/** Minimal approved policy result targeting a quote in DOC. */
function approved(quote, overrides = {}) {
  const start = DOC.indexOf(quote);
  return {
    status: POLICY_STATUS.APPROVED,
    derivedCritical: true,
    allowedAction: 'replace',
    policyBasis: POLICY_BASIS.POSITIVE_CONTRADICTION,
    scopeSource: 'resolved_metadata',
    acceptedFactIds: [closureFact.id],
    replacementSource: 'renderer',
    ...overrides,
    patch: {
      issue: {
        type: 'closure_conflict',
        action: overrides.action || 'replace',
        replacementText: overrides.replacementText ?? 'NPS reports the access road is closed.',
      },
      match: {
        absoluteStart: start,
        absoluteEnd: start + quote.length,
        matchedText: quote,
      },
    },
  };
}

/** Unresolved critical finding, the only kind that can lead to quarantine. */
function unresolvedCriticalResult(quote, overrides = {}) {
  const start = DOC.indexOf(quote);
  return {
    status: POLICY_STATUS.NOT_CONTRADICTED,
    derivedCritical: true,
    policyBasis: POLICY_BASIS.POSITIVE_CONTRADICTION,
    scopeSource: 'resolved_metadata',
    acceptedFactIds: [closureFact.id],
    ...overrides,
    patch: {
      issue: { type: 'closure_conflict', action: 'replace' },
      match: { absoluteStart: start, absoluteEnd: start + quote.length, matchedText: quote },
    },
  };
}

function run(overrides = {}) {
  return runReviewerFailSafe({
    originalContent: DOC,
    mode: REVIEWER_MODE.ENFORCE,
    sections: splitIntoSections(DOC),
    canonicalFactBundle: BUNDLE,
    policyResults: [],
    ...overrides,
  });
}

describe('reviewer modes', () => {
  test('missing or malformed mode defaults to shadow', () => {
    expect(resolveReviewerMode(undefined)).toBe(REVIEWER_MODE.SHADOW);
    expect(resolveReviewerMode('')).toBe(REVIEWER_MODE.SHADOW);
    expect(resolveReviewerMode('ENFORCE_ALL')).toBe(REVIEWER_MODE.SHADOW);
    expect(resolveReviewerMode('true')).toBe(REVIEWER_MODE.SHADOW);
    expect(resolveReviewerMode('enforce')).toBe(REVIEWER_MODE.ENFORCE);
    expect(resolveReviewerMode(' Off ')).toBe(REVIEWER_MODE.OFF);
  });

  test('off returns byte-for-byte identical content and skips evaluation', () => {
    const res = run({ mode: 'off', policyResults: [approved('Rialto Beach is open right now.')] });

    expect(res.content).toBe(DOC);
    expect(res.metadata.reviewStatus).toBe('skipped');
    expect(res.appliedPatches).toEqual([]);
  });

  test('shadow returns byte-for-byte identical content', () => {
    const res = run({ mode: 'shadow', policyResults: [approved('Rialto Beach is open right now.')] });
    expect(res.content).toBe(DOC);
    expect(res.appliedPatches).toEqual([]);
  });

  test('shadow records hypothetical patches, warnings and quarantine', () => {
    const res = run({
      mode: 'shadow',
      policyResults: [
        approved('Rialto Beach is open right now.'),
        approved('Timed entry is required in July.', {
          action: 'add_warning',
          policyBasis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
          acceptedFactIds: [permitFact.id],
          replacementText: 'Check Recreation.gov.',
        }),
      ],
    });

    expect(res.content).toBe(DOC);
    expect(res.metadata.wouldApply).toBe(1);
    expect(res.metadata.wouldWarn).toBe(1);
    expect(res.metadata.wouldQuarantine).toBe(0);
  });

  test('enforce applies approved mutations only', () => {
    const res = run({ policyResults: [approved('Rialto Beach is open right now.')] });

    expect(res.content).toContain('NPS reports the access road is closed.');
    expect(res.content).not.toContain('Rialto Beach is open right now.');
    expect(res.guardStatus).toBe('passed');
  });

  test('no accepted operations returns the original byte-for-byte', () => {
    const res = run({ policyResults: [] });
    expect(res.content).toBe(DOC);
    expect(res.metadata.lengthDelta).toBe(0);
  });
});

describe('per-section cap and priority', () => {
  const quotes = [
    'Here is your Olympic plan.',
    'Rialto Beach is open right now.',
    'Timed entry is required in July.',
    'Tide pools at low tide.',
  ];

  test('critical contradictions are applied before certainty downgrades', () => {
    const res = run({
      policyResults: [
        approved(quotes[2], {
          policyBasis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
          replacementText: 'CERTAINTY',
        }),
        approved(quotes[1], { replacementText: 'CONTRADICTION' }),
      ],
    });

    expect(res.content).toContain('CONTRADICTION');
    expect(res.content).toContain('CERTAINTY');
    expect(res.metadata.patchesApplied).toBe(2);
  });

  test('the cap is per section, not global', () => {
    const day1 = [
      approved('Rialto Beach is open right now.', { replacementText: 'A' }),
      approved('Timed entry is required in July.', { replacementText: 'B' }),
    ];
    const other = [
      approved('Here is your Olympic plan.', { replacementText: 'C' }),
      approved('Tide pools at low tide.', { replacementText: 'D' }),
    ];

    const res = run({ policyResults: [...day1, ...other] });
    expect(res.metadata.patchesApplied).toBe(4);
    expect(res.metadata.patchesSkippedByCap).toBe(0);
  });

  test('a fourth patch in one section is skipped by the cap', () => {
    const longDoc = ['## Day 1 — Hoh', 'AAAA', 'BBBB', 'CCCC', 'DDDD', ''].join('\n');
    const sections = splitIntoSections(longDoc);
    const results = ['AAAA', 'BBBB', 'CCCC', 'DDDD'].map((q) => {
      const start = longDoc.indexOf(q);
      return {
        status: POLICY_STATUS.APPROVED,
        derivedCritical: true,
        policyBasis: POLICY_BASIS.POSITIVE_CONTRADICTION,
        scopeSource: 'resolved_metadata',
        acceptedFactIds: [closureFact.id],
        patch: {
          issue: { action: 'replace', replacementText: `X${q}` },
          match: { absoluteStart: start, absoluteEnd: start + q.length, matchedText: q },
        },
      };
    });

    const res = runReviewerFailSafe({
      originalContent: longDoc,
      mode: 'enforce',
      sections,
      policyResults: results,
      canonicalFactBundle: BUNDLE,
    });

    expect(res.metadata.patchesApplied).toBe(3);
    expect(res.metadata.patchesSkippedByCap).toBe(1);
  });
});

describe('quarantine criteria', () => {
  test('two unpatchable authoritative contradictions quarantine a known-scope section', () => {
    const res = run({
      policyResults: [
        unresolvedCriticalResult('Rialto Beach is open right now.'),
        unresolvedCriticalResult('Timed entry is required in July.'),
      ],
    });

    expect(res.sectionReplacements).toHaveLength(1);
    expect(res.content).toContain('could not be safely verified');
    expect(res.content).toContain('Rialto Beach access road closed');
    expect(res.content).not.toContain('Rialto Beach is open right now.');
  });

  test('certainty downgrades alone cannot quarantine', () => {
    const res = run({
      policyResults: [
        unresolvedCriticalResult('Rialto Beach is open right now.', {
          policyBasis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
        }),
        unresolvedCriticalResult('Timed entry is required in July.', {
          policyBasis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
        }),
      ],
    });

    expect(res.sectionReplacements).toHaveLength(0);
    expect(res.content).toBe(DOC);
  });

  test('unknown scope cannot quarantine', () => {
    const res = run({
      policyResults: [
        unresolvedCriticalResult('Rialto Beach is open right now.', { scopeSource: 'unknown' }),
        unresolvedCriticalResult('Timed entry is required in July.', { scopeSource: 'unknown' }),
      ],
    });

    expect(res.sectionReplacements).toHaveLength(0);
  });

  test('a single unresolved contradiction does not quarantine', () => {
    const res = run({ policyResults: [unresolvedCriticalResult('Rialto Beach is open right now.')] });
    expect(res.sectionReplacements).toHaveLength(0);
  });

  test('many noncritical findings never quarantine', () => {
    const results = ['Rialto Beach is open right now.', 'Timed entry is required in July.'].map((q) =>
      unresolvedCriticalResult(q, { derivedCritical: false })
    );
    const res = run({ policyResults: results });
    expect(res.sectionReplacements).toHaveLength(0);
  });

  test('quarantine supersedes patches inside that section but not elsewhere', () => {
    const res = run({
      policyResults: [
        unresolvedCriticalResult('Rialto Beach is open right now.'),
        unresolvedCriticalResult('Timed entry is required in July.'),
        approved('Tide pools at low tide.', { replacementText: 'ELSEWHERE-APPLIED' }),
      ],
    });

    expect(res.sectionReplacements).toHaveLength(1);
    expect(res.content).toContain('ELSEWHERE-APPLIED');
    expect(res.metadata.patchesApplied).toBe(1);
  });
});

describe('warning placement', () => {
  test('a scoped warning is inserted after its owning section', () => {
    const res = run({
      policyResults: [
        approved('Timed entry is required in July.', {
          action: 'add_warning',
          policyBasis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
          acceptedFactIds: [permitFact.id],
        }),
      ],
    });

    // Assert structure and placement, not wording.
    expect(res.insertedWarnings).toHaveLength(1);
    const [warning] = res.insertedWarnings;

    expect(warning.warningType).toBe('section');
    expect(warning.evidenceFactIds).toEqual([permitFact.id]);

    const day1 = splitIntoSections(DOC).find((sec) => sec.label.includes('Day 1'));
    expect(warning.startOffset).toBe(day1.endOffset);
    expect(warning.startOffset).toBe(warning.endOffset); // zero-width insert

    // Park-scoped warnings name the park.
    expect(warning.replacementText).toContain('Olympic National Park');
  });

  test('unknown-scope warnings collect into one final block', () => {
    const res = run({
      policyResults: [
        approved('Timed entry is required in July.', {
          action: 'add_warning',
          scopeSource: 'unknown',
          acceptedFactIds: [permitFact.id],
        }),
        approved('Rialto Beach is open right now.', {
          action: 'add_warning',
          scopeSource: 'unknown',
          acceptedFactIds: [closureFact.id],
        }),
      ],
    });

    expect(res.insertedWarnings).toHaveLength(1);
    const [block] = res.insertedWarnings;

    expect(block.warningType).toBe('global');
    expect(block.sectionId).toBeNull();
    expect(block.evidenceFactIds.sort()).toEqual([closureFact.id, permitFact.id].sort());

    // A global block lands at the very end of the response.
    expect(block.startOffset).toBe(DOC.length);
  });

  test('duplicate evidence renders one warning', () => {
    const duplicate = () =>
      approved('Timed entry is required in July.', {
        action: 'add_warning',
        policyBasis: POLICY_BASIS.CERTAINTY_DOWNGRADE,
        acceptedFactIds: [permitFact.id],
      });

    const res = run({ policyResults: [duplicate(), duplicate(), duplicate()] });

    expect(res.metadata.warningsInserted).toBe(1);
    expect(res.insertedWarnings).toHaveLength(1);
    expect(res.insertedWarnings[0].evidenceFactIds).toEqual([permitFact.id]);
    expect(res.metadata.policyApproved).toBe(3); // three approvals, one rendered warning
  });
});

describe('reviewer error behaviour', () => {
  test('an error never mutates or quarantines', () => {
    const res = run({
      reviewerStatus: 'error',
      policyResults: [
        unresolvedCriticalResult('Rialto Beach is open right now.'),
        unresolvedCriticalResult('Timed entry is required in July.'),
      ],
    });

    expect(res.sectionReplacements).toEqual([]);
    expect(res.appliedPatches).toEqual([]);
    expect(res.metadata.contentUnverified).toBe(true);
    expect(res.content.startsWith(DOC)).toBe(true);
  });

  test('an error notice appears only for live-sensitive wording', () => {
    const sensitive = run({ reviewerStatus: 'error' });
    expect(sensitive.insertedWarnings).toEqual(['reviewer_error_notice']);
    expect(sensitive.metadata.warningsInserted).toBe(1);
    expect(sensitive.content.length).toBeGreaterThan(DOC.length);

    const benign = 'A short history of the park rangers and their work.\n';
    const res = runReviewerFailSafe({
      originalContent: benign,
      mode: 'enforce',
      reviewerStatus: 'error',
      canonicalFactBundle: BUNDLE,
    });

    expect(res.content).toBe(benign);
    expect(res.metadata.warningsInserted).toBe(0);
    expect(res.metadata.contentUnverified).toBe(true);
  });
});

describe('mutation plan mechanics', () => {
  test('operations apply highest offset first with a deterministic tie order', () => {
    const content = 'AAAA BBBB CCCC';
    const ops = [
      { type: OP_TYPE.REPLACE, startOffset: 0, endOffset: 4, replacementText: 'LONGREPLACEMENT', tieRank: 2, auditId: 'a' },
      { type: OP_TYPE.REPLACE, startOffset: 10, endOffset: 14, replacementText: 'C', tieRank: 2, auditId: 'b' },
      { type: OP_TYPE.INSERT_WARNING, startOffset: 14, endOffset: 14, replacementText: '!', tieRank: 1, auditId: 'c' },
    ];

    expect(applyMutationPlan(content, ops)).toBe('LONGREPLACEMENT BBBB C!');
    expect(applyMutationPlan(content, [...ops].reverse())).toBe('LONGREPLACEMENT BBBB C!');
  });

  test('expected length accounts for every operation', () => {
    const content = 'AAAA BBBB';
    const ops = [
      { startOffset: 0, endOffset: 4, replacementText: 'XY' },
      { startOffset: 5, endOffset: 9, replacementText: '' },
    ];

    expect(expectedLengthFor(content, ops)).toBe(content.length - 2 - 4);
  });

  test('overlapping operations are rejected rather than both applied', () => {
    const overlapping = [
      approved('Rialto Beach is open right now.', { replacementText: 'FIRST' }),
      approved('Beach is open', { replacementText: 'SECOND' }),
    ];

    const res = run({ policyResults: overlapping });
    expect(res.metadata.patchesApplied).toBe(1);
    expect(res.guardStatus).toBe('passed');
  });
});

describe('final-response guards', () => {
  test('expected length matching actual length passes', () => {
    const res = run({ policyResults: [approved('Rialto Beach is open right now.')] });
    expect(res.expectedLength).toBe(res.actualLength);
    expect(res.guardStatus).toBe('passed');
  });

  test('audited shortening passes', () => {
    const res = run({
      policyResults: [approved('Rialto Beach is open right now.', { replacementText: 'Closed.' })],
    });

    expect(res.actualLength).toBeLessThan(DOC.length);
    expect(res.guardStatus).toBe('passed');
  });

  test('unexplained shortening fails the audit', () => {
    const audit = auditFinalResponse({
      originalContent: DOC,
      mutatedContent: DOC.slice(0, 40),
      expectedLength: DOC.length,
    });

    expect(audit.status).toBe('failed');
    expect(audit.reasons.join(' ')).toMatch(/length_mismatch/);
  });

  test('newly introduced malformed markdown fails', () => {
    const broken = `${DOC}\nSee [Olympic](/parks/olympic`;
    const audit = auditFinalResponse({
      originalContent: DOC,
      mutatedContent: broken,
      expectedLength: broken.length,
    });

    expect(audit.status).toBe('failed');
    expect(audit.reasons.join(' ')).toMatch(/markdown_damage/);
  });

  test('pre-existing unchanged malformed markdown does not fail', () => {
    const alreadyBroken = 'Intro **unclosed bold\n\n## Day 1 — Hoh\nBody.\n';
    const audit = auditFinalResponse({
      originalContent: alreadyBroken,
      mutatedContent: alreadyBroken,
      expectedLength: alreadyBroken.length,
    });

    expect(audit.status).toBe('passed');
  });

  test('a placeholder introduced by mutation fails the audit', () => {
    const withPlaceholder = `${DOC}\n[ITINERARY note continues in structured data]\n`;
    const audit = auditFinalResponse({
      originalContent: DOC,
      mutatedContent: withPlaceholder,
      expectedLength: withPlaceholder.length,
    });

    expect(audit.status).toBe('failed');
    expect(audit.reasons).toContain('placeholder_artifact_introduced');
  });
});

describe('guard failure fallback', () => {
  test('a failing guard discards every mutation and reports it', () => {
    // Replacement text is a placeholder artifact — the guard must reject it.
    const res = run({
      policyResults: [
        approved('Rialto Beach is open right now.', {
          replacementText: '[remainder of the plan omitted]',
        }),
      ],
    });

    expect(res.guardStatus).toBe('failed');
    expect(res.metadata.mutationDiscarded).toBe(true);
    expect(res.metadata.contentUnverified).toBe(true);
    expect(res.content).not.toContain('[remainder of the plan omitted]');
    expect(res.content.startsWith(DOC)).toBe(true);
  });

  test('the fallback block is built only from accepted authoritative facts', () => {
    const res = run({
      policyResults: [
        approved('Rialto Beach is open right now.', {
          replacementText: '[remainder of the plan omitted]',
        }),
      ],
    });

    expect(res.content).toContain('Rialto Beach access road closed');
    expect(res.content).toContain('Olympic National Park');
    expect(res.content).not.toMatch(/Recreation\.gov listing only/);
  });
});

describe('shared placeholder utility', () => {
  test('standalone placeholder lines are removed whole', () => {
    const text = 'Plan text.\n[ITERARY note continues in structured data]\nMore text.\n';
    const { content, removed, lengthDelta } = stripPlaceholderSpans(text);

    expect(content).toBe('Plan text.\nMore text.\n');
    expect(removed).toHaveLength(1);
    expect(removed[0].standaloneLine).toBe(true);
    expect(lengthDelta).toBe(content.length - text.length);
  });

  test('markdown links are preserved', () => {
    const text = 'See [the plan continues in the Hoh](/parks/olympic-national-park) today.\n';
    expect(findPlaceholderSpans(text)).toHaveLength(0);
    expect(stripPlaceholderSpans(text).content).toBe(text);
  });

  test('removal audit records identity and span only, never the response', () => {
    const text = 'Plan.\n[rest of the itinerary omitted]\n';
    const res = runReviewerFailSafe({
      originalContent: text,
      mode: 'shadow',
      canonicalFactBundle: BUNDLE,
    });

    for (const entry of res.metadata.placeholderAudit) {
      expect(Object.keys(entry).sort()).toEqual(
        ['auditId', 'end', 'length', 'standaloneLine', 'start'].sort()
      );
      expect(JSON.stringify(entry)).not.toContain('itinerary omitted');
    }
  });

  test('shadow detects placeholders but leaves content byte-for-byte unchanged', () => {
    const text = 'Plan.\n[rest of the itinerary omitted]\n';
    const res = runReviewerFailSafe({
      originalContent: text,
      mode: 'shadow',
      canonicalFactBundle: BUNDLE,
    });

    expect(res.content).toBe(text);
    expect(res.metadata.placeholderDetected).toBe(true);
    expect(res.metadata.wouldStripPlaceholder).toBe(true);
    expect(res.metadata.placeholderStripped).toBe(false);
  });
});

describe('metadata is audit-safe', () => {
  test('metadata contains no response or itinerary prose', () => {
    const res = run({ policyResults: [approved('Rialto Beach is open right now.')] });
    const serialized = JSON.stringify(res.metadata);

    expect(serialized).not.toContain('Rialto Beach is open right now.');
    expect(serialized).not.toContain('Tide pools at low tide.');
    expect(serialized).not.toContain(DOC);
    expect(res.metadata.reviewStrategy).toBe('deterministic_patch_v1');
    expect(res.metadata).not.toHaveProperty('repairLlmUsed');
  });
});
