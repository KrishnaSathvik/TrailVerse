#!/usr/bin/env node
/**
 * Seeds `src/data/trailieDemoPlayback.json` (schema v2) from the legacy
 * `trailieDemoResponses.json` (schema v1, captured 2026-06-30 against the old
 * non-streaming /api/ai/chat).
 *
 * WHAT THIS DOES AND DOES NOT DO
 * It carries over each scenario's IDENTITY — id, label, chatTitle, question
 * order — because those are the demo's own product decisions and must survive.
 * It also carries the legacy prose so the page is never blank.
 *
 * It does NOT treat the legacy prose as current. Every seeded turn is marked
 * `awaitingRecapture: true`, which is how the review flow and the tests know the
 * answer predates the current architecture. The legacy file is left untouched as
 * evidence — nothing here writes to it.
 *
 * No plan is invented. The legacy captures contain no structured itinerary at
 * all, so every seeded turn has `plan: null` and will play conversationally
 * until a real approved capture replaces it.
 *
 * Zero network. Zero provider calls. Deterministic.
 *
 * Live /trailie-demo playback is produced by
 * `scripts/import-trailie-demo-public-set.mjs`. This seed script must not
 * overwrite that fixture unless TRAILIE_DEMO_FORCE_LEGACY_SEED=1.
 *
 *   node scripts/build-trailie-demo-playback.mjs [--check]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY_PATH = join(HERE, '../src/data/trailieDemoResponses.json');
const OUT_PATH = join(HERE, '../src/data/trailieDemoPlayback.json');

const CHECK_ONLY = process.argv.includes('--check');

/**
 * Declared intent per scenario, derived from the server's own classifiers
 * (`shouldRequestItineraryJson` with the scenario's park resolved), not from a
 * guess about the wording:
 *
 *   compare-yosemite-sequoia → conversation (a recommendation, no plan)
 *   zion-couple-itinerary    → itinerary    (2-day plan for a named NPS park)
 *   glacier-one-day-july     → conversation (prioritization + fallback advice)
 *   valley-of-fire-weekend   → conversation (a state park; no NPS plan is built)
 */
const DECLARED_KIND = {
  'compare-yosemite-sequoia': 'conversation',
  'zion-couple-itinerary': 'itinerary',
  'glacier-one-day-july': 'conversation',
  'valley-of-fire-weekend': 'conversation',
};

/**
 * CANONICAL question overrides.
 *
 * When a demo question is revised, the new wording is defined HERE rather than
 * by editing the legacy capture file — the legacy file is evidence and stays
 * byte-identical. Everything downstream (playback fixture, review console, CTA,
 * tests) reads the generated fixture, so this is the single source of truth for
 * the current wording.
 *
 * Glacier: the original asked specifically about July. That pinned the demo to
 * one month and would read as stale for most of the year, so it now asks the
 * same logistics/fallback question without the season, and allows for Logan Pass
 * being unavailable for reasons other than a full lot (seasonal closure, road
 * status, vehicle reservations).
 */
const QUESTION_OVERRIDES = {
  'glacier-one-day-july': {
    0: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
  },
};

const legacy = JSON.parse(readFileSync(LEGACY_PATH, 'utf8'));

const scenarios = legacy.scenarios.map((item) => {
  const rawTurns = item.turns?.length
    ? item.turns
    : [{ question: item.question, answer: item.answer, metadata: item.metadata || {} }];

  return {
    id: item.id,
    label: item.label,
    chatTitle: item.chatTitle,
    kind: DECLARED_KIND[item.id] || 'conversation',
    turns: rawTurns.map((turn, turnIndex) => {
      const metadata = { ...(item.metadata || {}), ...(turn.metadata || {}) };
      const override = QUESTION_OVERRIDES[item.id]?.[turnIndex];

      return {
        question: override || turn.question,
        // Legacy prose, preserved verbatim so the demo still plays. Marked below.
        prose: turn.answer || '',
        // The legacy capture predates structured itineraries entirely.
        plan: null,
        liveData: {
          nps: metadata.hasLiveData === true,
          web: metadata.hasWebSearch === true,
        },
        awaitingRecapture: true,
        // The legacy prose answers the PREVIOUS wording, so it must not be read
        // as an answer to the current question until re-capture replaces it.
        ...(override ? { questionUpdated: true } : {}),
      };
    }),
  };
});

const fixture = { schemaVersion: 2, scenarios };
const serialized = `${JSON.stringify(fixture, null, 2)}\n`;

if (CHECK_ONLY) {
  console.error('[trailie-demo] live playback is imported by import-trailie-demo-public-set.mjs; legacy --check is disabled');
  process.exit(1);
}

if (process.env.TRAILIE_DEMO_FORCE_LEGACY_SEED !== '1') {
  console.error('[trailie-demo] refusing to overwrite trailieDemoPlayback.json from the legacy seed.');
  console.error('Use scripts/import-trailie-demo-public-set.mjs for the live fixture.');
  process.exit(1);
}

writeFileSync(OUT_PATH, serialized);
console.log(
  `[trailie-demo] wrote ${OUT_PATH} — ${scenarios.length} scenarios, ` +
    `${scenarios.reduce((n, s) => n + s.turns.length, 0)} turns, all awaitingRecapture`
);
