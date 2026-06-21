#!/usr/bin/env node
/**
 * Live Trailie accuracy checks — astro, photography, mixed travel.
 * Usage: node scripts/verify-astro-photography-accuracy.js [--base http://127.0.0.1:5001/api]
 */
'use strict';

const crypto = require('crypto');

const API_BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.API_BASE || 'http://127.0.0.1:5001/api';

const TIMEOUT_MS = Number(process.env.PLAN_AI_TIMEOUT_MS || 180000);

const CASES = [
  {
    id: 'sierraville-july-first-week',
    category: 'astro',
    message: 'can I shoot astrophotography in Sierraville, CA? like July First week?',
    expect: {
      hasLiveData: true,
      mustMatch: [/gibbous|95%|bright moon|poor|wash/i, /july\s*7|7th|13%/i, /july\s*14|new moon/i],
      mustNotMatch: [/2025/],
    },
  },
  {
    id: 'death-valley-milky-way-august',
    category: 'astro',
    message: 'Is Death Valley good for Milky Way photography in mid-August?',
    expect: {
      hasLiveData: true,
      mustMatch: [/milky way|moon|august|2026/i],
      mustNotMatch: [/2025/],
    },
  },
  {
    id: 'yosemite-astro-september',
    category: 'astro-nps',
    message: 'Can I do astrophotography in Yosemite in the first week of September?',
    expect: {
      hasLiveData: true,
      mustMatch: [/yosemite|moon|september|2026/i],
      mustNotMatch: [],
    },
  },
  {
    id: 'zion-night-sky-october',
    category: 'astro-nps',
    message: 'How is stargazing at Zion National Park during the first week of October?',
    expect: {
      hasLiveData: true,
      mustMatch: [/zion|moon|october|2026/i],
      mustNotMatch: [],
    },
  },
  {
    id: 'mono-lake-new-moon-july',
    category: 'astro',
    message: 'When is the best week in July 2026 for astrophotography at Mono Lake?',
    expect: {
      hasLiveData: true,
      mustMatch: [/july|2026|moon|new moon|14/i],
      mustNotMatch: [/2025/],
    },
  },
  {
    id: 'grand-teton-wildlife-photo',
    category: 'photography',
    message: 'Best spots for wildlife photography in Grand Teton in late September?',
    expect: {
      hasLiveData: true,
      mustMatch: [/grand teton|wildlife|photo/i],
      mustNotMatch: [],
    },
  },
  {
    id: 'arches-sunset-photo',
    category: 'photography',
    message: 'Where should I shoot sunset photos in Arches National Park?',
    expect: {
      hasLiveData: true,
      mustMatch: [/arch|sunset|delicate|photo|shoot/i],
      mustNotMatch: [],
    },
  },
  {
    id: 'glacier-fall-color-photo',
    category: 'photography-seasonal',
    message: 'Is Glacier National Park good for fall color photography in the first week of October?',
    expect: {
      hasLiveData: true,
      mustMatch: [/glacier|fall|color|october|photo/i],
      mustNotMatch: [],
    },
  },
  {
    id: 'jackson-hole-landscape-not-astro',
    category: 'photography-non-nps',
    message: 'Best landscape photography spots near Jackson Hole, Wyoming in early June?',
    expect: {
      hasLiveData: true,
      mustMatch: [/jackson|photo|landscape|june/i],
      mustNotMatch: [],
    },
  },
  {
    id: 'general-best-dark-sky-parks',
    category: 'discovery-astro',
    message: 'What are the best national parks for astrophotography in summer?',
    expect: {
      hasLiveData: false,
      mustMatch: [/park|astro|stargaz|milky way|dark sky/i],
      mustNotMatch: [],
    },
  },
];

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.json();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function evaluate(caseDef, data, httpOk) {
  const content = data?.content || '';
  const failures = [];
  const notes = [];

  if (!httpOk) failures.push(`HTTP error`);
  if (caseDef.expect.hasLiveData === true && !data?.hasLiveData) {
    failures.push('expected hasLiveData=true');
  }
  if (caseDef.expect.hasLiveData === false && data?.hasLiveData) {
    notes.push('hasLiveData=true (acceptable if weather/NPS fetched)');
  }

  for (const re of caseDef.expect.mustMatch || []) {
    if (!re.test(content)) failures.push(`missing pattern ${re}`);
  }
  for (const re of caseDef.expect.mustNotMatch || []) {
    if (re.test(content)) failures.push(`forbidden pattern matched ${re}`);
  }

  if (content.length < 120) failures.push(`reply too short (${content.length} chars)`);

  return { failures, notes, content };
}

async function runCase(caseDef) {
  const anonymousId = `verify-accuracy-${caseDef.id}-${crypto.randomUUID()}`;
  const started = Date.now();
  const { ok, status, body } = await fetchJson(`${API_BASE}/ai/chat-anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'auto',
      anonymousId,
      messages: [{ role: 'user', content: caseDef.message }],
      metadata: { skipUserContext: true },
    }),
  });

  const data = body?.data || body;
  const { failures, notes, content } = evaluate(caseDef, data, ok);
  return {
    id: caseDef.id,
    category: caseDef.category,
    pass: failures.length === 0,
    failures,
    notes,
    ms: Date.now() - started,
    hasLiveData: data?.hasLiveData,
    hasWebSearch: data?.hasWebSearch,
    provider: data?.provider,
    contentLength: content.length,
    excerpt: content.slice(0, 280).replace(/\s+/g, ' '),
    fullContent: content,
  };
}

async function main() {
  console.log(`Trailie accuracy suite → ${API_BASE}/ai/chat-anonymous\n`);
  const results = [];
  for (const c of CASES) {
    process.stdout.write(`Running ${c.id}... `);
    try {
      const result = await runCase(c);
      results.push(result);
      console.log(result.pass ? 'PASS' : 'FAIL');
    } catch (err) {
      results.push({
        id: c.id,
        category: c.category,
        pass: false,
        failures: [err.message],
        notes: [],
        ms: 0,
      });
      console.log('ERROR');
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    const flag = r.pass ? '✓' : '✗';
    console.log(
      `${flag} [${r.category}] ${r.id.padEnd(32)} live=${r.hasLiveData ? 'Y' : 'n'} ${(r.ms / 1000).toFixed(1)}s ${r.failures?.length ? '· ' + r.failures.join('; ') : ''}`
    );
    if (r.excerpt) console.log(`    ${r.excerpt}...`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);

  if (process.argv.includes('--verbose')) {
    console.log('\n=== FULL RESPONSES ===');
    for (const r of results) {
      console.log(`\n--- ${r.id} ---\n${r.fullContent || '(no content)'}\n`);
    }
  }

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
