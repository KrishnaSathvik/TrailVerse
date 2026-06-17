#!/usr/bin/env node
/**
 * Capture Trailie demo chat responses — 4 scenarios (discovery, compare, itinerary, web local).
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sanitizeTrailieDemoAnswer } from '../src/lib/trailieDemoSanitize.js';
import { verifyTrailieDemoAccuracy } from './verify-trailie-demo-accuracy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER_ENV = join(ROOT, 'server/.env');
if (existsSync(SERVER_ENV)) {
  for (const line of readFileSync(SERVER_ENV, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const TRAILVERSE_WEB_BASE = (
  process.env.TRAILIE_DEMO_WEB_BASE || 'https://www.nationalparksexplorerusa.com'
).replace(/\/$/, '');

function normalizeDemoLinks(text) {
  if (!text) return text;
  return text
    .replace(/https?:\/\/(?:www\.)?trailverse\.ai/g, TRAILVERSE_WEB_BASE)
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1):3000/g, TRAILVERSE_WEB_BASE)
    .replace(/\/parks\/the-narrows(?=\?|\/|$|\))/g, '/parks/zion-national-park')
    .replace(/\/parks\/bryce(?=\?|\/|$|\))/g, '/parks/bryce-canyon-national-park')
    .replace(/\/parks\/yosemite(?=\?|\/|$|\))/g, '/parks/yosemite-national-park')
    .replace(/\/parks\/sequoia(?=\?|\/|$|\))/g, '/parks/sequoia-kings-canyon-national-park')
    .replace(/\/parks\/glacier(?=\?|\/|$|\))/g, '/parks/glacier-national-park')
    .replace(/\/parks\/canyonlands(?=\?|\/|$|\))/g, '/parks/canyonlands-national-park')
    .replace(/\/parks\/boston(?=\?|\/|$|\))/g, '/parks/acadia-national-park')
    .replace(/\[([^\]]+)\]\([^)]*\/parks\/boston[^)]*\)/g, '$1')
    .replace(/\/parks\/zion-national-park/g, '/parks/zion-national-park');
}

const TIMEOUT_MS = Number(process.env.TRAILIE_DEMO_TIMEOUT_MS || 180000);
const EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;

/**
 * Demo scenarios — public mix: 3 NPS + 1 non-NPS (logged-in authenticated capture).
 *   NPS compare / itinerary / logistics → catalog + live NPS data
 *   Non-NPS (Valley of Fire)         → web search grounding
 */
const SCENARIOS = [
  {
    id: 'compare-yosemite-sequoia',
    label: 'Compare',
    chatTitle: 'Yosemite vs Sequoia',
    question:
      'I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds? Pick one and explain why.',
    metadata: { skipUserContext: true },
  },
  {
    id: 'zion-couple-itinerary',
    label: 'Itinerary',
    chatTitle: 'Zion weekend',
    multiTurn: true,
    suppressWebOnRefinement: true,
    turns: [
      {
        question:
          'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
        metadata: { skipUserContext: true },
      },
      {
        question:
          'Actually make it more relaxed, avoid shuttle-heavy parts if possible, and add one good sunset spot.',
        metadata: { skipUserContext: true },
      },
    ],
  },
  {
    id: 'glacier-one-day-july',
    label: 'Logistics',
    chatTitle: 'Glacier in one day',
    question:
      "I'm visiting Glacier in July with only one full day. What should I prioritize, and what's the backup plan if Logan Pass parking is full?",
    metadata: { skipUserContext: true },
  },
  {
    id: 'valley-of-fire-weekend',
    label: 'State park',
    chatTitle: 'Valley of Fire',
    expectsWebSearch: true,
    question:
      'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.',
    metadata: { skipUserContext: true },
  },
];

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  if (!EMAIL || !PASSWORD) return null;
  const { ok, status, body } = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!ok || !body.token) {
    throw new Error(`Login failed (${status}): ${body.error || 'no token'}`);
  }
  return body.token;
}

function turnMetadataFromApi(
  scenario,
  data,
  { authenticated = false, hasGuestUpsell = false, turnIndex = 0 } = {}
) {
  const isDiscoverRefinement =
    scenario.multiTurn && scenario.suppressWebOnRefinement && turnIndex > 0;
  const hasWebSearch = isDiscoverRefinement ? false : Boolean(data.hasWebSearch);
  const hasLiveData = isDiscoverRefinement ? false : Boolean(data.hasLiveData);

  return {
    hasLiveData,
    hasWebSearch,
    showsGuestUpsell: Boolean(scenario.expectsGuestUpsell && hasGuestUpsell),
    captureAs: scenario.captureAs || (authenticated ? 'authenticated' : 'anonymous'),
    parkName: scenario.chatTitle || data.parkName || scenario.metadata?.parkName,
    parkNames: data.parkNames || [],
    provider: data.provider,
    model: data.model,
  };
}

function entryFromApiData(scenario, data, { authenticated = false } = {}) {
  const rawContent = data.content || '';
  const hasGuestUpsell = /Want live prices and ratings\?/i.test(rawContent);
  return {
    id: scenario.id,
    label: scenario.label,
    chatTitle: scenario.chatTitle || scenario.label,
    question: scenario.question,
    answer: normalizeDemoLinks(
      sanitizeTrailieDemoAnswer(rawContent, { preserveWebUpsell: scenario.expectsGuestUpsell })
    ),
    metadata: turnMetadataFromApi(scenario, data, { authenticated, hasGuestUpsell }),
    capturedAt: new Date().toISOString(),
  };
}

async function postChat({ scenario, token, messages, turnMetadata }) {
  const useToken = scenario.captureAs === 'anonymous' ? null : token;
  const endpoint = useToken ? `${API_BASE}/ai/chat` : `${API_BASE}/ai/chat-anonymous`;
  const headers = { 'Content-Type': 'application/json' };
  if (useToken) headers.Authorization = `Bearer ${useToken}`;

  const body = {
    messages,
    provider: 'auto',
    metadata: turnMetadata || scenario.metadata || {},
  };
  if (!useToken) body.anonymousId = `demo-capture-${scenario.id}-${randomUUID()}`;

  const { ok, status, body: payload } = await fetchJson(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!ok) throw new Error(payload?.error || `HTTP ${status}`);
  return payload?.data || {};
}

async function fetchScenarioLive(scenario, token) {
  if (scenario.multiTurn && scenario.turns?.length) {
    const messages = [];
    const capturedTurns = [];
    let lastData = {};

    for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex += 1) {
      const turn = scenario.turns[turnIndex];
      messages.push({ role: 'user', content: turn.question });
      const data = await postChat({
        scenario,
        token,
        messages,
        turnMetadata: turn.metadata || scenario.metadata,
      });
      lastData = data;
      const rawContent = data.content || '';
      const hasGuestUpsell = /Want live prices and ratings\?/i.test(rawContent);
      const answer = normalizeDemoLinks(
        sanitizeTrailieDemoAnswer(rawContent, { preserveWebUpsell: scenario.expectsGuestUpsell })
      );
      messages.push({ role: 'assistant', content: rawContent });
      capturedTurns.push({
        question: turn.question,
        answer,
        metadata: turnMetadataFromApi(scenario, data, {
          authenticated: Boolean(scenario.captureAs !== 'anonymous' && token),
          hasGuestUpsell,
          turnIndex,
        }),
      });
    }

    const first = capturedTurns[0];
    return {
      id: scenario.id,
      label: scenario.label,
      chatTitle: scenario.chatTitle || scenario.label,
      multiTurn: true,
      question: first.question,
      answer: first.answer,
      turns: capturedTurns,
      metadata: first.metadata,
      capturedAt: new Date().toISOString(),
    };
  }

  const data = await postChat({
    scenario,
    token,
    messages: [{ role: 'user', content: scenario.question }],
  });
  return entryFromApiData(scenario, data, {
    authenticated: Boolean(scenario.captureAs !== 'anonymous' && token),
  });
}

async function main() {
  const onlyId = process.env.TRAILIE_DEMO_SCENARIO_ID?.trim();
  const scenariosToRun = onlyId
    ? SCENARIOS.filter((s) => s.id === onlyId)
  : SCENARIOS;

  if (onlyId && scenariosToRun.length === 0) {
    throw new Error(`Unknown TRAILIE_DEMO_SCENARIO_ID: ${onlyId}`);
  }

  console.log(
    `Capturing ${scenariosToRun.length} Trailie demo scenario${scenariosToRun.length === 1 ? '' : 's'}${onlyId ? ` (${onlyId} only)` : ''}...\n`
  );

  const token = await login();
  if (!token) {
    console.warn('No PLAN_AI_TEST_EMAIL/PASSWORD — using anonymous chat for auth scenarios.\n');
  }

  const results = [];

  for (const scenario of scenariosToRun) {
    process.stdout.write(`→ ${scenario.id}... `);
    try {
      const entry = await fetchScenarioLive(scenario, token);
      entry.sourceNote =
        entry.metadata.captureAs === 'anonymous' ? 'live anonymous chat' : 'live authenticated chat';
      results.push(entry);
      const flags = [
        entry.metadata.hasLiveData ? 'live' : null,
        entry.metadata.hasWebSearch ? 'web' : 'nps',
        entry.metadata.showsGuestUpsell ? 'upsell' : null,
      ]
        .filter(Boolean)
        .join('+');
      console.log(`OK (${entry.answer.length} chars, ${flags})`);
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const outPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/trailieDemoResponses.json');
  let nextVersion = 1;
  let mergedScenarios = results;
  if (existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, 'utf8'));
      nextVersion = Number(prev.version || 0) + 1;
      if (onlyId && Array.isArray(prev.scenarios)) {
        const byId = new Map(prev.scenarios.map((s) => [s.id, s]));
        for (const entry of results) byId.set(entry.id, entry);
        mergedScenarios = SCENARIOS.map((s) => byId.get(s.id)).filter(Boolean);
        if (mergedScenarios.length !== SCENARIOS.length) {
          throw new Error('Merged demo JSON is missing scenarios — run full capture');
        }
      }
    } catch (err) {
      if (onlyId && err.message.includes('missing scenarios')) throw err;
      nextVersion = 1;
    }
  } else if (onlyId) {
    throw new Error('Cannot capture a single scenario without existing trailieDemoResponses.json');
  }

  const payload = {
    version: nextVersion,
    source: `${API_BASE}/ai/chat + /ai/chat-anonymous`,
    captureMode: onlyId ? 'single-scenario-refresh' : 'mixed-live',
    generatedAt: new Date().toISOString(),
    scenarios: mergedScenarios,
  };

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log('\nVerifying accuracy against live Zion alerts...');
  const { failures, checks } = await verifyTrailieDemoAccuracy({ demoPath: outPath });
  for (const c of checks) {
    if (!c.ok) console.log(`  ✗ [${c.id}] ${c.message}`);
  }
  if (failures.length > 0) {
    console.error(`\nVerification failed (${failures.length}). Demo JSON written but needs fixes before shipping.`);
    process.exitCode = 1;
    return;
  }
  console.log('  ✓ All accuracy checks passed');

  console.log(`\nWrote ${mergedScenarios.length} scenarios to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
