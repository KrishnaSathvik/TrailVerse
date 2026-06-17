#!/usr/bin/env node
/**
 * Run the 4 Trailie demo questions live and export Q&A (+ diff vs saved demo JSON).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sanitizeTrailieDemoAnswer } from '../src/lib/trailieDemoSanitize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
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
const EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;
const TIMEOUT_MS = Number(process.env.TRAILIE_DEMO_TIMEOUT_MS || 180000);
const DEMO_PATH = join(__dirname, '../src/data/trailieDemoResponses.json');

const SCENARIOS = [
  {
    id: 'compare-yosemite-sequoia',
    label: 'Compare',
    question:
      'I have 3 days in late September. Should I choose Yosemite or Sequoia for easy hikes, photography, and fewer crowds? Pick one and explain why.',
    metadata: { skipUserContext: true },
  },
  {
    id: 'zion-couple-itinerary',
    label: 'Itinerary',
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
    question:
      "I'm visiting Glacier in July with only one full day. What should I prioritize, and what's the backup plan if Logan Pass parking is full?",
    metadata: { skipUserContext: true },
  },
  {
    id: 'valley-of-fire-weekend',
    label: 'State park',
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

async function postChat({ token, messages, metadata }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const { ok, status, body: payload } = await fetchJson(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages, provider: 'auto', metadata: metadata || {} }),
  });
  if (!ok) throw new Error(payload?.error || `HTTP ${status}`);
  return payload?.data || {};
}

async function runScenario(scenario, token) {
  if (scenario.multiTurn) {
    const messages = [];
    const turns = [];
    for (const turn of scenario.turns) {
      messages.push({ role: 'user', content: turn.question });
      const data = await postChat({ token, messages, metadata: turn.metadata });
      const answer = sanitizeTrailieDemoAnswer(data.content || '');
      messages.push({ role: 'assistant', content: data.content || '' });
      turns.push({
        question: turn.question,
        answer,
        metadata: {
          hasLiveData: Boolean(data.hasLiveData),
          hasWebSearch: Boolean(data.hasWebSearch),
          provider: data.provider,
          model: data.model,
        },
      });
    }
    return { id: scenario.id, label: scenario.label, turns };
  }

  const data = await postChat({
    token,
    messages: [{ role: 'user', content: scenario.question }],
    metadata: scenario.metadata,
  });
  return {
    id: scenario.id,
    label: scenario.label,
    question: scenario.question,
    answer: sanitizeTrailieDemoAnswer(data.content || ''),
    metadata: {
      hasLiveData: Boolean(data.hasLiveData),
      hasWebSearch: Boolean(data.hasWebSearch),
      provider: data.provider,
      model: data.model,
    },
  };
}

function loadSavedDemo() {
  if (!existsSync(DEMO_PATH)) return null;
  return JSON.parse(readFileSync(DEMO_PATH, 'utf8'));
}

function savedScenario(saved, id) {
  return saved?.scenarios?.find((s) => s.id === id) || null;
}

function formatMeta(m = {}) {
  const parts = [
    m.provider && m.model ? `${m.provider}/${m.model}` : null,
    m.hasLiveData ? 'live data' : null,
    m.hasWebSearch ? 'web search' : null,
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function buildReport(liveResults, saved) {
  const lines = [];
  const now = new Date().toISOString();
  lines.push('# Trailie live comparison — 4 demo questions');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push(`API: ${API_BASE}/ai/chat (authenticated)`);
  if (saved?.generatedAt) {
    lines.push(`Saved demo JSON: v${saved.version}, captured ${saved.generatedAt}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const live of liveResults) {
    const prev = savedScenario(saved, live.id);
    lines.push(`## ${live.label} — \`${live.id}\``);
    lines.push('');

    const renderTurn = (n, question, answer, meta, prevTurn) => {
      lines.push(`### Turn ${n}`);
      lines.push('');
      lines.push('**Question**');
      lines.push('');
      lines.push(question);
      lines.push('');
      lines.push(`**Live Trailie answer**${formatMeta(meta)}`);
      lines.push('');
      lines.push(answer);
      lines.push('');
      if (prevTurn) {
        const same = prevTurn.answer === answer;
        lines.push(
          `**Vs saved demo:** ${same ? 'identical text' : `different (${prevTurn.answer.length} → ${answer.length} chars)`}`
        );
        if (!same && prevTurn.answer.slice(0, 120) !== answer.slice(0, 120)) {
          lines.push('');
          lines.push('_Saved demo opened with:_');
          lines.push('');
          lines.push(`> ${prevTurn.answer.split('\n')[0].slice(0, 200)}`);
          lines.push('');
          lines.push('_Live opened with:_');
          lines.push('');
          lines.push(`> ${answer.split('\n')[0].slice(0, 200)}`);
        }
      }
      lines.push('');
    };

    if (live.turns) {
      live.turns.forEach((turn, i) => {
        const prevTurn = prev?.turns?.[i] || (i === 0 ? prev : null);
        renderTurn(i + 1, turn.question, turn.answer, turn.metadata, prevTurn);
      });
    } else {
      renderTurn(1, live.question, live.answer, live.metadata, prev);
    }

    lines.push('---');
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const token = await login();
  if (!token) {
    throw new Error('PLAN_AI_TEST_EMAIL and PLAN_AI_TEST_PASSWORD required');
  }

  console.log(`Running ${SCENARIOS.length} scenarios against live Trailie...\n`);
  const liveResults = [];
  for (const scenario of SCENARIOS) {
    process.stdout.write(`→ ${scenario.id}... `);
    const result = await runScenario(scenario, token);
    liveResults.push(result);
    const sample = result.turns ? result.turns.at(-1) : result;
    console.log(`OK (${sample.answer.length} chars)`);
  }

  const saved = loadSavedDemo();
  const report = buildReport(liveResults, saved);
  const outPath = join(ROOT, 'docs/trailie-live-comparison.md');
  writeFileSync(outPath, report, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
