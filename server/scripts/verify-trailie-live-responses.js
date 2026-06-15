#!/usr/bin/env node
/**
 * Live Plan AI verification — guest (anonymous) + logged-in, general + web-search.
 *
 *   PLAN_AI_TEST_EMAIL=... PLAN_AI_TEST_PASSWORD=... node scripts/verify-trailie-live-responses.js
 *   node scripts/verify-trailie-live-responses.js --guest-only
 *   node scripts/verify-trailie-live-responses.js --save-report
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5001/api';
const EMAIL = process.env.PLAN_AI_TEST_EMAIL;
const PASSWORD = process.env.PLAN_AI_TEST_PASSWORD;
const TIMEOUT_MS = Number(process.env.PLAN_AI_TIMEOUT_MS || 180000);
const GUEST_ONLY = process.argv.includes('--guest-only');
const AUTH_ONLY = process.argv.includes('--auth-only');
const SAVE_REPORT = process.argv.includes('--save-report');

const UPSELL = /Want live prices and ratings\?/i;

/** @type {Array<{ id: string, message: string, metadata?: object, type: 'general'|'web'|'alerts', expect: { guest?: object, auth?: object } }>} */
const CASES = [
  {
    id: 'discover-july',
    type: 'general',
    message: 'What are the best national parks to visit in July with cool weather, lakes or beaches?',
    metadata: { skipUserContext: true },
    expect: {
      guest: { minChars: 400, upsell: false, webSearch: false, liveData: false },
      auth: { minChars: 400, upsell: false, webSearch: false, liveData: false },
    },
  },
  {
    id: 'compare-zion-bryce',
    type: 'general',
    message: 'Zion vs Bryce for first-time visitors in October — which should we pick?',
    metadata: { skipUserContext: true },
    expect: {
      guest: { minChars: 300, upsell: false, webSearch: false },
      auth: { minChars: 300, upsell: false, webSearch: false },
    },
  },
  {
    id: 'angels-landing-open',
    type: 'alerts',
    message: 'Is Angels Landing open right now in Zion National Park?',
    metadata: { parkCode: 'zion', parkName: 'Zion National Park', skipUserContext: true },
    expect: {
      guest: { minChars: 150, upsell: false, respectAngelsClosure: true },
      auth: { minChars: 150, upsell: false, respectAngelsClosure: true, webSearch: false, liveData: true },
    },
  },
  {
    id: 'narrows-permit',
    type: 'general',
    message: 'Do I need a permit to hike The Narrows top-down in Zion?',
    metadata: { parkCode: 'zion', parkName: 'Zion National Park', skipUserContext: true },
    expect: {
      guest: { minChars: 120, upsell: false, webSearch: false },
      auth: { minChars: 120, upsell: false, webSearch: false },
    },
  },
  {
    id: 'yellowstone-itinerary',
    type: 'general',
    message:
      'Plan a 4-day Yellowstone itinerary in September for two adults who like wildlife and moderate hikes.',
    metadata: {
      parkCode: 'yell',
      parkName: 'Yellowstone National Park',
      skipUserContext: true,
    },
    expect: {
      guest: { minChars: 500, upsell: false, webSearch: false, mentionsYellowstone: true },
      auth: { minChars: 500, upsell: false, webSearch: false, mentionsYellowstone: true, liveData: true },
    },
  },
  {
    id: 'guest-west-yellowstone',
    type: 'web',
    message: 'Where should we eat and stay in West Yellowstone before entering the park?',
    metadata: { parkCode: 'yell', parkName: 'Yellowstone National Park', skipUserContext: true },
    expect: {
      guest: { minChars: 300, upsell: true, webSearch: false },
      auth: { minChars: 300, upsell: false, webSearch: true },
    },
  },
  {
    id: 'auth-jackson-lodging',
    type: 'web',
    message:
      'Best hotels and dinner spots in Jackson Hole near Grand Teton National Park for a September trip?',
    metadata: { parkCode: 'grte', parkName: 'Grand Teton National Park', skipUserContext: true },
    expect: {
      guest: { minChars: 300, upsell: true, webSearch: false },
      auth: { minChars: 300, upsell: false, webSearch: true },
    },
  },
  {
    id: 'glacier-road',
    type: 'web',
    message: 'Are there any road closures on Going-to-the-Sun Road in Glacier National Park this week?',
    metadata: { parkCode: 'glac', parkName: 'Glacier National Park', skipUserContext: true },
    expect: {
      guest: { minChars: 150, upsell: true, webSearch: false },
      auth: { minChars: 150, upsell: false, webSearch: true },
    },
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
  const { ok, body } = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!ok || !body.token) throw new Error(`Login failed: ${body.error || 'no token'}`);
  return body.token;
}

async function fetchZionAlerts() {
  const { ok, body } = await fetchJson(`${API_BASE}/parks/zion/alerts`);
  if (!ok) throw new Error('Could not load Zion alerts');
  return body.data || body.alerts || [];
}

async function chat(mode, message, metadata, token) {
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    provider: 'auto',
    messages: [{ role: 'user', content: message }],
    metadata: metadata || {},
  };
  let url;
  if (mode === 'guest') {
    url = `${API_BASE}/ai/chat-anonymous`;
    body.anonymousId = `verify-${crypto.randomUUID()}`;
  } else {
    url = `${API_BASE}/ai/chat`;
    headers.Authorization = `Bearer ${token}`;
  }
  const started = Date.now();
  const { ok, status, body: payload } = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = payload?.data || payload;
  return { ok, status, data, ms: Date.now() - started };
}

function evaluate(mode, caseDef, data, httpOk, zionAlerts) {
  const exp = caseDef.expect[mode];
  const content = data?.content || '';
  const failures = [];
  const notes = [];

  if (!exp) return { failures: ['no expectations for mode'], notes, content };

  if (!httpOk) failures.push(`HTTP error`);
  if (exp.minChars && content.length < exp.minChars) {
    failures.push(`short reply (${content.length} < ${exp.minChars})`);
  }
  if (exp.upsell === true && !UPSELL.test(content)) failures.push('missing guest upsell');
  if (exp.upsell === false && UPSELL.test(content)) failures.push('unexpected upsell');
  if (exp.webSearch === true && !data?.hasWebSearch) failures.push('hasWebSearch=false (expected web)');
  if (exp.webSearch === false && data?.hasWebSearch) failures.push('hasWebSearch=true (expected NPS-only)');
  if (exp.liveData === true && !data?.hasLiveData) failures.push('hasLiveData=false');
  if (exp.liveData === false && data?.hasLiveData) notes.push('hasLiveData=true (ok if weather/NPS)');
  if (exp.mentionsYellowstone && !/yellowstone/i.test(content)) failures.push('missing Yellowstone');

  if (exp.respectAngelsClosure && zionAlerts?.length) {
    const angelsClosed = zionAlerts.some(
      (a) => /closure/i.test(a.category || '') && /angels landing/i.test(a.title || '')
    );
    const text = content.toLowerCase();
    if (angelsClosed && /\b(yes,?\s*)?angels landing is open\b|angels landing is open\b/i.test(text)) {
      failures.push('says Angels Landing open while NPS reports closure');
    }
    if (angelsClosed && !/closed|closure|not open|reopens|until/i.test(text)) {
      failures.push('Angels Landing closure not mentioned');
    }
  }

  if (/verify at \[nps\.gov\]|check nps\.gov\/zion\/planyourvisit\/conditions\.htm/i.test(content)) {
    failures.push('defers to nps.gov verify link instead of answering');
  }

  if (caseDef.id === 'narrows-permit') {
    if (/\bwait,?\s*actually\b/i.test(content)) failures.push('self-corrects mid-answer (Narrows/Subway wobble)');
    if (/subway|left fork north creek/i.test(content) && !/subway/i.test(caseDef.message)) {
      failures.push('mentions Subway on Narrows-only permit question');
    }
  }

  if (caseDef.id === 'discover-july') {
    if (/\b(?:skip|avoid|pass on)\s+(?:great sand dunes|the great sand dunes)/i.test(content)) {
      failures.push('names a park only to say skip it');
    }
  }

  return { failures, notes, content };
}

function excerpt(text, max = 220) {
  const one = (text || '').replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}

async function main() {
  console.log(`\n=== Trailie live response verification ===`);
  console.log(`API: ${API_BASE}\n`);

  const ping = await fetchJson(`${API_BASE}/ai/providers-anonymous`);
  if (!ping.ok) {
    console.error('Backend unreachable. Start: cd server && npm run dev');
    process.exit(1);
  }

  let token = null;
  if (!GUEST_ONLY) {
    try {
      token = await login();
      if (token) console.log('Auth: logged in\n');
      else console.warn('Auth: skipped (set PLAN_AI_TEST_EMAIL / PLAN_AI_TEST_PASSWORD)\n');
    } catch (err) {
      console.error('Auth login failed:', err.message);
      process.exit(1);
    }
  }

  const zionAlerts = await fetchZionAlerts();
  const lines = [];
  const summary = [];

  for (const caseDef of CASES) {
    const modes = AUTH_ONLY ? ['auth'] : GUEST_ONLY ? ['guest'] : ['guest', 'auth'];

    for (const mode of modes) {
      if (mode === 'auth' && !token) {
        summary.push({ id: caseDef.id, mode, pass: false, skipped: true });
        continue;
      }

      process.stdout.write(`  ${caseDef.id} (${mode})… `);
      let result;
      try {
        const { ok, status, data, ms } = await chat(
          mode,
          caseDef.message,
          caseDef.metadata,
          token
        );
        const { failures, notes, content } = evaluate(mode, caseDef, data, ok, zionAlerts);
        const pass = failures.length === 0;
        result = {
          id: caseDef.id,
          type: caseDef.type,
          mode,
          pass,
          skipped: false,
          failures,
          notes,
          ms,
          status,
          hasWebSearch: data?.hasWebSearch,
          hasLiveData: data?.hasLiveData,
          provider: data?.provider,
          model: data?.model,
          excerpt: excerpt(content),
          contentLength: content.length,
        };
        console.log(pass ? 'PASS' : 'FAIL');
      } catch (err) {
        result = {
          id: caseDef.id,
          mode,
          pass: false,
          skipped: false,
          failures: [err.message],
          ms: 0,
        };
        console.log(`ERROR ${err.message}`);
      }
      summary.push(result);

      lines.push('');
      lines.push(`${'─'.repeat(72)}`);
      lines.push(`${caseDef.id} · ${caseDef.type} · ${mode}${result.skipped ? ' (skipped)' : ''}`);
      lines.push(`Q: ${caseDef.message}`);
      if (!result.skipped) {
        lines.push(
          `Flags: hasWebSearch=${result.hasWebSearch} hasLiveData=${result.hasLiveData} · ${result.provider}/${result.model} · ${result.contentLength} chars · ${(result.ms / 1000).toFixed(1)}s`
        );
        if (result.failures?.length) lines.push(`FAIL: ${result.failures.join('; ')}`);
        if (result.notes?.length) lines.push(`NOTE: ${result.notes.join('; ')}`);
        lines.push(`→ ${result.excerpt || '(empty)'}`);
      }
    }
  }

  const ran = summary.filter((s) => !s.skipped);
  const passed = ran.filter((s) => s.pass);
  const skipped = summary.filter((s) => s.skipped);

  console.log('\n=== SUMMARY ===\n');
  for (const s of summary) {
    if (s.skipped) {
      console.log(`– ${s.id.padEnd(22)} ${s.mode.padEnd(6)} skipped (no auth creds)`);
      continue;
    }
    console.log(
      `${s.pass ? '✓' : '✗'} ${s.id.padEnd(22)} ${s.mode.padEnd(6)} web=${s.hasWebSearch ? 'Y' : 'n'} live=${s.hasLiveData ? 'Y' : 'n'} ${s.failures?.length ? '· ' + s.failures.join('; ') : ''}`
    );
  }

  console.log(`\n${passed.length}/${ran.length} passed${skipped.length ? ` · ${skipped.length} auth skipped` : ''}`);

  if (SAVE_REPORT) {
    const outPath = path.join(
      __dirname,
      '../../docs/trailie-live-verify-' + new Date().toISOString().slice(0, 10) + '.txt'
    );
    const header = [
      'Trailie live response verification',
      `Generated: ${new Date().toISOString()}`,
      `API: ${API_BASE}`,
      `Passed: ${passed.length}/${ran.length}`,
      '',
    ];
    fs.writeFileSync(outPath, header.join('\n') + lines.join('\n') + '\n', 'utf8');
    console.log(`\nReport: ${outPath}`);
  }

  const failed = ran.filter((s) => !s.pass);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
