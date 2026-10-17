const {
  splitIntoSections,
  describeSectioning,
  validateSectionPartition,
  buildReviewWindows,
  windowOwnsSpan,
  sectionForOffset,
  findFencedRanges,
} = require('../responseSections');

/** Every test asserts the partition invariants hold for its input. */
function split(content) {
  const sections = splitIntoSections(content);
  const { valid, errors } = validateSectionPartition(content, sections);
  expect(errors).toEqual([]);
  expect(valid).toBe(true);
  return sections;
}

describe('canonical section partitioning', () => {
  test('a response with no headings becomes one section', () => {
    const content = 'Just a paragraph about Olympic.\nNo headings at all.';
    const sections = split(content);

    expect(sections).toHaveLength(1);
    expect(sections[0].startOffset).toBe(0);
    expect(sections[0].endOffset).toBe(content.length);
    expect(sections[0].text).toBe(content);
  });

  test('intro before the first heading is preserved as its own section', () => {
    const content = 'Here is your plan.\n\n## Day 1 — Hoh\nWalk the mossy trail.\n';
    const sections = split(content);

    expect(sections).toHaveLength(2);
    expect(sections[0].text).toBe('Here is your plan.\n\n');
    expect(sections[1].text.startsWith('## Day 1')).toBe(true);
  });

  test('trailing summary after the last day section is preserved', () => {
    const content = '## Day 1 — Hoh\nTrail.\n\n## Day 2 — Ruby Beach\nTide pools.\n\nSafe travels!\n';
    const sections = split(content);

    expect(sections).toHaveLength(2);
    expect(sections[1].text).toContain('Safe travels!');
    expect(sections[sections.length - 1].endOffset).toBe(content.length);
  });

  test('joining section text reconstructs the response exactly', () => {
    const content = [
      'Intro line.',
      '',
      '## Day 1 — Hoh Rain Forest',
      'Walk the Hall of Mosses.',
      '',
      '**Day 2 — Ruby Beach**',
      'Low tide at 07:12.',
      '',
      '### Estimated Costs',
      '- Entrance: $30',
      '',
      'Have fun.',
    ].join('\n');

    const sections = split(content);
    expect(sections.map((s) => s.text).join('')).toBe(content);
    expect(sections.length).toBeGreaterThan(2);
  });

  test('every character belongs to exactly one section', () => {
    const content = 'Intro\n\n## A\nalpha\n\n## B\nbeta\n';
    const sections = split(content);

    for (let i = 0; i < content.length; i += 1) {
      const owners = sections.filter((s) => i >= s.startOffset && i < s.endOffset);
      expect(owners).toHaveLength(1);
    }
  });

  test('a response ending without a newline still ends at content.length', () => {
    const content = '## Day 1 — Hoh\nNo trailing newline here';
    const sections = split(content);
    expect(sections[sections.length - 1].endOffset).toBe(content.length);
  });

  test('empty content yields no sections', () => {
    expect(splitIntoSections('')).toEqual([]);
    expect(splitIntoSections(null)).toEqual([]);
  });
});

describe('offset fidelity', () => {
  test('CRLF input keeps exact offsets and reconstructs byte-for-byte', () => {
    const lf = 'Intro\n\n## Day 1 — Hoh\nTrail\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    const lfSections = split(lf);
    const crlfSections = split(crlf);

    expect(crlfSections.map((s) => s.text).join('')).toBe(crlf);
    expect(crlfSections).toHaveLength(lfSections.length);
    expect(crlfSections[1].text.startsWith('## Day 1')).toBe(true);
  });

  test('emoji and unicode punctuation do not desync UTF-16 offsets', () => {
    const content = '🏔️ Intro — “quoted” text\n\n## Day 1 — Hoh 🌲\nMossy trail — lovely\n';
    const sections = split(content);

    expect(sections.map((s) => s.text).join('')).toBe(content);
    for (const section of sections) {
      expect(content.slice(section.startOffset, section.endOffset)).toBe(section.text);
    }
  });
});

describe('boundary detection rules', () => {
  test('repeated identical headings get unique section ids', () => {
    const content = '## Day 1 — Hoh\nalpha\n\n## Day 1 — Hoh\nbeta\n';
    const sections = split(content);

    const ids = sections.map((s) => s.sectionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['0:day-1-hoh', '1:day-1-hoh']);
  });

  test('headings inside fenced code blocks do not split', () => {
    const content = [
      'Intro',
      '',
      '```md',
      '## Not A Heading',
      '**Day 9 — fake**',
      '```',
      '',
      '## Real Heading',
      'body',
    ].join('\n');

    const sections = split(content);
    expect(sections).toHaveLength(2);
    expect(sections[1].label).toBe('## Real Heading');
    expect(sections[0].text).toContain('## Not A Heading');
  });

  test('an unterminated fence swallows the rest without splitting', () => {
    const content = 'Intro\n\n```\n## Inside\nstill inside\n';
    const { ranges, unterminated } = findFencedRanges(content);

    expect(ranges).toHaveLength(1);
    expect(ranges[0].end).toBe(content.length);
    expect(unterminated).toBe(true);
    expect(split(content)).toHaveLength(1);
  });

  test('unterminated fence is observable as a diagnostic', () => {
    const broken = describeSectioning('Intro\n\n```\n## Inside\n');
    expect(broken.unterminatedFence).toBe(true);
    expect(broken.sectionCount).toBe(1);

    const healthy = describeSectioning('Intro\n\n## Real\nbody\n');
    expect(healthy.unterminatedFence).toBe(false);
    expect(healthy.sectionCount).toBe(2);
  });

  test('"Day 1" in ordinary prose does not split', () => {
    const content = 'We cover a lot on Day 1 of the trip.\nDay 1 was long and rainy.\nDay 2 brings sun.\n';
    const sections = split(content);
    expect(sections).toHaveLength(1);
  });

  test('structural day headers with delimiters do split', () => {
    for (const header of ['Day 1 — Hoh', 'Day 1: Hoh', '**Day 1**', '- Day 1 — Hoh']) {
      const content = `Intro\n${header}\nbody\n`;
      expect(split(content)).toHaveLength(2);
    }
  });

  test('horizontal rules do not create sections', () => {
    const content = 'Intro\n\n---\n\nMore prose\n';
    expect(split(content)).toHaveLength(1);
  });

  test('label-less headings do not split and their text is preserved', () => {
    const content = 'Intro\n\n##\n\nmore text\n';
    const sections = split(content);

    expect(sections).toHaveLength(1);
    expect(sections[0].text).toBe(content);
  });

  test('consecutive headings produce sections without dropping text', () => {
    const content = '## A\n## B\n## C\nbody\n';
    const sections = split(content);

    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.text).join('')).toBe(content);
    expect(sections[0].text).toBe('## A\n');
  });
});

describe('review windows and ownership', () => {
  const content = [
    'Intro paragraph about the coast.',
    '',
    '## Day 1 — Hoh Rain Forest',
    'Timed entry permits are required in July.',
    '',
    '## Day 2 — Ruby Beach',
    'Tide pools at low tide.',
  ].join('\n');

  test('windows overlap for context while owned ranges partition exactly', () => {
    const sections = split(content);
    const windows = buildReviewWindows(content, sections, { contextChars: 40 });

    expect(windows).toHaveLength(sections.length);

    for (let i = 0; i < windows.length; i += 1) {
      expect(windows[i].ownedStartOffset).toBe(sections[i].startOffset);
      expect(windows[i].ownedEndOffset).toBe(sections[i].endOffset);
      expect(windows[i].reviewText).toBe(
        content.slice(windows[i].reviewStartOffset, windows[i].reviewEndOffset)
      );
    }

    // Owned ranges never overlap...
    for (let i = 0; i < windows.length - 1; i += 1) {
      expect(windows[i].ownedEndOffset).toBe(windows[i + 1].ownedStartOffset);
    }
    // ...while review ranges do.
    expect(windows[1].reviewStartOffset).toBeLessThan(windows[0].reviewEndOffset);
  });

  test('a quote visible in overlap context is patchable only by its owner', () => {
    const sections = split(content);
    const windows = buildReviewWindows(content, sections, { contextChars: 200 });

    const quote = 'Timed entry permits are required in July.';
    const absoluteStart = content.indexOf(quote);
    const owner = sectionForOffset(sections, absoluteStart);

    expect(owner.label).toBe('## Day 1 — Hoh Rain Forest');

    // Both windows can see the sentence as context.
    const seenBy = windows.filter((w) => w.reviewText.includes(quote));
    expect(seenBy.length).toBeGreaterThan(1);

    // Exactly one may act on it.
    const absoluteEnd = absoluteStart + quote.length;
    const canPatch = windows.filter((w) => windowOwnsSpan(w, absoluteStart, absoluteEnd));
    expect(canPatch).toHaveLength(1);
    expect(canPatch[0].sectionId).toBe(owner.sectionId);
  });

  test('a span starting inside ownership but ending past it is not owned', () => {
    const sections = split(content);
    const windows = buildReviewWindows(content, sections, { contextChars: 200 });
    const day1 = windows.find((w) => w.label.includes('Day 1'));

    // Starts one char before the boundary, runs into the next section.
    const start = day1.ownedEndOffset - 1;
    const end = day1.ownedEndOffset + 10;

    expect(windowOwnsSpan(day1, start, start + 1)).toBe(true);
    expect(windowOwnsSpan(day1, start, end)).toBe(false);

    // ...and no other window claims it either.
    expect(windows.filter((w) => windowOwnsSpan(w, start, end))).toHaveLength(0);
  });

  test('identical sentences at two locations resolve to different owners', () => {
    const dup = 'Bring a headlamp.';
    const doc = `## Day 1 — Hoh\n${dup}\n\n## Day 2 — Ruby Beach\n${dup}\n`;
    const sections = split(doc);

    const first = doc.indexOf(dup);
    const second = doc.indexOf(dup, first + 1);

    expect(first).not.toBe(second);
    expect(sectionForOffset(sections, first).sectionId).not.toBe(
      sectionForOffset(sections, second).sectionId
    );
  });

  test('windows clamp at document edges', () => {
    const sections = split(content);
    const windows = buildReviewWindows(content, sections, { contextChars: 10000 });

    expect(windows[0].reviewStartOffset).toBe(0);
    expect(windows[windows.length - 1].reviewEndOffset).toBe(content.length);
  });
});

describe('partition validator catches malformed input', () => {
  test('rejects a gap between sections', () => {
    const content = 'abcdef';
    const bad = [
      { startOffset: 0, endOffset: 2, text: 'ab' },
      { startOffset: 4, endOffset: 6, text: 'ef' },
    ];
    const { valid, errors } = validateSectionPartition(content, bad);

    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/gap or overlap/);
  });

  test('rejects sections that do not reconstruct the content', () => {
    const content = 'abcdef';
    const bad = [{ startOffset: 0, endOffset: 6, text: 'abcXef' }];
    const { valid, errors } = validateSectionPartition(content, bad);

    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/does not reconstruct/);
  });
});
