const {
  MATCH_STATUS,
  MATCH_TIER,
  PATCH_REJECTION,
  buildNormalizedIndex,
  resolveIssueMatch,
  planPatches,
  applyPatches,
} = require('../responsePatching');
const {
  splitIntoSections,
  buildReviewWindows,
  validateSectionPartition,
} = require('../responseSections');

/** Resolve one quote against a document, using the section that owns it. */
function resolve(content, quote, { contextChars = 200, sectionIndex = null, action = 'replace' } = {}) {
  const sections = splitIntoSections(content);
  const windows = buildReviewWindows(content, sections, { contextChars });
  const at = content.indexOf(quote.replace(/\s+/g, ' ').trim());
  const idx =
    sectionIndex != null
      ? sectionIndex
      : Math.max(
          0,
          sections.findIndex((s) => at >= s.startOffset && at < s.endOffset)
        );

  return {
    sections,
    windows,
    match: resolveIssueMatch({
      content,
      section: sections[idx],
      reviewWindow: windows[idx],
      issue: { exactQuote: quote, action, replacementText: 'REPLACED' },
    }),
  };
}

describe('normalized index maps back to original offsets', () => {
  test('whitespace runs collapse but spans cover the whole run', () => {
    const text = 'a   b';
    const index = buildNormalizedIndex(text);

    expect(index.normalizedText).toBe('a b');
    expect(index.originalStartByNormalizedIndex[1]).toBe(1);
    expect(index.originalEndByNormalizedIndex[1]).toBe(4);
    expect(index.originalStartByNormalizedIndex[2]).toBe(4);
  });

  test('folds do not change length so offsets stay aligned', () => {
    const text = '“quoted” — dash';
    const index = buildNormalizedIndex(text);

    expect(index.normalizedText).toBe('"quoted" - dash');
    expect(index.normalizedText.length).toBe(text.length);
  });
});

describe('match tiers', () => {
  const content = '## Day 1 — Hoh\nTimed entry permits are required in July.\nBring rain gear.\n';

  test('exact quote resolves to the correct original span', () => {
    const quote = 'Timed entry permits are required in July.';
    const { match } = resolve(content, quote);

    expect(match.status).toBe(MATCH_STATUS.CANDIDATE);
    expect(match.matchTier).toBe(MATCH_TIER.EXACT);
    expect(content.slice(match.absoluteStart, match.absoluteEnd)).toBe(quote);
  });

  test('smart quotes in the reviewer quote still resolve uniquely', () => {
    const doc = '## Day 1\nThe "Hall of Mosses" trail is easy.\n';
    const { match } = resolve(doc, 'The “Hall of Mosses” trail is easy.');

    expect(match.status).toBe(MATCH_STATUS.CANDIDATE);
    expect(match.matchTier).toBe(MATCH_TIER.NORMALIZED);
    expect(match.matchedText).toBe('The "Hall of Mosses" trail is easy.');
  });

  test('em dash versus hyphen resolves uniquely', () => {
    const doc = '## Day 1\nDrive Seattle - Port Angeles takes 2.5 hours.\n';
    const { match } = resolve(doc, 'Drive Seattle — Port Angeles takes 2.5 hours.');

    expect(match.status).toBe(MATCH_STATUS.CANDIDATE);
    expect(match.matchTier).toBe(MATCH_TIER.NORMALIZED);
  });

  test('CRLF and whitespace folding map back to correct original offsets', () => {
    const doc = '## Day 1\r\nTimed entry   permits\r\nare required.\r\n';
    const { match } = resolve(doc, 'Timed entry permits are required.');

    expect(match.status).toBe(MATCH_STATUS.CANDIDATE);
    expect(doc.slice(match.absoluteStart, match.absoluteEnd)).toBe(
      'Timed entry   permits\r\nare required.'
    );
  });

  test('emoji before the quote does not shift offsets', () => {
    const doc = '## Day 1 🏔️🌲\nPermits are required.\n';
    const quote = 'Permits are required.';
    const { match } = resolve(doc, quote);

    expect(doc.slice(match.absoluteStart, match.absoluteEnd)).toBe(quote);
    expect(match.absoluteStart).toBe(doc.indexOf(quote));
  });

  test('case-sensitive unique match wins before the case-insensitive fallback', () => {
    const doc = '## Day 1\nPermits are required.\n';
    const { match } = resolve(doc, 'Permits are required.');
    expect(match.matchTier).toBe(MATCH_TIER.EXACT);
  });

  test('case-insensitive fallback applies only when stricter tiers find nothing', () => {
    const doc = '## Day 1\nPERMITS ARE REQUIRED.\n';
    const { match } = resolve(doc, 'Permits are required.');

    expect(match.status).toBe(MATCH_STATUS.CANDIDATE);
    expect(match.matchTier).toBe(MATCH_TIER.NORMALIZED_CI);
    expect(match.matchedText).toBe('PERMITS ARE REQUIRED.');
  });

  test('markdown syntax is not stripped during matching', () => {
    const doc = '## Day 1\nSee **Hoh Rain Forest** for details.\n';

    const withMarkdown = resolve(doc, 'See **Hoh Rain Forest** for details.');
    expect(withMarkdown.match.status).toBe(MATCH_STATUS.CANDIDATE);

    const withoutMarkdown = resolve(doc, 'See Hoh Rain Forest for details.');
    expect(withoutMarkdown.match.status).toBe(MATCH_STATUS.NOT_FOUND);
  });

  test('a repeated normalized quote is ambiguous, never guessed', () => {
    const doc = '## Day 1\nBring a headlamp.\nLater: bring a headlamp.\nBring a headlamp.\n';
    const { match } = resolve(doc, 'Bring a headlamp.');

    expect(match.status).toBe(MATCH_STATUS.AMBIGUOUS);
    expect(match.candidateCount).toBeGreaterThan(1);
  });

  test('a missing quote is not_found and an empty quote is invalid', () => {
    const doc = '## Day 1\nPermits are required.\n';
    expect(resolve(doc, 'Nothing like this exists').match.status).toBe(MATCH_STATUS.NOT_FOUND);
    expect(resolve(doc, '   ').match.status).toBe(MATCH_STATUS.INVALID_QUOTE);
  });
});

describe('ownership boundaries', () => {
  const content = [
    'Intro about the coast.',
    '',
    '## Day 1 — Hoh',
    'Timed entry permits are required in July.',
    '',
    '## Day 2 — Ruby Beach',
    'Tide pools at low tide.',
  ].join('\n');

  test('a quote visible only in overlap context is not patchable by the neighbour', () => {
    const sections = splitIntoSections(content);
    const windows = buildReviewWindows(content, sections, { contextChars: 400 });
    const quote = 'Timed entry permits are required in July.';

    // Day 2's window can see it, but does not own it.
    const day2 = windows.find((w) => w.label.includes('Day 2'));
    expect(day2.reviewText).toContain(quote);

    const match = resolveIssueMatch({
      content,
      section: sections[day2.index],
      reviewWindow: day2,
      issue: { exactQuote: quote, action: 'replace', replacementText: 'X' },
    });

    expect(match.status).toBe(MATCH_STATUS.OUTSIDE_WINDOW);
  });

  test('a quote starting inside ownership but ending outside is cross_boundary', () => {
    const sections = splitIntoSections(content);
    const windows = buildReviewWindows(content, sections, { contextChars: 400 });
    const day1 = windows.find((w) => w.label.includes('Day 1'));

    // Spans the tail of Day 1 into the Day 2 heading.
    const quote = content.slice(day1.ownedEndOffset - 12, day1.ownedEndOffset + 12);

    const match = resolveIssueMatch({
      content,
      section: sections[day1.index],
      reviewWindow: day1,
      issue: { exactQuote: quote, action: 'replace', replacementText: 'X' },
    });

    expect(match.status).toBe(MATCH_STATUS.CROSS_BOUNDARY);
  });
});

describe('patch planning', () => {
  const base = (start, end, extra = {}) => ({
    issue: { action: 'replace', replacementText: 'NEW', ...extra.issue },
    match: {
      status: MATCH_STATUS.CANDIDATE,
      absoluteStart: start,
      absoluteEnd: end,
      matchTier: MATCH_TIER.EXACT,
    },
    ...extra,
  });

  test('identical span with identical mutation deduplicates', () => {
    const { accepted, rejected } = planPatches([base(10, 20), base(10, 20)]);

    expect(accepted).toHaveLength(1);
    expect(accepted[0].duplicateCount).toBe(2);
    expect(rejected).toHaveLength(0);
  });

  test('identical span with different replacements is rejected', () => {
    const { accepted, rejected } = planPatches([
      base(10, 20),
      base(10, 20, { issue: { action: 'replace', replacementText: 'OTHER' } }),
    ]);

    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.rejection === PATCH_REJECTION.CONFLICTING)).toBe(true);
  });

  test('partially overlapping spans are both rejected', () => {
    const { accepted, rejected } = planPatches([base(10, 20), base(15, 25)]);

    expect(accepted).toHaveLength(0);
    expect(rejected.every((r) => r.rejection === PATCH_REJECTION.OVERLAPPING)).toBe(true);
  });

  test('a contained span is rejected alongside its container', () => {
    const { accepted, rejected } = planPatches([base(10, 30), base(15, 20)]);

    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
  });

  test('non-overlapping spans are all accepted', () => {
    const { accepted, rejected } = planPatches([base(10, 20), base(30, 40), base(50, 60)]);

    expect(accepted).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  test('unresolved matches never reach the plan', () => {
    const { accepted, rejected } = planPatches([
      { issue: { action: 'replace', replacementText: 'X' }, match: { status: MATCH_STATUS.AMBIGUOUS } },
      { issue: { action: 'replace', replacementText: 'X' }, match: { status: MATCH_STATUS.CROSS_BOUNDARY } },
    ]);

    expect(accepted).toHaveLength(0);
    expect(rejected.map((r) => r.rejection).sort()).toEqual([
      MATCH_STATUS.AMBIGUOUS,
      MATCH_STATUS.CROSS_BOUNDARY,
    ]);
  });

  test('a replace action with no replacement text is rejected', () => {
    const { accepted, rejected } = planPatches([
      base(10, 20, { issue: { action: 'replace', replacementText: '' } }),
    ]);

    expect(accepted).toHaveLength(0);
    expect(rejected[0].rejection).toBe(PATCH_REJECTION.MISSING_REPLACEMENT);
  });
});

describe('patch application', () => {
  test('applies highest offset first so earlier spans do not shift', () => {
    const content = 'AAAA BBBB CCCC';
    const patches = [
      { absoluteStart: 0, absoluteEnd: 4, action: 'replace', replacementText: 'A-VERY-LONG-REPLACEMENT' },
      { absoluteStart: 10, absoluteEnd: 14, action: 'replace', replacementText: 'C' },
    ];

    const result = applyPatches(content, patches);
    expect(result.content).toBe('A-VERY-LONG-REPLACEMENT BBBB C');
    expect(result.applied).toHaveLength(2);
  });

  test('replacement text is inserted verbatim without reformatting', () => {
    const content = 'Permits are required.';
    const replacement = '  Check   Recreation.gov — “timed entry” status.  ';
    const result = applyPatches(content, [
      { absoluteStart: 0, absoluteEnd: content.length, action: 'replace', replacementText: replacement },
    ]);

    expect(result.content).toBe(replacement);
  });

  test('deltas report the length change per patch', () => {
    const content = 'AAAA BBBB';
    const result = applyPatches(content, [
      { absoluteStart: 0, absoluteEnd: 4, action: 'replace', replacementText: 'XY' },
    ]);

    expect(result.deltas[0]).toMatchObject({
      absoluteStart: 0,
      absoluteEnd: 4,
      originalLength: 4,
      replacementLength: 2,
      lengthChange: -2,
    });
  });

  test('no accepted patches leaves the response byte-for-byte unchanged', () => {
    const content = '## Day 1 — Hoh\nPermits are required.\n';
    const result = applyPatches(content, []);

    expect(result.content).toBe(content);
    expect(result.applied).toHaveLength(0);
    expect(result.deltas).toHaveLength(0);
  });
});

describe('deletion safety', () => {
  test('deleting a standalone line removes the whole line', () => {
    const content = 'Intro line.\nTimed entry is required.\nBring rain gear.\n';
    const quote = 'Timed entry is required.';
    const start = content.indexOf(quote);

    const result = applyPatches(content, [
      { absoluteStart: start, absoluteEnd: start + quote.length, action: 'delete' },
    ]);

    expect(result.content).toBe('Intro line.\nBring rain gear.\n');
    expect(result.applied[0].deletionMode).toBe('line');
  });

  test('deleting a bullet whose only content is the match removes the bullet', () => {
    const content = '- Bring a headlamp.\n- Bring rain gear.\n';
    const quote = 'Bring a headlamp.';
    const start = content.indexOf(quote);

    const result = applyPatches(content, [
      { absoluteStart: start, absoluteEnd: start + quote.length, action: 'delete' },
    ]);

    expect(result.content).toBe('- Bring rain gear.\n');
  });

  test('deleting one sentence inside a paragraph preserves the rest', () => {
    const content = 'Arrive early. Timed entry is required. Parking fills by 8am.\n';
    const quote = 'Timed entry is required. ';
    const start = content.indexOf(quote);

    const result = applyPatches(content, [
      { absoluteStart: start, absoluteEnd: start + quote.length, action: 'delete' },
    ]);

    expect(result.content).toBe('Arrive early. Parking fills by 8am.\n');
    expect(result.applied[0].deletionMode).toBe('span');
  });

  test('a deletion that would break a markdown link is rejected', () => {
    const content = 'See [Olympic](/parks/olympic-national-park) for details.\n';
    const quote = 'Olympic](/parks/olympic';
    const start = content.indexOf(quote);

    const result = applyPatches(content, [
      { absoluteStart: start, absoluteEnd: start + quote.length, action: 'delete' },
    ]);

    expect(result.applied).toHaveLength(0);
    expect(result.unapplied[0].rejection).toBe(PATCH_REJECTION.UNSAFE_DELETE);
    expect(result.content).toBe(content);
  });

  test('a deletion leaving unmatched emphasis is rejected', () => {
    const content = 'Trail is **closed for the season** right now.\n';
    const quote = '**closed for';
    const start = content.indexOf(quote);

    const result = applyPatches(content, [
      { absoluteStart: start, absoluteEnd: start + quote.length, action: 'delete' },
    ]);

    expect(result.unapplied[0].rejection).toBe(PATCH_REJECTION.UNSAFE_DELETE);
  });
});

describe('sections must be recomputed after mutation', () => {
  test('patched content re-splits into a valid exact partition', () => {
    const content = 'Intro.\n\n## Day 1 — Hoh\nPermits are required.\n\n## Day 2 — Ruby\nTide pools.\n';
    const quote = 'Permits are required.';
    const start = content.indexOf(quote);

    const { content: patched } = applyPatches(content, [
      {
        absoluteStart: start,
        absoluteEnd: start + quote.length,
        action: 'replace',
        replacementText: 'Check Recreation.gov for current permit status before you go, well in advance.',
      },
    ]);

    const finalSections = splitIntoSections(patched);
    const { valid, errors } = validateSectionPartition(patched, finalSections);

    expect(errors).toEqual([]);
    expect(valid).toBe(true);
    expect(finalSections.map((s) => s.text).join('')).toBe(patched);
  });

  test('original section offsets are stale after patching and must not be reused', () => {
    const content = 'Intro.\n\n## Day 1 — Hoh\nPermits are required.\n\n## Day 2 — Ruby\nTide pools.\n';
    const originalSections = splitIntoSections(content);
    const quote = 'Permits are required.';
    const start = content.indexOf(quote);

    const { content: patched } = applyPatches(content, [
      {
        absoluteStart: start,
        absoluteEnd: start + quote.length,
        action: 'replace',
        replacementText: 'Much longer replacement text that shifts every following offset.',
      },
    ]);

    const staleDay2 = originalSections.find((s) => s.label.includes('Day 2'));
    // Reusing the old offsets against the new content no longer lands on Day 2.
    expect(patched.slice(staleDay2.startOffset, staleDay2.endOffset)).not.toBe(staleDay2.text);

    // Re-splitting locates it correctly.
    const freshDay2 = splitIntoSections(patched).find((s) => s.label.includes('Day 2'));
    expect(patched.slice(freshDay2.startOffset, freshDay2.endOffset)).toBe(freshDay2.text);
  });
});
