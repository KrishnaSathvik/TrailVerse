'use strict';

/**
 * SHADOW STREAM STRUCTURE — offline replay.
 *
 * The tracker reads a live provider stream whose chunk boundaries fall wherever
 * the network puts them. The 2026-08-27 run delivered 6,739 bytes in 1,440
 * deltas — ~4.7 bytes each — so splits land mid-key, mid-string and mid-escape
 * routinely. Every structural assertion here is therefore replayed under
 * adversarial chunking, not just on a whole document.
 *
 * It also pins the boundary this module must never cross: it reports WHEN
 * structure exists, never plan content, and nothing downstream may treat a
 * structurally complete streamed unit as validated.
 */

const {
  createShadowStructureTracker,
  MILESTONE,
  MAX_KEY_CHARS,
  TOP_LEVEL_SECTIONS,
} = require('../shadowStreamStructure');
const { projectShadowStructure } = require('../modelLatencyAnatomy');

/** A realistic artifact: nested stop alternatives, plan alternatives, narrative sections. */
const ARTIFACT = {
  intro: 'Three easygoing days. Braces {like this} and "quotes" and a \\backslash live here.',
  narrativeSections: [
    { placement: 'before_plan', heading: null, markdown: 'Drive setup {not a day}' },
    { placement: 'after_plan', heading: 'Heat', markdown: 'Afternoons are hot' },
  ],
  days: [
    {
      id: 'day-1',
      dayNumber: 1,
      label: 'Painted Canyon',
      overnightLocation: null,
      stops: [
        {
          id: 'stop-1', order: 1, type: 'viewpoint', name: 'Painted Canyon Overlook',
          note: 'Sunrise light. Contains a } brace and a "quoted" phrase.',
          startTime: '', timeWindow: 'Early morning', duration: 45,
          latitude: 46.9, longitude: -103.4, exposureLevel: 'low',
          alternatives: [{ name: 'Boicourt Overlook', why: 'closer parking' }],
        },
        {
          id: 'stop-2', order: 2, type: 'scenic_drive', name: 'Scenic Loop Drive',
          note: 'Wildlife likely.', startTime: '', timeWindow: 'Midday', duration: 120,
          alternatives: [],
        },
      ],
    },
    {
      id: 'day-2',
      dayNumber: 2,
      label: 'Wind Canyon',
      stops: [
        {
          id: 'stop-3', order: 1, type: 'walk', name: 'Wind Canyon Trail',
          note: 'Short walk.', startTime: '', timeWindow: 'Morning', duration: 40,
          alternatives: [{ name: 'River bend' }, { name: 'Prairie dog town' }],
        },
      ],
    },
    {
      id: 'day-3', dayNumber: 3, label: 'North Unit', stops: [
        { id: 'stop-4', order: 1, type: 'landmark', name: 'Oxbow Overlook', note: '', startTime: '', duration: 60 },
      ],
    },
  ],
  alternatives: [{ name: 'Plan B: Medora', why: 'if roads close' }],
};

const DOC = JSON.stringify(ARTIFACT);

/** Replay a document through the tracker with a given chunking strategy. */
function replay(text, chunker, { startAt = 0 } = {}) {
  const tracker = createShadowStructureTracker({ dispatchStartedAtMs: startAt });
  let t = startAt;
  for (const chunk of chunker(text)) {
    t += 1; // one notional millisecond per chunk, so ordering is observable
    tracker.consume(chunk, t);
  }
  return tracker.snapshot();
}

const whole = (s) => [s];
const oneByte = (s) => Array.from(s);
const fixed = (n) => (s) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out; };
const random = (seed) => (s) => {
  // Deterministic pseudo-random splits, so a failure is reproducible.
  let x = seed; const out = []; let i = 0;
  while (i < s.length) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const n = 1 + (x % 9);
    out.push(s.slice(i, i + n)); i += n;
  }
  return out;
};

// ---------------------------------------------------------------------------
// §1/§2 — milestones, under every chunking strategy
// ---------------------------------------------------------------------------

describe('structural milestones are chunk-boundary independent', () => {
  const strategies = [
    ['whole document', whole],
    ['one byte at a time', oneByte],
    ['2-byte chunks', fixed(2)],
    ['3-byte chunks', fixed(3)],
    ['7-byte chunks', fixed(7)],
    ['pseudo-random 1-9 byte chunks (seed 1)', random(1)],
    ['pseudo-random 1-9 byte chunks (seed 99)', random(99)],
  ];

  test.each(strategies)('%s yields identical structure', (_label, chunker) => {
    const s = replay(DOC, chunker);
    expect(s.structurallyComplete).toBe(true);
    expect(s.malformedReason).toBeNull();
    // 3 days, 4 stops. The stop-level `alternatives` objects (3 of them), the
    // plan-level `alternatives` object and the 2 `narrativeSections` objects
    // must NOT be counted. Measured alternatives on this artifact: counting
    // every object inside any array reports 13; counting objects at depth 2 as
    // days reports 6. Only the path match gets 3 and 4.
    expect(s.dayCompletionMs.map((d) => d.dayOrdinal)).toEqual([1, 2, 3]);
    expect(s.stopCompletionCount).toBe(4);
    expect(s.firstCompleteStopMs).not.toBeNull();
    expect(s.firstCompleteDayMs).not.toBeNull();
    expect(s.secondCompleteDayMs).not.toBeNull();
    expect(s.allDaysStructurallyCompleteMs).not.toBeNull();
    expect(s.toolCompleteMs).not.toBeNull();
  });

  test('milestones are strictly ordered: stop <= day 1 <= day 2 <= all days <= tool', () => {
    const s = replay(DOC, oneByte);
    expect(s.firstCompleteStopMs).toBeLessThanOrEqual(s.firstCompleteDayMs);
    expect(s.firstCompleteDayMs).toBeLessThanOrEqual(s.secondCompleteDayMs);
    expect(s.secondCompleteDayMs).toBeLessThanOrEqual(s.allDaysStructurallyCompleteMs);
    expect(s.allDaysStructurallyCompleteMs).toBeLessThanOrEqual(s.toolCompleteMs);
    // The point of the whole exercise: Day 1 exists strictly before the tool
    // stream ends. If these were equal there would be nothing to study.
    expect(s.firstCompleteDayMs).toBeLessThan(s.toolCompleteMs);
  });

  test('one-byte replay dates each day earlier than the next', () => {
    const s = replay(DOC, oneByte);
    const [d1, d2, d3] = s.dayCompletionMs;
    expect(d1.tMs).toBeLessThan(d2.tMs);
    expect(d2.tMs).toBeLessThan(d3.tMs);
  });
});

// ---------------------------------------------------------------------------
// §6 — the adversarial content cases
// ---------------------------------------------------------------------------

describe('JSON that looks like structure but is not', () => {
  const cases = {
    'braces inside strings': { intro: '{{{{ }}}} [[[ ]]]', days: [{ id: 'a', stops: [{ id: 's' }] }] },
    'escaped quotes': { intro: 'she said \\"go\\" then {', days: [{ id: 'a', stops: [{ id: 's' }] }] },
    'trailing backslash before quote': { intro: 'path C:\\\\', days: [{ id: 'a', stops: [{ id: 's' }] }] },
    'unicode escapes': { intro: '\\u007b\\u007d caf\\u00e9', days: [{ id: 'a', stops: [{ id: 's' }] }] },
    'nulls and numbers': { intro: null, days: [{ id: 'a', dayNumber: 1, stops: [{ id: 's', duration: 0, latitude: -103.45 }] }] },
    'a key literally called days inside a stop note': {
      days: [{ id: 'a', stops: [{ id: 's', note: '"days": [{"stops": [{}]}]' }] }],
    },
    'empty stops array': { days: [{ id: 'a', stops: [] }] },
  };

  for (const [label, obj] of Object.entries(cases)) {
    test(`${label} — one day, correct stop count, under one-byte chunking`, () => {
      const text = JSON.stringify(obj);
      const s = replay(text, oneByte);
      expect(s.malformedReason).toBeNull();
      expect(s.structurallyComplete).toBe(true);
      expect(s.dayCompletionMs).toHaveLength(1);
      expect(s.stopCompletionCount).toBe(obj.days[0].stops.length);
    });
  }

  test('a note containing a complete fake plan does not invent days or stops', () => {
    const s = replay(JSON.stringify(cases['a key literally called days inside a stop note']), random(7));
    expect(s.dayCompletionMs).toHaveLength(1);
    expect(s.stopCompletionCount).toBe(1);
  });

  test('deeply nested stop alternatives never register as stops', () => {
    const nested = {
      days: [{
        id: 'a',
        stops: [{
          id: 's',
          alternatives: [{ name: 'x', meta: { a: { b: { c: {} } } } }, { name: 'y' }],
        }],
      }],
    };
    const s = replay(JSON.stringify(nested), oneByte);
    expect(s.stopCompletionCount).toBe(1);
    expect(s.dayCompletionMs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Top-level section ordering — property order is model-controlled, so observe it
// ---------------------------------------------------------------------------

describe('top-level sections are dated where the model actually emits them', () => {
  test('sections are recorded in emission order, chunk-independently', () => {
    for (const chunker of [whole, oneByte, fixed(3), random(11)]) {
      const s = replay(DOC, chunker);
      const order = Object.entries(s.sectionStartMs).sort((a, b) => a[1] - b[1]).map(([k]) => k);
      expect(order).toEqual(['intro', 'narrativeSections', 'days', 'alternatives']);
      expect(s.daysStartMs).toBe(s.sectionStartMs.days);
    }
  });

  test('days begins before the first day can possibly complete', () => {
    const s = replay(DOC, oneByte);
    expect(s.daysStartMs).toBeLessThan(s.firstCompleteStopMs);
    expect(s.firstCompleteStopMs).toBeLessThanOrEqual(s.firstCompleteDayMs);
  });

  test("a stop's own `alternatives` key does not register as the plan-level section", () => {
    // Stop alternatives appear inside day 1; the plan-level `alternatives` key
    // comes last. The recorded time must be the plan-level one.
    const s = replay(DOC, oneByte);
    expect(s.sectionStartMs.alternatives).toBeGreaterThan(s.allDaysStructurallyCompleteMs);
  });

  test('a key that is not a known top-level section is not recorded at all', () => {
    const s = replay(JSON.stringify({ mysteryField: 1, days: [{ id: 'a', stops: [{}] }] }), oneByte);
    expect(Object.keys(s.sectionStartMs)).toEqual(['days']);
  });

  test('a model that emits days FIRST is reported that way, not normalized', () => {
    const daysFirst = { days: [{ id: 'a', stops: [{ id: 's' }] }], intro: 'after' };
    const s = replay(JSON.stringify(daysFirst), oneByte);
    expect(s.daysStartMs).toBeLessThan(s.sectionStartMs.intro);
  });
});

// ---------------------------------------------------------------------------
// §5 — truncated / malformed streams
// ---------------------------------------------------------------------------

describe('an incomplete stream reports incompleteness rather than guessing', () => {
  test('a stream cut mid-artifact is never marked structurally complete', () => {
    for (const cut of [0.25, 0.5, 0.75, 0.95]) {
      const s = replay(DOC.slice(0, Math.floor(DOC.length * cut)), oneByte);
      expect(s.structurallyComplete).toBe(false);
      expect(s.toolCompleteMs).toBeNull();
    }
  });

  test('units completed before the cut are still dated — that is the whole point', () => {
    // Cut immediately after day 1 closes.
    const upToDay1 = DOC.slice(0, DOC.indexOf('"day-2"'));
    const s = replay(upToDay1, oneByte);
    expect(s.firstCompleteDayMs).not.toBeNull();
    expect(s.dayCompletionMs).toHaveLength(1);
    expect(s.structurallyComplete).toBe(false);
    expect(s.allDaysStructurallyCompleteMs).toBeNull();
  });

  test('an empty stream produces no milestones and no first byte', () => {
    const s = replay('', whole);
    expect(s.firstToolByteMs).toBeNull();
    expect(s.structurallyComplete).toBe(false);
    expect(s.milestones).toHaveLength(0);
  });

  test('unbalanced closers are reported, not silently absorbed', () => {
    const s = replay('{"days":[{"stops":[{}]}]}}}', oneByte);
    expect(s.malformedReason).toBe('unbalanced_container');
  });
});

// ---------------------------------------------------------------------------
// §3/§7 — bounded, content-free, non-persisting
// ---------------------------------------------------------------------------

describe('milestones carry identity and time, never artifact content', () => {
  const s = replay(DOC, random(3));

  test('no traveler-visible string from the artifact appears anywhere', () => {
    const serialized = JSON.stringify(s);
    for (const leak of [
      'Painted Canyon', 'Boicourt', 'Wind Canyon', 'Oxbow', 'Medora',
      'Sunrise light', 'easygoing', 'Plan B', 'Afternoons are hot', 'viewpoint',
    ]) expect(serialized).not.toContain(leak);
  });

  test('every milestone is a fixed kind, numbers, and an allowlisted section name', () => {
    const allowed = new Set(['kind', 'tMs', 'byteOffset', 'dayOrdinal', 'stopOrdinal', 'dayCount', 'section']);
    const kinds = new Set(Object.values(MILESTONE));
    for (const m of s.milestones) {
      expect(kinds.has(m.kind)).toBe(true);
      for (const [k, v] of Object.entries(m)) {
        expect(allowed.has(k)).toBe(true);
        // `section` is a SCHEMA FIELD NAME from a closed allowlist — the one
        // string that may appear, and it can never carry traveler content.
        if (k === 'section') expect(TOP_LEVEL_SECTIONS.has(v)).toBe(true);
        else if (k !== 'kind') expect(typeof v).toBe('number');
      }
    }
  });

  test('the milestone series is capped', () => {
    const many = { days: Array.from({ length: 400 }, (_, i) => ({ id: `d${i}`, stops: [{ id: 's' }] })) };
    const t = createShadowStructureTracker({ dispatchStartedAtMs: 0, maxMilestones: 16 });
    t.consume(JSON.stringify(many), 10);
    const snap = t.snapshot();
    expect(snap.milestones.length).toBeLessThanOrEqual(16);
    expect(snap.milestonesTruncated).toBe(true);
    // Early units are still dated even when the tail is dropped.
    expect(snap.firstCompleteDayMs).not.toBeNull();
  });

  test('an absurdly long key cannot grow the buffer without bound', () => {
    const key = 'k'.repeat(MAX_KEY_CHARS * 20);
    const s2 = replay(`{"${key}":1,"days":[{"stops":[{}]}]}`, oneByte);
    // The oversized key fails closed to "not a container key we recognize" and
    // the real `days` key still resolves.
    expect(s2.dayCompletionMs).toHaveLength(1);
    expect(s2.malformedReason).toBeNull();
  });

  test('the projection exposes only the bounded milestone fields', () => {
    const projected = projectShadowStructure(s);
    expect(Object.keys(projected).sort()).toEqual([
      'allDaysStructurallyCompleteMs', 'dayCompletionMs', 'daysStartMs',
      'firstCompleteDayMs', 'firstCompleteStopMs', 'firstOpeningBraceMs',
      'malformedReason', 'milestonesTruncated', 'secondCompleteDayMs',
      'sectionStartMs', 'stopCompletionCount', 'structurallyComplete',
      'toolCompleteMs',
    ]);
    expect(projectShadowStructure(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §4/§5/§9 — the boundary this module must not cross
// ---------------------------------------------------------------------------

describe('shadow means shadow', () => {
  // Comments are stripped before scanning: this module DESCRIBES what it must
  // never do, so matching its prose would assert the opposite of the intent.
  const codeOnly = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

  const SRC = codeOnly(require('fs').readFileSync(require.resolve('../shadowStreamStructure'), 'utf8'));
  const EXEC_RAW = require('fs').readFileSync(
    require.resolve('../../services/trailieExecutionService'), 'utf8',
  );
  const EXEC = codeOnly(EXEC_RAW);

  test('the tracker imports nothing and calls no validator, persistence or emit', () => {
    // Zero dependencies: it cannot reach a database, a provider, or a validator
    // even by accident.
    expect(SRC).not.toMatch(/require\(/);
    expect(SRC).not.toMatch(/\b(validate\w*|emit|save|persist\w*|findOne|updateOne)\s*\(/i);
    expect(SRC).not.toMatch(/mongoose|Trip\b|Conversation\b/);
  });

  test('it is fed inside the tool-argument branch, which forwards nothing', () => {
    const start = EXEC.indexOf('onEvent: (event) => {');
    const body = EXEC.slice(start, EXEC.indexOf('\n            },', start));
    const toolBranch = body.slice(
      body.indexOf("event?.type === 'tool_argument_delta'"),
      body.indexOf("event?.type === 'start'"),
    );
    expect(toolBranch).toMatch(/shadowStructure\.consume\(/);
    expect(toolBranch).not.toMatch(/emit\(/);
    // Still exactly one emit in the whole callback, still behind the text gate.
    expect(body.match(/emit\(/g)).toHaveLength(1);
  });

  test('the snapshot is written to telemetry and read by nothing else', () => {
    // Exactly three call sites: construct, consume, snapshot-into-the-row.
    expect(EXEC.match(/createShadowStructureTracker\(/g)).toHaveLength(1);
    expect(EXEC.match(/shadowStructure\.consume\(/g)).toHaveLength(1);
    expect(EXEC.match(/shadowStructure\.snapshot\(\)/g)).toHaveLength(1);
    // The only consumer of the snapshot is the telemetry row.
    expect(EXEC).toMatch(/dispatchRow\.shadowStructure = shadowStructure\.snapshot\(\);/);
    // No method other than consume/snapshot is ever called on it, so it cannot
    // be coaxed into yielding plan data.
    const calls = [...EXEC.matchAll(/shadowStructure\.(\w+)\(/g)].map((m) => m[1]);
    expect([...new Set(calls)].sort()).toEqual(['consume', 'snapshot']);
    expect(EXEC).not.toMatch(/shadowStructure[^\n;]*(validate|persist|save|emit)/i);
  });

  test('no canonical event or client vocabulary gained a structural member', () => {
    const { CANONICAL_EVENTS } = require('../../services/trailieV2ExecutionService');
    expect(CANONICAL_EVENTS.some((e) => /structure|milestone|partial|shadow/i.test(e))).toBe(false);
  });
});
