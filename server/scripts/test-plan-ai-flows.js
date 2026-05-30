#!/usr/bin/env node
/**
 * Local Plan AI smoke tests — anonymous + authenticated /api/ai/chat*.
 *
 * Usage:
 *   PLAN_AI_TEST_EMAIL=you@example.com PLAN_AI_TEST_PASSWORD='secret' \
 *     node server/scripts/test-plan-ai-flows.js
 *
 * Optional: API_BASE=http://127.0.0.1:5001/api
 */

'use strict';

const crypto = require('crypto');

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const TEST_EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const TEST_PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;
const REQUEST_TIMEOUT_MS = Number(process.env.PLAN_AI_TIMEOUT_MS || 180000);

const UPSELL_MARKER = 'Want live prices and ratings?';
const CONVERSION_RE = /you can only send 5 messages/i;

/** @type {Array<{ id: string, mode: 'anon'|'auth', message: string, metadata?: object, expect: Record<string, unknown> }>} */
const CASES = [
  {
    id: 'anon-lodging',
    mode: 'anon',
    message:
      'Where should I stay and eat near Yellowstone? I am driving in from Salt Lake City and want gateway town recommendations.',
    metadata: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
    expect: { minChars: 400, upsell: true, mentionsYellowstone: true, noConversion: true },
  },
  {
    id: 'anon-road',
    mode: 'anon',
    message: 'Are there any road closures on Going-to-the-Sun Road in Glacier National Park this week?',
    metadata: { parkCode: 'glac', parkName: 'Glacier National Park' },
    expect: { minChars: 200, upsell: true, mentionsGlacier: true, noConversion: true },
  },
  {
    id: 'anon-trail',
    mode: 'anon',
    message: 'What are current trail conditions for Angels Landing in Zion National Park?',
    metadata: { parkCode: 'zion', parkName: 'Zion National Park' },
    expect: { minChars: 200, upsell: true, noConversion: true },
  },
  {
    id: 'anon-itinerary',
    mode: 'anon',
    message: 'Plan a 3-day itinerary for Grand Canyon National Park in October for two adults who like moderate hikes.',
    metadata: { parkCode: 'grca', parkName: 'Grand Canyon National Park' },
    expect: { minChars: 500, upsell: false, noConversion: true },
  },
  {
    id: 'anon-permits',
    mode: 'anon',
    message: 'Do I need a permit to hike Half Dome in Yosemite National Park?',
    metadata: { parkCode: 'yose', parkName: 'Yosemite National Park' },
    expect: { minChars: 150, upsell: false, noConversion: true },
  },
  {
    id: 'anon-fee-free',
    mode: 'anon',
    message: 'Are there any fee-free entrance days if I visit parks over July 4 weekend 2026?',
    expect: { minChars: 150, mentionsFeeFree: true, noConversion: true },
  },
  {
    id: 'auth-lodging-web',
    mode: 'auth',
    message:
      'Best hotels and restaurants near Zion National Park — I want live-style specifics for Springdale vs Kanab.',
    metadata: { parkCode: 'zion', parkName: 'Zion National Park' },
    expect: { minChars: 400, upsell: false, hasLiveData: true },
  },
  {
    id: 'auth-road',
    mode: 'auth',
    message: 'Current road closures and driving conditions for Rocky Mountain National Park Trail Ridge Road?',
    metadata: { parkCode: 'romo', parkName: 'Rocky Mountain National Park' },
    expect: { minChars: 200, upsell: false, hasLiveData: true },
  },
  {
    id: 'auth-itinerary',
    mode: 'auth',
    message: 'Build a 4-day Acadia National Park itinerary in September — photography and easy coastal walks.',
    metadata: { parkCode: 'acad', parkName: 'Acadia National Park' },
    expect: { minChars: 600, upsell: false, hasLiveData: true },
  },
  {
    id: 'auth-alerts',
    mode: 'auth',
    message: 'What alerts and closures should I know for Yellowstone National Park right now?',
    metadata: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
    expect: { minChars: 200, upsell: false, hasLiveData: true },
  },
];

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function login() {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    return { token: null, skipAuth: true };
  }
  const { ok, status, body } = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!ok || !body.token) {
    throw new Error(`Login failed (${status}): ${body.error || JSON.stringify(body)}`);
  }
  return { token: body.token, skipAuth: false };
}

async function chatAnon(message, metadata, anonymousId) {
  return fetchJson(`${API_BASE}/ai/chat-anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'claude',
      anonymousId,
      messages: [{ role: 'user', content: message }],
      metadata: metadata || {},
    }),
  });
}

async function chatAuth(message, metadata, token) {
  return fetchJson(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: 'claude',
      messages: [{ role: 'user', content: message }],
      metadata: metadata || {},
    }),
  });
}

async function sessionStatus(anonymousId) {
  return fetchJson(`${API_BASE}/ai/session-status/${anonymousId}`, { method: 'GET' });
}

function excerpt(content, max = 280) {
  if (!content) return '(empty)';
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function evaluate(caseDef, data, httpOk) {
  const content = data?.content || '';
  const failures = [];
  const notes = [];

  if (!httpOk) failures.push(`HTTP error`);
  if (data?.error) failures.push(`API error: ${data.error}`);
  if (data?.isConversionMessage) failures.push('hit 5-message conversion gate');

  const exp = caseDef.expect;
  if (exp.minChars && content.length < exp.minChars) {
    failures.push(`content too short (${content.length} < ${exp.minChars})`);
  }
  if (exp.noConversion && CONVERSION_RE.test(content)) {
    failures.push('unexpected conversion message');
  }
  if (exp.upsell === true && !content.includes(UPSELL_MARKER)) {
    failures.push('missing anonymous web-search upsell footer');
  }
  if (exp.upsell === false && content.includes(UPSELL_MARKER)) {
    failures.push('unexpected upsell on non-upsell case');
  }
  if (exp.hasLiveData === true && !data?.hasLiveData) {
    failures.push('hasLiveData=false (expected NPS and/or weather facts)');
  }
  if (exp.mentionsYellowstone && !/yellowstone/i.test(content)) {
    failures.push('expected Yellowstone mention');
  }
  if (exp.mentionsGlacier && !/glacier/i.test(content)) {
    failures.push('expected Glacier mention');
  }
  if (exp.mentionsFeeFree && !/fee.?free|free entrance/i.test(content)) {
    failures.push('expected fee-free mention');
  }

  if (content.includes('temporarily unavailable') || /qualify.*typically/i.test(content)) {
    notes.push('web-search-unavailable-style wording present');
  }
  if (/I don't have live/i.test(content) && caseDef.mode === 'anon' && exp.upsell === true) {
    notes.push('warn: redundant "no live data" in body (upsell should cover it)');
  }

  return { failures, notes, contentLength: content.length, provider: data?.provider };
}

async function runCase(caseDef, token) {
  const started = Date.now();
  let result;
  let anonymousId;

  if (caseDef.mode === 'anon') {
    anonymousId = `test-${caseDef.id}-${crypto.randomUUID()}`;
    result = await chatAnon(caseDef.message, caseDef.metadata, anonymousId);
  } else {
    if (!token) {
      return {
        id: caseDef.id,
        mode: caseDef.mode,
        pass: false,
        failures: ['skipped — no auth token (set PLAN_AI_TEST_EMAIL/PASSWORD)'],
        ms: 0,
      };
    }
    result = await chatAuth(caseDef.message, caseDef.metadata, token);
  }

  const data = result.body?.data || result.body;
  const { failures, notes, contentLength, provider } = evaluate(caseDef, data, result.ok);
  const ms = Date.now() - started;

  return {
    id: caseDef.id,
    mode: caseDef.mode,
    pass: failures.length === 0,
    failures,
    notes,
    ms,
    status: result.status,
    contentLength,
    provider,
    hasLiveData: data?.hasLiveData,
    hasItinerary: data?.hasItinerary,
    canSendMore: data?.canSendMore,
    messageCount: data?.messageCount,
    excerpt: excerpt(data?.content),
    anonymousId: caseDef.mode === 'anon' ? anonymousId : undefined,
  };
}

async function testSessionRestore() {
  const anonymousId = `test-restore-${crypto.randomUUID()}`;
  const msg = 'Quick question: best time of day for sunrise at Bryce Canyon?';
  const chat = await chatAnon(msg, { parkCode: 'brca', parkName: 'Bryce Canyon National Park' }, anonymousId);
  const chatData = chat.body?.data;
  if (!chat.ok || !chatData?.content) {
    return { id: 'anon-session-restore', pass: false, failures: ['initial chat failed'], ms: 0 };
  }
  const status = await sessionStatus(anonymousId);
  const messages = status.body?.messages || [];
  const failures = [];
  if (!status.ok) failures.push(`session-status HTTP ${status.status}`);
  if (messages.length < 2) failures.push(`expected >=2 messages, got ${messages.length}`);
  const roles = messages.map((m) => m.role).join(',');
  if (!roles.includes('user') || !roles.includes('assistant')) {
    failures.push(`unexpected roles: ${roles}`);
  }
  return {
    id: 'anon-session-restore',
    mode: 'anon',
    pass: failures.length === 0,
    failures,
    notes: [`restored ${messages.length} messages`],
    ms: 0,
    excerpt: `roles=${roles}`,
  };
}

async function main() {
  const onlyFilter = process.env.PLAN_AI_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

  console.log(`\nPlan AI endpoint tests → ${API_BASE}\n`);

  const providers = await fetchJson(`${API_BASE}/ai/providers-anonymous`);
  if (!providers.ok) {
    console.error('Backend unreachable. Start server: cd server && npm run dev');
    process.exit(1);
  }
  console.log('Providers:', providers.body.providers?.map((p) => p.id).join(', ') || 'unknown');

  let token = null;
  try {
    const auth = await login();
    if (auth.skipAuth) {
      console.warn('⚠️  PLAN_AI_TEST_EMAIL / PLAN_AI_TEST_PASSWORD not set — auth cases will skip\n');
    } else {
      token = auth.token;
      console.log('✓ Logged in for authenticated tests\n');
    }
  } catch (err) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }

  const results = [];
  const casesToRun = onlyFilter?.length
    ? CASES.filter((c) => onlyFilter.includes(c.id) || onlyFilter.includes(c.mode))
    : CASES;

  for (const caseDef of casesToRun) {
    process.stdout.write(`  … ${caseDef.id} (${caseDef.mode})`);
    try {
      const r = await runCase(caseDef, token);
      results.push(r);
      console.log(r.pass ? ' ✓' : ' ✗');
    } catch (err) {
      results.push({
        id: caseDef.id,
        mode: caseDef.mode,
        pass: false,
        failures: [err.message],
        ms: 0,
      });
      console.log(` ✗ ${err.message}`);
    }
  }

  if (!onlyFilter?.length || onlyFilter.includes('anon-session-restore')) {
    process.stdout.write('  … anon-session-restore');
    try {
      const restore = await testSessionRestore();
      results.push(restore);
      console.log(restore.pass ? ' ✓' : ' ✗');
    } catch (err) {
      results.push({ id: 'anon-session-restore', pass: false, failures: [err.message] });
      console.log(` ✗ ${err.message}`);
    }
  }

  console.log('\n── Results ──\n');
  let passed = 0;
  for (const r of results) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    if (r.pass) passed += 1;
    console.log(`${icon}  ${r.id} [${r.mode}] ${r.ms ? `${(r.ms / 1000).toFixed(1)}s` : ''}`);
    if (r.status) console.log(`      HTTP ${r.status} · ${r.provider || '?'} · ${r.contentLength || 0} chars`);
    if (r.hasLiveData !== undefined) console.log(`      hasLiveData=${r.hasLiveData} hasItinerary=${r.hasItinerary}`);
    if (r.failures?.length) console.log(`      ✗ ${r.failures.join('; ')}`);
    if (r.notes?.length) console.log(`      ℹ ${r.notes.join('; ')}`);
    if (r.excerpt) console.log(`      → ${r.excerpt}`);
    console.log('');
  }

  console.log(`${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
