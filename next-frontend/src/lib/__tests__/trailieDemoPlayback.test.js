/**
 * Guards for the /trailie-demo playback fixture and schema.
 *
 * Zero provider calls: everything here reads static fixtures and pure functions.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import playback from '@/data/trailieDemoPlayback.json';
import legacy from '@/data/trailieDemoResponses.json';
import {
  PLAYBACK_SCHEMA_VERSION,
  SCENARIO_KIND,
  isItineraryScenario,
  normalizePlaybackScenario,
  playbackBeatsForTurn,
  thinkingLabelForTurn,
  turnHasItinerary,
  validatePlaybackScenario,
} from '../trailieDemoPlaybackSchema';
import { assertNoInternalFields, FORBIDDEN_FIXTURE_FIELDS } from '../trailieDemoCapture';
import { TRAILIE_DEMO_PROMPTS, TRAILIE_PERSONALIZED_PROMPTS } from '../trailieDemoPrompts';

const scenarios = playback.scenarios.map(normalizePlaybackScenario);

// Public evidence IDs are local to each exported revision and get renumbered
// when an earlier stop is removed. Compare travel content and source URLs.
const comparableDay = day => JSON.parse(JSON.stringify(day, (key, value) =>
  ['evidenceId', 'sourceRef'].includes(key) && /^public-evidence-\d+$/.test(value)
    ? 'public-evidence' : value));

const EXPECTED_IDS = ['choose-park', 'road-trip', 'wildlife', 'st-john', 'chicago'];

describe('trailie-demo playback fixture', () => {
  it('ships the current schema version', () => {
    expect(playback.schemaVersion).toBe(PLAYBACK_SCHEMA_VERSION);
  });

  it('ships five real three-turn conversations in the requested order', () => {
    expect(scenarios.map((s) => s.id)).toEqual(EXPECTED_IDS);
    expect(scenarios.map((s) => s.label)).toEqual([
      'Choose a park', 'Plan a road trip', 'Wildlife & photography',
      'Change one day', 'Explore a city',
    ]);
    expect(scenarios.every((s) => s.turns.length === 3)).toBe(true);
    for (const scenario of scenarios) {
      expect(scenario.turns.every((turn) => turn.source === 'live-envelope')).toBe(true);
      expect(scenario.turns.every((turn) => turn.prose.length > 100)).toBe(true);
    }
  });

  it('keeps every scenario structurally valid', () => {
    for (const scenario of scenarios) {
      expect({ id: scenario.id, problems: validatePlaybackScenario(scenario) }).toEqual({
        id: scenario.id,
        problems: [],
      });
    }
  });

  it('keeps the legacy capture as an archive, not as the live demo questions', () => {
    expect(legacy.scenarios.map((s) => s.id)).not.toEqual(EXPECTED_IDS);
    expect(scenarios.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it('no longer flags any turn as stale — every answer is a real re-capture', () => {
    // `questionUpdated` existed only to mark the window where the revised
    // Glacier question was paired with the pre-revision legacy answer. The
    // import closed that window by replacing every answer.
    for (const scenario of playback.scenarios) {
      for (const turn of scenario.turns) {
        expect({ id: scenario.id, stale: turn.questionUpdated === true }).toEqual({
          id: scenario.id,
          stale: false,
        });
      }
    }
  });

  it('hash-locks the current accepted public playback fixture', () => {
    // Real authenticated three-turn captures, reviewed and atomically refreshed 2026-10-15
    // (architecture-lock Demo recapture with tripSchemaVersion:1).
    const root = resolve(__dirname, '../../../..');
    const fixtureText = readFileSync(join(root, 'next-frontend/src/data/trailieDemoPlayback.json'), 'utf8');
    expect(createHash('sha256').update(fixtureText).digest('hex')).toBe(
      '3cb816d9d6b26ccba6ae78ab09e3ddb5cd8a310c1e62d7211d3b48191e88f8df',
    );
  });
});

describe('trailie-demo scenarios stay their own set', () => {
  it('does not share questions with the /plan-ai starter chips', () => {
    // Playback and welcome chips are different products. Heavy demo questions
    // stay on /trailie-demo; /plan-ai chips stay general live starters.
    const chipText = new Set(TRAILIE_DEMO_PROMPTS.map((p) => p.text.toLowerCase()));
    const overlapping = scenarios.flatMap((scenario) =>
      scenario.turns
        .filter((turn) => chipText.has(turn.question.toLowerCase()))
        .map((turn) => turn.question)
    );
    expect(overlapping).toEqual([]);
    expect(TRAILIE_PERSONALIZED_PROMPTS.every((p) =>
      scenarios.every((scenario) =>
        scenario.turns.every((turn) => turn.question.toLowerCase() !== p.text.toLowerCase())
      )
    )).toBe(true);
  });

  it('does not reference the starter-chip module anywhere in the demo source', () => {
    // A static scan, not an import: this must fail if someone WIRES the two
    // systems together, regardless of whether the module still loads.
    const demoDir = resolve(__dirname, '../../components/trailie-demo');
    const sources = readdirSync(demoDir).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'));
    expect(sources.length).toBeGreaterThan(0);

    for (const file of sources) {
      const contents = readFileSync(join(demoDir, file), 'utf8');
      const importsChips = /^\s*import[^;]*trailieDemoPrompts/m.test(contents);
      expect({ file, importsChips }).toEqual({ file, importsChips: false });
    }
  });
});

describe('itinerary vs conversation playback', () => {
  it('includes a real saved itinerary in each conversation', () => {
    expect(scenarios.filter(isItineraryScenario).map((s) => s.id)).toEqual(EXPECTED_IDS);
    expect(scenarios.map((s) => s.turns.findLast(t => t.plan).plan.days.length)).toEqual([4, 5, 4, 3, 3]);
  });

  it('preserves advice-only turns between revisions and after the St. John patch', () => {
    expect(scenarios.map(s => s.turns.map(turnHasItinerary))).toEqual([
      [false, false, true], [false, true, true], [true, false, true],
      [true, true, false], [false, true, true],
    ]);
  });

  it('keeps scoped patches scoped and pins Chicago’s headline museum', () => {
    for (const [id, beforeIndex, afterIndex, changedDay] of [
      ['road-trip', 1, 2, 3], ['st-john', 0, 1, 2],
    ]) {
      const turns = scenarios.find(s => s.id === id).turns;
      for (const day of turns[beforeIndex].plan.days.filter(d => d.dayNumber !== changedDay)) {
        expect(turns[afterIndex].plan.days.find(d => d.dayNumber === day.dayNumber)).toEqual(day);
      }
    }
    const stJohn = scenarios.find(s => s.id === 'st-john').turns[1];
    for (const name of ['Cinnamon Bay', 'Peace Hill']) {
      const place = stJohn.plan.days.flatMap(d => d.stops).find(s => s.name === name);
      expect(Number.isFinite(place?.location?.lat)).toBe(true);
      expect(Number.isFinite(place?.location?.lon)).toBe(true);
    }
    const chicago = scenarios.find(s => s.id === 'chicago');
    for (const turn of chicago.turns.filter(turnHasItinerary)) {
      const museum = turn.plan.days.flatMap(d => d.stops).find(s => /Art Institute/i.test(s.name));
      expect(Number.isFinite(museum?.location?.lat)).toBe(true);
      expect(Number.isFinite(museum?.location?.lon)).toBe(true);
    }
    const museumDay = chicago.turns[1].plan.days.find(d => d.stops.some(s => /Art Institute/i.test(s.name))).dayNumber;
    for (const day of chicago.turns[1].plan.days.filter(d => d.dayNumber !== museumDay)) {
      expect(comparableDay(chicago.turns[2].plan.days.find(d => d.dayNumber === day.dayNumber))).toEqual(comparableDay(day));
    }
  });

  it('plays conversation turns as thinking → prose', () => {
    const turn = { question: 'q', prose: 'a', plan: null };
    expect(playbackBeatsForTurn(turn)).toEqual(['thinking', 'prose']);
    expect(turnHasItinerary(turn)).toBe(false);
  });

  it('plays a captured itinerary turn with the intro before the finished plan', () => {
    const turn = { question: 'q', prose: 'a', plan: { days: [{ day: 1, stops: [{ name: 'Trail' }] }] } };
    expect(playbackBeatsForTurn(turn)).toEqual(['thinking', 'intro', 'prose']);
    expect(playbackBeatsForTurn(turn).indexOf('intro')).toBeLessThan(
      playbackBeatsForTurn(turn).indexOf('prose')
    );
  });

  it('never invents an itinerary for a scenario with no captured plan', () => {
    for (const scenario of scenarios) {
      for (const turn of scenario.turns) {
        if (!turn.plan) expect(playbackBeatsForTurn(turn)).toEqual(['thinking', 'prose']);
      }
    }
  });

  it('rejects a conversation scenario that smuggles in a plan', () => {
    const bad = normalizePlaybackScenario({
      id: 'x',
      label: 'X',
      kind: SCENARIO_KIND.CONVERSATION,
      turns: [{ question: 'q', prose: 'a', plan: { days: [{ day: 1, stops: [{ name: 'S' }] }] } }],
    });
    expect(validatePlaybackScenario(bad)).toContain('x turn 0: conversation scenarios must not carry a plan');
  });

  it('describes captured live-data examples without implying a current lookup', () => {
    expect(thinkingLabelForTurn({ liveData: { web: true } })).toBe('Reviewing captured search results…');
    expect(thinkingLabelForTurn({ liveData: { nps: true } })).toBe('Reviewing captured park data…');
    expect(thinkingLabelForTurn({})).toBe('Trailie is thinking…');
  });
});

describe('fixture contains nothing internal', () => {
  it('has no forbidden field anywhere', () => {
    expect(assertNoInternalFields(playback)).toEqual([]);
  });

  it('leaks no provider, model, hash or lifecycle string', () => {
    const serialized = JSON.stringify(playback);
    for (const pattern of [/claude/i, /sonnet/i, /openai/i, /responseId/i, /itineraryHash/i, /lifecycleStatus/i, /captureAs/i]) {
      expect({ pattern: String(pattern), found: pattern.test(serialized) }).toEqual({
        pattern: String(pattern),
        found: false,
      });
    }
  });

  it('keeps the forbidden list covering the documented categories', () => {
    for (const field of ['tripId', 'responseId', 'costUsd', 'usage', 'provider', 'model', 'lifecycleStatus']) {
      expect(FORBIDDEN_FIXTURE_FIELDS).toContain(field);
    }
  });
});

describe('legacy capture is preserved, not repurposed', () => {
  it('leaves the legacy fixture intact at version 21', () => {
    expect(legacy.version).toBe(21);
    expect(legacy.scenarios).toHaveLength(4);
  });

  it('no longer awaits re-capture — every turn now carries a real captured answer', () => {
    for (const scenario of playback.scenarios) {
      for (const turn of scenario.turns) {
        expect({ id: scenario.id, awaiting: turn.awaitingRecapture === true }).toEqual({
          id: scenario.id,
          awaiting: false,
        });
        const minChars = 50;
        expect(turn.prose.trim().length).toBeGreaterThan(minChars);
      }
    }
  });

  it('carries no feasibility diagnostics into the public demo', () => {
    expect(JSON.stringify(playback)).not.toMatch(/feasibilityIssues|location data is missing/);
  });
});
