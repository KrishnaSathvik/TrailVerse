'use strict';

/**
 * Stage 13.8B §1 — fail-closed `TRAILIE_EVAL_SCENARIO_IDS` override.
 *
 * The override selects WHICH inventory scenarios a targeted runner executes.
 * It must never silently degrade: unknown ids, duplicates, an empty list, or a
 * count that does not match the runner's contract all abort BEFORE any provider
 * call. Supplied execution order is authoritative (cost ordering matters).
 *
 * Offline only — no provider clients, no network.
 */

const fs = require('fs');
const path = require('path');

const {
  SCENARIO_IDS_ENV, parseScenarioIdList, resolveScenarioSelection,
} = require('../scenarioSelection');
const { EXECUTABLE_SCENARIOS } = require('../scenarios');

const APPROVED = [
  'basic-02-three-day',
  'correction-08-exceeds-difficulty',
  'prose-33-removed-active',
  'basic-03-seven-day',
];

const resolve = (raw, overrides = {}) => resolveScenarioSelection({
  raw, inventory: EXECUTABLE_SCENARIOS, requiredCount: 4, ...overrides,
});

describe('Stage 13.8B §1 — TRAILIE_EVAL_SCENARIO_IDS parsing', () => {
  it('splits a comma-separated list and preserves the supplied order', () => {
    expect(parseScenarioIdList('c,a,b')).toEqual(['c', 'a', 'b']);
  });

  it('tolerates surrounding whitespace and newlines around each id', () => {
    expect(parseScenarioIdList(' basic-02-three-day ,\n correction-08-exceeds-difficulty \n'))
      .toEqual(['basic-02-three-day', 'correction-08-exceeds-difficulty']);
  });

  it('yields an empty list for undefined, empty, or separator-only input', () => {
    expect(parseScenarioIdList(undefined)).toEqual([]);
    expect(parseScenarioIdList('')).toEqual([]);
    expect(parseScenarioIdList('   ')).toEqual([]);
    expect(parseScenarioIdList(',, ,')).toEqual([]);
  });
});

describe('Stage 13.8B §1 — fail-closed resolution', () => {
  it('resolves the four approved ids in the supplied (non-inventory) order', () => {
    const r = resolve(APPROVED.join(','));
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.ids).toEqual(APPROVED);
    expect(r.scenarios.map((s) => s.scenarioId)).toEqual(APPROVED);
  });

  it('supplied order wins over inventory order (seven-day stays last)', () => {
    const inventoryOrder = EXECUTABLE_SCENARIOS
      .filter((s) => APPROVED.includes(s.scenarioId))
      .map((s) => s.scenarioId);
    expect(inventoryOrder).not.toEqual(APPROVED); // guard: the test would be vacuous otherwise
    expect(resolve(APPROVED.join(',')).ids).toEqual(APPROVED);
    expect(resolve(APPROVED.join(',')).ids[3]).toBe('basic-03-seven-day');
  });

  it('rejects an unknown id and names it', () => {
    const r = resolve('basic-02-three-day,does-not-exist,prose-33-removed-active,basic-03-seven-day');
    expect(r.ok).toBe(false);
    expect(r.scenarios).toEqual([]);
    expect(r.errors.join(' ')).toMatch(/unknown scenario id.*does-not-exist/i);
  });

  it('rejects an id that exists only as a referenced regression (not in the executable inventory)', () => {
    const { ALL_SCENARIOS, REFERENCED_REGRESSION_SCENARIOS } = require('../scenarios');
    expect(REFERENCED_REGRESSION_SCENARIOS.length).toBeGreaterThan(0);
    const refOnly = REFERENCED_REGRESSION_SCENARIOS[0].scenarioId;
    expect(ALL_SCENARIOS.some((s) => s.scenarioId === refOnly)).toBe(true);
    const r = resolve(`${refOnly},basic-02-three-day,prose-33-removed-active,basic-03-seven-day`);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(new RegExp(`unknown scenario id.*${refOnly}`, 'i'));
  });

  it('rejects duplicates even when every id is otherwise valid and the count matches', () => {
    const r = resolve('basic-02-three-day,basic-02-three-day,prose-33-removed-active,basic-03-seven-day');
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate scenario id.*basic-02-three-day/i);
  });

  it('rejects an empty list', () => {
    for (const raw of ['', '   ', ',,,']) {
      const r = resolve(raw);
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/empty/i);
    }
  });

  it('rejects the wrong scenario count in both directions', () => {
    const tooFew = resolve('basic-02-three-day,prose-33-removed-active,basic-03-seven-day');
    expect(tooFew.ok).toBe(false);
    expect(tooFew.errors.join(' ')).toMatch(/expected exactly 4 scenarios, got 3/i);

    const tooMany = resolve(`${APPROVED.join(',')},basic-04-multi-park`);
    expect(tooMany.ok).toBe(false);
    expect(tooMany.errors.join(' ')).toMatch(/expected exactly 4 scenarios, got 5/i);
  });

  it('reports every distinct failure at once rather than only the first', () => {
    const r = resolve('basic-02-three-day,basic-02-three-day,nope-not-real');
    expect(r.ok).toBe(false);
    const joined = r.errors.join(' ');
    expect(joined).toMatch(/duplicate/i);
    expect(joined).toMatch(/unknown/i);
    expect(joined).toMatch(/expected exactly 4/i);
  });

  it('rejects an inventory id the executing harness cannot actually run (no silent drop)', () => {
    // runLiveSmoke re-filters against SMOKE_SCENARIO_IDS; an id outside that set
    // would be dropped silently and the run would quietly execute fewer scenarios.
    const { SMOKE_SCENARIO_IDS } = require('../liveEvaluation');
    const notSupported = EXECUTABLE_SCENARIOS
      .map((s) => s.scenarioId)
      .find((id) => !SMOKE_SCENARIO_IDS.includes(id));
    expect(notSupported).toBeTruthy();

    const r = resolve(
      `basic-02-three-day,correction-08-exceeds-difficulty,${notSupported},basic-03-seven-day`,
      { supportedIds: SMOKE_SCENARIO_IDS },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(new RegExp(`not executable by this runner.*${notSupported}`, 'i'));
  });

  it('accepts the four approved ids against the live smoke support set', () => {
    const { SMOKE_SCENARIO_IDS } = require('../liveEvaluation');
    const r = resolve(APPROVED.join(','), { supportedIds: SMOKE_SCENARIO_IDS });
    expect(r.ok).toBe(true);
    expect(r.ids).toEqual(APPROVED);
  });

  it('is absent (not applied) when the env value is not provided at all', () => {
    const r = resolveScenarioSelection({ raw: undefined, inventory: EXECUTABLE_SCENARIOS, requiredCount: 4, required: false });
    expect(r.applied).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.ids).toEqual([]);
  });

  it('the printable summary exposes only sanitized ids — never prompts or expectations', () => {
    const r = resolve(APPROVED.join(','));
    const printable = JSON.stringify(r.printable);
    for (const id of APPROVED) expect(printable).toContain(id);
    for (const s of r.scenarios) {
      if (s.userPrompt) expect(printable).not.toContain(s.userPrompt);
    }
    expect(printable).not.toMatch(/userPrompt|expected/i);
  });
});

describe('Stage 13.8B §1 — evaluation-only isolation', () => {
  const SERVER_SRC = path.resolve(__dirname, '../../..');

  const walk = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'eval') continue;
        walk(full, acc);
      } else if (entry.name.endsWith('.js')) acc.push(full);
    }
    return acc;
  };

  it('no production source outside src/eval reads TRAILIE_EVAL_SCENARIO_IDS', () => {
    const offenders = walk(SERVER_SRC)
      .filter((f) => fs.readFileSync(f, 'utf8').includes(SCENARIO_IDS_ENV))
      .map((f) => path.relative(SERVER_SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the selection module pulls in no route, controller, or generation policy code', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../scenarioSelection.js'), 'utf8');
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    for (const r of requires) {
      expect(r).not.toMatch(/routes|controllers|services|prompts|middleware/);
    }
  });
});
