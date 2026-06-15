#!/usr/bin/env node
/**
 * Verify trailieDemoResponses.json against live Zion NPS alerts and content rules.
 * Exit 0 = pass, 1 = failures (blocks capture write when run from capture script).
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const DEMO_PATH = join(dirname(fileURLToPath(import.meta.url)), '../src/data/trailieDemoResponses.json');

async function fetchZionAlerts() {
  const res = await fetch(`${API_BASE}/parks/zion/alerts`);
  if (!res.ok) throw new Error(`Zion alerts HTTP ${res.status}`);
  const body = await res.json();
  return body.data || body.alerts || [];
}

function findScenario(scenarios, id) {
  const s = scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`Missing scenario: ${id}`);
  return s;
}

function fail(checks, id, message) {
  checks.push({ id, ok: false, message });
}

function pass(checks, id, message) {
  checks.push({ id, ok: true, message });
}

function runContentChecks(scenarios, alerts, checks) {
  const closures = alerts
    .filter((a) => /closure/i.test(a.category || ''))
    .map((a) => (a.title || '').toLowerCase());
  const hasAngelsClosure = closures.some((t) => /angels landing/.test(t));
  const hasCyanobacteria = alerts.some((a) => /cyanobacteria|toxic/i.test(`${a.title} ${a.description}`));
  const narrowsClosureAlert = alerts.some(
    (a) => /closure/i.test(a.category || '') && /narrows/i.test(a.title || '')
  );

  for (const scenario of scenarios) {
    const text = (scenario.answer || '').toLowerCase();
    const id = scenario.id;

    if (/verify at \[nps\.gov\]|check nps\.gov\/zion\/planyourvisit\/conditions\.htm/i.test(scenario.answer || '')) {
      fail(checks, id, 'Still defers to nps.gov verify/conditions link');
    }

    if (/narrows is closed.*cyanobacteria|cyanobacteria.*narrows is closed|closed right now due to toxic cyanobacteria/i.test(text)) {
      fail(checks, id, 'Incorrectly states Narrows is closed because of cyanobacteria');
    }

    if (hasCyanobacteria && !narrowsClosureAlert && /narrows is closed/i.test(text) && !/not a closure|isn't a closure|not a trail closure/i.test(text)) {
      fail(checks, id, 'Says Narrows is closed but NPS has no Narrows closure alert (only cyanobacteria caution)');
    }

    if (id === 'angels-landing' && hasAngelsClosure) {
      if (/\b(yes,?\s*)?angels landing is open\b|angels landing is open\b/i.test(text)) {
        fail(checks, id, 'Says Angels Landing is open while NPS reports trail closure');
      }
      if (!/closed|closure|not open|shut/i.test(text)) {
        fail(checks, id, 'Angels Landing closure not mentioned for open-now question');
      }
    }

    if (
      (id === 'compare-parks' || id === 'compare-zion-bryce') &&
      hasAngelsClosure &&
      /angels landing requires a permit/i.test(text) &&
      !/closed|closure/i.test(text)
    ) {
      fail(checks, id, 'Compare answer implies Angels Landing is hikeable (permit only) while trail is closed');
    }

    if (id === 'discover-july-follow-up') {
      const turn1Text = (scenario.turns?.[0]?.answer || scenario.answer || '').toLowerCase();
      if (/i don't have real-time data|no real-time data for this park/i.test(turn1Text)) {
        fail(checks, id, 'Discovery answer opens with live-data disclaimer (should curate from catalog)');
      }
      if (!/olympic|crater lake|acadia|glacier/i.test(turn1Text)) {
        fail(checks, id, 'Discovery answer missing expected cool-summer lake/coast picks');
      }
      if (!/to personalize|starting from|how many days|road trip|okay flying/i.test(turn1Text)) {
        fail(checks, id, 'Discovery answer should end with logistics personalization questions');
      }
      if (/\b(?:skip|avoid|pass on)\s+(?:great sand dunes|the great sand dunes)/i.test(turn1Text)) {
        fail(checks, id, 'Discovery answer should not name a park only to say skip it');
      }
    }

    if (id === 'discover-july-follow-up') {
      const turn2 = scenario.turns?.[1];
      if (!turn2?.answer) {
        fail(checks, id, 'Refinement scenario missing turn 2');
      } else {
        const t2 = turn2.answer.toLowerCase();
        if (!/boston|drive from boston|from boston/i.test(t2)) {
          fail(checks, id, 'Refinement turn 2 should use Boston starting context');
        }
        if (!/acadia|olympic/i.test(t2)) {
          fail(checks, id, 'Refinement turn 2 should name concrete parks from thread');
        }
        if (/to personalize this:/i.test(t2)) {
          fail(checks, id, 'Refinement turn 2 should answer with a tailored pick, not re-ask logistics');
        }
      }
      if (turn2?.metadata?.hasWebSearch) {
        fail(checks, id, 'Discover follow-up should not trigger web search');
      }
    }

    if (id === 'couples-ocean' && !/to personalize|starting from|how many days/i.test(text)) {
      fail(checks, id, 'Couples discovery should invite logistics follow-up');
    }

    if (id === 'compare-zion-bryce') {
      const lead = (scenario.answer || '').trim().replace(/^\*\*/, '').slice(0, 120);
      if (!/\b(go with|pick|choose|i'd go|i would go|take|bryce|zion)\b/i.test(lead)) {
        fail(checks, id, 'Compare should lead with a decisive pick in the opening');
      }
    }

    if (id === 'guest-local-tips' && !scenario.metadata?.showsGuestUpsell) {
      fail(checks, id, 'Guest local-tips scenario should have showsGuestUpsell metadata from capture');
    }

    if (id === 'guest-local-tips' && scenario.metadata?.hasWebSearch) {
      fail(checks, id, 'Guest scenario must not mark hasWebSearch (anonymous has no web search)');
    }

    if (id === 'auth-jackson-lodging' && !scenario.metadata?.hasWebSearch) {
      fail(checks, id, 'Authenticated lodging scenario should have hasWebSearch from live API');
    }

    if (id === 'yellowstone-itinerary') {
      if (scenario.metadata?.hasWebSearch) {
        fail(checks, id, 'Itinerary should use NPS + weather only, not web search');
      }
      if (!/yellowstone|yell/i.test(text)) {
        fail(checks, id, 'Itinerary answer should reference Yellowstone');
      }
      if (!/\bday\s*[1-4]\b|day one|first day/i.test(text)) {
        fail(checks, id, 'Itinerary should include day-by-day structure');
      }
    }

    if (scenario.turns?.length) {
      for (let i = 0; i < scenario.turns.length; i += 1) {
        const turn = scenario.turns[i];
        const turnText = (turn.answer || '').toLowerCase();
        if ((turn.answer || '').length < 80) {
          fail(checks, id, `Turn ${i + 1} answer too short — likely empty capture`);
        }
        if (
          id !== 'auth-jackson-lodging' &&
          id !== 'guest-local-tips' &&
          turn.metadata?.hasWebSearch
        ) {
          fail(checks, id, `Turn ${i + 1} incorrectly marked hasWebSearch`);
        }
        void turnText;
      }
    }

    if (
      !scenario.turns?.length &&
      id !== 'auth-jackson-lodging' &&
      id !== 'guest-local-tips' &&
      scenario.metadata?.hasWebSearch
    ) {
      fail(checks, id, 'General NPS scenario incorrectly marked hasWebSearch');
    }

    if (id === 'couples-ocean' && /\bskip\s+\*?\*?shenandoah\b/i.test(scenario.answer || '')) {
      fail(checks, id, 'Couples answer should not unprompted "skip Shenandoah"');
    }

    if (
      id !== 'guest-local-tips' &&
      /want live prices and ratings\?/i.test(scenario.answer || '')
    ) {
      fail(checks, id, 'Upsell footer should only appear on guest-local-tips capture');
    }

    if (id === 'narrows-permit' && /yes,?\s*you need a permit/i.test(text) && /bottom-up|bottom up/i.test(text) === false) {
      // bottom-up typically no permit — warn only if clearly wrong
      if (/permit required for the narrows bottom/i.test(text)) {
        fail(checks, id, 'Incorrectly requires permit for bottom-up Narrows');
      }
    }

    if ((scenario.answer || '').length < 80) {
      fail(checks, id, 'Answer too short — likely empty capture');
    }
  }

  pass(checks, 'zion-alerts', `Loaded ${alerts.length} alerts (${closures.length} closures)`);
}

export async function verifyTrailieDemoAccuracy(options = {}) {
  const demoPath = options.demoPath || DEMO_PATH;
  if (!existsSync(demoPath)) {
    throw new Error(`Demo file not found: ${demoPath}`);
  }

  const payload = JSON.parse(readFileSync(demoPath, 'utf8'));
  const scenarios = payload.scenarios || [];
  const checks = [];

  const alerts = await fetchZionAlerts();
  runContentChecks(scenarios, alerts, checks);

  const failures = checks.filter((c) => !c.ok);
  return { checks, failures, scenarios, alerts };
}

async function main() {
  const { checks, failures } = await verifyTrailieDemoAccuracy();
  for (const c of checks) {
    const mark = c.ok ? '✓' : '✗';
    console.log(`${mark} [${c.id}] ${c.message}`);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} verification failure(s).`);
    process.exit(1);
  }
  console.log('\nAll demo accuracy checks passed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
