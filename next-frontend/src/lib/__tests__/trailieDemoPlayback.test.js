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

const EXPECTED_IDS = [
  'valley-of-fire-weekend',
  'compare-acadia-shenandoah',
  'yellowstone-relaxed',
  'rocky-mountain-one-day',
  'zion-couple-itinerary',
];

const EXPECTED_QUESTIONS = [
  'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.',
  'I have 3 days in October. Should I choose Acadia or Shenandoah for fall colors, easy hikes, and photography? Pick one and explain why.',
  'Plan a relaxed 2-day Yellowstone trip for first-time visitors who want geysers, wildlife, and scenic drives without rushing.',
  "I only have one full day in Rocky Mountain National Park. What should I prioritize, and what's a good backup if Bear Lake parking or access doesn't work out?",
  'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
];

describe('trailie-demo playback fixture', () => {
  it('ships the current schema version', () => {
    expect(playback.schemaVersion).toBe(PLAYBACK_SCHEMA_VERSION);
  });

  it('preserves the existing scenario identity and order', () => {
    expect(scenarios.map((s) => s.id)).toEqual(EXPECTED_IDS);
    expect(scenarios.map((s) => s.label)).toEqual([
      'Valley of Fire',
      'Compare',
      'Yellowstone',
      'Rocky Mountain',
      'Zion',
    ]);
    expect(scenarios.map((s) => s.turns[0].question)).toEqual(EXPECTED_QUESTIONS);
    expect(scenarios.every((s) => s.turns.length === 1)).toBe(true);
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

  it('plays Acadia as a comparison, Rocky as Bear Lake advice, and Zion without exposed trails', () => {
    const acadia = scenarios.find((s) => s.id === 'compare-acadia-shenandoah');
    expect(acadia.turns[0].prose).toMatch(/Acadia/i);
    expect(acadia.turns[0].prose).toMatch(/Shenandoah/i);
    expect(acadia.turns[0].liveData.web).toBe(true);

    const rocky = scenarios.find((s) => s.id === 'rocky-mountain-one-day');
    expect(rocky.turns[0].question).toMatch(/Bear Lake/);
    expect(rocky.turns[0].prose).toMatch(/Bear Lake/);

    const zion = scenarios.find((s) => s.id === 'zion-couple-itinerary');
    const zionNames = zion.turns[0].plan.days.flatMap((day) => day.stops.map((stop) => stop.name)).join(' | ');
    expect(zionNames).not.toMatch(/Angels Landing|The Narrows/i);
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
    // The 2026-09-21 Yellowstone-only v7 refresh is the accepted /trailie-demo fixture.
    const root = resolve(__dirname, '../../../..');
    const fixtureText = readFileSync(join(root, 'next-frontend/src/data/trailieDemoPlayback.json'), 'utf8');
    expect(createHash('sha256').update(fixtureText).digest('hex')).toBe(
      'a0261c9b2ec09df5b0db4b552af5d96d7ca3d556577311202d1574d9289a674b',
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
  it('declares the itinerary scenarios the capture actually produced', () => {
    // Zion + Valley of Fire captured itineraries. Glacier is the accepted
    // 11A access-contingency plain_answer, not a day-by-day plan.
    expect(scenarios.filter(isItineraryScenario).map((s) => s.id)).toEqual([
      'valley-of-fire-weekend',
      'yellowstone-relaxed',
      'zion-couple-itinerary',
    ]);
    expect(scenarios.filter((s) => !isItineraryScenario(s)).map((s) => s.id)).toEqual([
      'compare-acadia-shenandoah',
      'rocky-mountain-one-day',
    ]);
  });

  it('plays the approved Zion capture as a single low-exposure plan', () => {
    const zion = scenarios.find((s) => s.id === 'zion-couple-itinerary');
    expect(zion.turns).toHaveLength(1);
    expect(turnHasItinerary(zion.turns[0])).toBe(true);

    const names = zion.turns[0].plan.days.flatMap((day) => day.stops.map((stop) => stop.name));
    expect(names).toEqual([
      'Lower Emerald Pool Trail',
      'Temple of Sinawava',
      "Pa'rus - Diversion Dam",
      'Lava Point Overlook',
    ]);
    expect(names.join(' | ')).not.toMatch(/Watchman Trail|Canyon Overlook|Angels Landing|Narrows/i);
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
        const minChars = turn.plan?.days?.length ? 200 : 300;
        expect(turn.prose.trim().length).toBeGreaterThan(minChars);
      }
    }
  });

  it('carries no feasibility diagnostics into the public demo', () => {
    expect(JSON.stringify(playback)).not.toMatch(/feasibilityIssues|location data is missing/);
  });
});
