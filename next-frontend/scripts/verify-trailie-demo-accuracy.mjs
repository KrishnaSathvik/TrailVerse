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

const WEB_SEARCH_SCENARIO_IDS = new Set(['valley-of-fire-weekend', 'auth-jackson-lodging', 'guest-local-tips']);
const COMPARE_SCENARIO_PREFIX = 'compare-';
const ITINERARY_SCENARIO_IDS = new Set(['zion-couple-itinerary']);
const FULL_PLAN_LOGISTICS_IDS = new Set(['zion-couple-itinerary', 'valley-of-fire-weekend']);
const PLAN_SCENARIO_IDS = new Set([...ITINERARY_SCENARIO_IDS, 'valley-of-fire-weekend']);

const ROBOTIC_PLAN_PHRASES = [
  { re: /you've already given me enough/i, label: 'chatbot opener "you\'ve already given me enough"' },
  { re: /\*\*live-?data note:\*\*/i, label: 'bold "Live-data note" label' },
  { re: /\*\*trip length:\*\*/i, label: 'bold "Trip length" form label' },
  { re: /\*\*fitness fit:\*\*/i, label: 'bold "Fitness fit" form label' },
  { re: /\*\*best base:\*\*/i, label: 'bold "Best base" form label' },
  { re: /\*\*crowd note:\*\*/i, label: 'bold "Crowd note" label' },
];

const ROBOTIC_DISCLAIMER_PHRASES = [
  { re: /\bgeneral knowledge\b/i, label: '"general knowledge" disclaimer' },
  { re: /\bi'?m working from\b/i, label: '"I\'m working from…" disclaimer' },
  { re: /\bi don'?t have real-?time data\b/i, label: '"I don\'t have real-time data" disclaimer' },
  { re: /see current real-world conditions/i, label: 'vague real-world conditions disclaimer' },
  { re: /check live conditions on trailverse(?!\s*\])/i, label: 'unlinked "check TrailVerse" disclaimer' },
];

function allScenarioText(scenario) {
  if (scenario.turns?.length) {
    return scenario.turns.map((t) => t.answer || '').join('\n');
  }
  return scenario.answer || '';
}

function primaryAnswer(scenario) {
  return scenario.turns?.[0]?.answer || scenario.answer || '';
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
    const text = allScenarioText(scenario).toLowerCase();
    const leadText = primaryAnswer(scenario).toLowerCase();
    const id = scenario.id;

    if (/verify at \[nps\.gov\]|check nps\.gov\/zion\/planyourvisit\/conditions\.htm/i.test(allScenarioText(scenario))) {
      fail(checks, id, 'Still defers to nps.gov verify/conditions link');
    }

    for (const { re, label } of ROBOTIC_DISCLAIMER_PHRASES) {
      if (re.test(allScenarioText(scenario))) {
        fail(checks, id, `Robotic disclaimer: ${label}`);
      }
    }

    if (/narrows is closed.*cyanobacteria|cyanobacteria.*narrows is closed|closed right now due to toxic cyanobacteria/i.test(text)) {
      fail(checks, id, 'Incorrectly states Narrows is closed because of cyanobacteria');
    }

    if (
      hasCyanobacteria &&
      !narrowsClosureAlert &&
      /narrows is closed/i.test(text) &&
      !/not a closure|isn't a closure|not a trail closure/i.test(text)
    ) {
      fail(checks, id, 'Says Narrows is closed but NPS has no Narrows closure alert (only cyanobacteria caution)');
    }

    if (id === 'zion-couple-itinerary' && hasAngelsClosure) {
      if (/\b(yes,?\s*)?angels landing is open\b|angels landing is open\b/i.test(text)) {
        fail(checks, id, 'Says Angels Landing is open while NPS reports trail closure');
      }
      if (/angels landing requires a permit/i.test(text) && !/closed|closure/i.test(text)) {
        fail(checks, id, 'Zion plan implies Angels Landing is hikeable (permit only) while trail is closed');
      }
    }

    if (id.startsWith(COMPARE_SCENARIO_PREFIX)) {
      const lead = primaryAnswer(scenario).trim().replace(/^\*\*/, '').slice(0, 200);
      if (!/\b(go with|pick|choose|i'd go|i would go|take|sequoia|yosemite)\b/i.test(lead)) {
        fail(checks, id, 'Compare should lead with a decisive pick in the opening');
      }
      if (!/yosemite|sequoia/i.test(leadText)) {
        fail(checks, id, 'Yosemite vs Sequoia compare should reference both parks');
      }
      if (!/september|fall|crowd|photo/i.test(leadText)) {
        fail(checks, id, 'Compare should address season, photography, or crowds');
      }
    }

    if (id === 'zion-couple-itinerary') {
      if (!/zion/i.test(leadText)) {
        fail(checks, id, 'Zion itinerary should reference Zion');
      }
      if (!/\bday\s*[12]\b|day one|first day|second day/i.test(leadText)) {
        fail(checks, id, 'Zion itinerary should include day-by-day structure');
      }
      if (!/at a glance|logistics summary/i.test(leadText)) {
        fail(checks, id, 'Zion itinerary turn 1 should open logistics with At a glance or Logistics Summary');
      }
      const turn2 = scenario.turns?.[1];
      if (!turn2?.answer) {
        fail(checks, id, 'Zion itinerary missing follow-up turn 2');
      } else {
        const t2 = turn2.answer.toLowerCase();
        if (!/sunset|relaxed|relax|shuttle/i.test(t2)) {
          fail(checks, id, 'Zion follow-up should address relaxed pace, shuttles, or sunset');
        }
        if (t2.length > 50 && t2 === leadText.slice(0, t2.length)) {
          fail(checks, id, 'Zion follow-up should adapt the plan, not repeat turn 1');
        }
      }
      if (turn2?.metadata?.hasWebSearch) {
        fail(checks, id, 'Zion follow-up should not trigger web search');
      }
    }

    if (id === 'glacier-one-day-july') {
      if (!/glacier|logan pass/i.test(leadText)) {
        fail(checks, id, 'Glacier one-day answer should reference Glacier or Logan Pass');
      }
      if (!/backup|plan b|if.*full|parking/i.test(leadText)) {
        fail(checks, id, 'Glacier one-day should include Logan Pass parking backup');
      }
      if (!/priorit|must.?do|start with|focus on|lead with|how i'd play it|hidden lake/i.test(leadText)) {
        fail(checks, id, 'Glacier one-day should prioritize what to do with limited time');
      }
    }

    if (id === 'valley-of-fire-weekend') {
      if (!scenario.metadata?.hasWebSearch) {
        fail(checks, id, 'Valley of Fire scenario should have hasWebSearch from live API');
      }
      if (!/valley of fire|las vegas/i.test(leadText)) {
        fail(checks, id, 'Valley of Fire answer should reference the park and Las Vegas');
      }
      if (!/sunset|easy|relaxed|weekend/i.test(leadText)) {
        fail(checks, id, 'Valley of Fire answer should match relaxed weekend framing');
      }
      if (/i don't have (any )?data for this park|no nps data available/i.test(leadText) && !/state park|not an nps/i.test(leadText)) {
        fail(checks, id, 'Non-NPS answer should not stall on missing NPS catalog data');
      }
    }

    if (PLAN_SCENARIO_IDS.has(id)) {
      for (const { re, label } of ROBOTIC_PLAN_PHRASES) {
        if (re.test(allScenarioText(scenario))) {
          fail(checks, id, `Robotic planning voice: ${label}`);
        }
      }
    }

    if (FULL_PLAN_LOGISTICS_IDS.has(id) && !/at a glance|logistics summary/i.test(leadText)) {
      fail(checks, id, 'Full plan should open logistics with At a glance or Logistics Summary');
    }

    if (WEB_SEARCH_SCENARIO_IDS.has(id) && id !== 'guest-local-tips' && !scenario.metadata?.hasWebSearch) {
      fail(checks, id, `Authenticated web scenario ${id} should have hasWebSearch from live API`);
    }

    if (id === 'guest-local-tips' && !scenario.metadata?.showsGuestUpsell) {
      fail(checks, id, 'Guest local-tips scenario should have showsGuestUpsell metadata from capture');
    }

    if (id === 'guest-local-tips' && scenario.metadata?.hasWebSearch) {
      fail(checks, id, 'Guest scenario must not mark hasWebSearch (anonymous has no web search)');
    }

    if (ITINERARY_SCENARIO_IDS.has(id) && scenario.metadata?.hasWebSearch) {
      fail(checks, id, 'NPS itinerary should use NPS + weather only, not web search');
    }

    if (scenario.turns?.length) {
      for (let i = 0; i < scenario.turns.length; i += 1) {
        const turn = scenario.turns[i];
        if ((turn.answer || '').length < 80) {
          fail(checks, id, `Turn ${i + 1} answer too short — likely empty capture`);
        }
        if (
          !WEB_SEARCH_SCENARIO_IDS.has(id) &&
          id !== 'guest-local-tips' &&
          turn.metadata?.hasWebSearch
        ) {
          fail(checks, id, `Turn ${i + 1} incorrectly marked hasWebSearch`);
        }
      }
    }

    if (
      !scenario.turns?.length &&
      !WEB_SEARCH_SCENARIO_IDS.has(id) &&
      !id.startsWith(COMPARE_SCENARIO_PREFIX) &&
      id !== 'guest-local-tips' &&
      scenario.metadata?.hasWebSearch
    ) {
      fail(checks, id, 'General NPS scenario incorrectly marked hasWebSearch');
    }

    if (
      id !== 'guest-local-tips' &&
      /want live prices and ratings\?/i.test(allScenarioText(scenario))
    ) {
      fail(checks, id, 'Upsell footer should only appear on guest-local-tips capture');
    }

    if ((primaryAnswer(scenario) || '').length < 80) {
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
