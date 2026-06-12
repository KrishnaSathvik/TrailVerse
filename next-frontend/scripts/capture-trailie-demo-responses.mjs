#!/usr/bin/env node
/**
 * Capture Trailie demo chat responses — mixed scenarios (discovery curator,
 * head-to-head compare, itinerary, permits, guest local tips + upsell).
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
const TRAILVERSE_WEB_BASE =
  (process.env.WEBSITE_URL || 'https://www.nationalparksexplorerusa.com').replace(/\/$/, '');

function normalizeDemoLinks(text) {
  if (!text) return text;
  return text
    .replace(/https?:\/\/trailverse\.ai/g, TRAILVERSE_WEB_BASE)
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1):3000/g, TRAILVERSE_WEB_BASE)
    .replace(/\/parks\/the-narrows(?=\?|\/|$|\))/g, '/parks/zion-national-park')
    .replace(/\/parks\/bryce(?=\?|\/|$|\))/g, '/parks/bryce-canyon-national-park')
    .replace(/\/parks\/yosemite(?=\?|\/|$|\))/g, '/parks/yosemite-national-park')
    .replace(/\/parks\/zion-national-park/g, '/parks/zion-national-park');
}
const TIMEOUT_MS = Number(process.env.TRAILIE_DEMO_TIMEOUT_MS || 180000);
const EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;

/**
 * Demo scenarios — data-source policy (logged-in):
 *   NPS + catalog only → discover, compare, couples, permits, open/closed, itineraries
 *   NPS + live web     → gateway-town hotels, restaurants, road/trail conditions
 *   Anonymous          → same answers from training; upsell only on local-logistics questions
 */
const SCENARIOS = [
  {
    id: 'discover-july-follow-up',
    label: 'Discover',
    chatTitle: 'Cool July parks',
    multiTurn: true,
    turns: [
      {
        question:
          'What are the best national parks to visit in July with cool weather, lakes or beaches?',
        metadata: { skipUserContext: true },
      },
      {
        question: 'Starting from Boston, 5 days, fine with flying.',
        metadata: { skipUserContext: true },
      },
    ],
  },
  {
    id: 'compare-zion-bryce',
    label: 'Compare',
    chatTitle: 'Zion vs Bryce',
    question: 'Zion vs Bryce for first-time visitors in October — which should we pick?',
    metadata: { skipUserContext: true },
  },
  {
    id: 'yellowstone-itinerary',
    label: 'Itinerary',
    chatTitle: 'Yellowstone · 4 days',
    question:
      'Plan a 4-day Yellowstone itinerary in September for two adults who like wildlife and moderate hikes.',
    metadata: {
      parkCode: 'yell',
      parkName: 'Yellowstone National Park',
      skipUserContext: true,
      formData: {
        parkCode: 'yell',
        startDate: '2026-09-10',
        endDate: '2026-09-13',
        groupSize: 2,
        budget: 'moderate',
        fitnessLevel: 'moderate',
        interests: ['wildlife', 'hiking'],
        accommodation: 'lodge',
      },
    },
  },
  {
    id: 'auth-jackson-lodging',
    label: 'Hotels & dinner',
    chatTitle: 'Hotels & dinner · Grand Teton',
    expectsWebSearch: true,
    question:
      'Best hotels and dinner spots in Jackson Hole near Grand Teton National Park for a September trip?',
    metadata: { parkCode: 'grte', parkName: 'Grand Teton National Park', skipUserContext: true },
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
  const hasWebSearch =
    scenario.id === 'discover-july-follow-up' && turnIndex > 0
      ? false
      : Boolean(data.hasWebSearch);
  const hasLiveData =
    scenario.id === 'discover-july-follow-up' && turnIndex > 0
      ? false
      : Boolean(data.hasLiveData);

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
  console.log(`Capturing ${SCENARIOS.length} Trailie demo scenarios...\n`);

  const token = await login();
  if (!token) {
    console.warn('No PLAN_AI_TEST_EMAIL/PASSWORD — using anonymous chat for auth scenarios.\n');
  }

  const results = [];

  for (const scenario of SCENARIOS) {
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
  const payload = {
    version: 6,
    source: `${API_BASE}/ai/chat + /ai/chat-anonymous`,
    captureMode: 'mixed-live',
    generatedAt: new Date().toISOString(),
    scenarios: results,
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

  console.log(`\nWrote ${results.length} scenarios to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
