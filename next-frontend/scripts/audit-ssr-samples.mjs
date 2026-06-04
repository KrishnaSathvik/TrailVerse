#!/usr/bin/env node
/**
 * Route-tier SSR audit for TrailVerse sample URLs.
 *
 * Measures first-response HTML (curl / View Source), not post-hydration UI.
 *
 * Usage:
 *   node scripts/audit-ssr-samples.mjs
 *   BASE_URL=http://127.0.0.1:3000 node scripts/audit-ssr-samples.mjs
 *   node scripts/audit-ssr-samples.mjs --strict
 *   node scripts/audit-ssr-samples.mjs --json
 *
 * See docs/ssr-route-audit.md
 */

const BASE_URL = (process.env.BASE_URL || 'https://www.nationalparksexplorerusa.com').replace(
  /\/$/,
  ''
);
const USER_AGENT = process.env.AUDIT_USER_AGENT || 'TrailVerse-SSR-Audit/1.0';
const FETCH_TIMEOUT_MS = Number(process.env.AUDIT_TIMEOUT_MS || 60_000);

const ARGS = new Set(process.argv.slice(2));
const JSON_OUT = ARGS.has('--json');
const STRICT = ARGS.has('--strict');

/**
 * Lightweight production SEO regression suite (17 routes).
 * --strict fails only when a route scores below its own tier expectation.
 * /map and /plan-ai are expected client-app routes (loader shell is OK).
 */
const SAMPLES = [
  {
    id: 'T1-about',
    tier: '1',
    path: '/about',
    expect: 'strong',
    titleIncludes: 'About Krishna',
    h1Includes: "Hey, I'm Krishna",
    bodyAny: ['TrailVerse', 'national parks'],
  },
  {
    id: 'T1-guides',
    tier: '1',
    path: '/guides',
    expect: 'strong',
    titleIncludes: 'Planning Guides',
    h1Includes: 'National Park Planning Guides',
    bodyAny: ['Parks by vibe', 'planning'],
  },
  {
    id: 'T1-chatgpt',
    tier: '1',
    path: '/chatgpt',
    expect: 'strong',
    titleIncludes: 'ChatGPT',
    h1Includes: 'TrailVerse for ChatGPT',
    bodyAny: ['ChatGPT', '470', 'plan'],
  },
  {
    id: 'T1-mcp',
    tier: '1',
    path: '/mcp',
    expect: 'strong',
    titleIncludes: 'Claude',
    h1Includes: 'TrailVerse for Claude',
    bodyAny: ['MCP', 'Claude', '470'],
  },
  {
    id: 'T1-privacy',
    tier: '1',
    path: '/privacy',
    expect: 'strong',
    titleIncludes: 'Privacy Policy',
    h1Includes: 'Privacy Policy',
    bodyAny: ['Information We Collect', 'cookies', 'trailverseteam@gmail.com'],
    bodyMinMatches: 2,
    forbidBody: ['BETA'],
  },
  {
    id: 'T1-testimonials',
    tier: '1',
    path: '/testimonials',
    expect: 'strong',
    titleIncludes: 'Reviews',
    h1Includes: 'What travelers are saying',
    bodyAny: ['travelers', 'review', 'TrailVerse'],
    bodyMinMatches: 2,
    forbidBody: ['BETA', 'enable JavaScript'],
  },
  {
    id: 'T1-magazine',
    tier: '1',
    path: '/magazine',
    expect: 'strong',
    titleIncludes: 'Magazine',
    h1Includes: 'TrailVerse Magazine',
    bodyAny: ['470', 'national parks', 'Spring 2026'],
    bodyMinMatches: 2,
    forbidBody: ['BETA'],
  },
  {
    id: 'T2-blog-index',
    tier: '2',
    path: '/blog',
    expect: 'hybrid',
    titleIncludes: 'Blog',
    h1Includes: 'Travel Journal',
    bodyAny: ['Featured', 'Posts', 'Blog'],
  },
  {
    id: 'T2-blog-post',
    tier: '2',
    path: '/blog/yellowstone-national-park-the-complete-2026-visitor-guide',
    expect: 'hybrid',
    titleIncludes: 'Yellowstone',
    h1Includes: 'Yellowstone',
    bodyAny: ['2026', 'park'],
  },
  {
    id: 'T2-explore',
    tier: '2',
    path: '/explore',
    expect: 'hybrid-thin',
    titleIncludes: 'Explore',
    h1Optional: true,
    canonicalOptional: true,
    bodyAny: ['Yellowstone', 'Grand Canyon', 'National Park'],
    bodyMinMatches: 2,
    minBytes: 50_000,
  },
  {
    id: 'T2-park',
    tier: '2',
    path: '/parks/yellowstone-national-park',
    expect: 'hybrid',
    titleIncludes: 'Yellowstone National Park',
    h1Optional: true,
    bodyAny: ['Yellowstone National Park', 'Overview', 'Alerts'],
    bodyMinMatches: 1,
  },
  {
    id: 'T2-discover',
    tier: '2',
    path: '/discover',
    expect: 'hybrid',
    titleIncludes: 'Explore Parks',
    h1Optional: true,
    bodyAny: ['activity', 'state', 'topic', 'park'],
    bodyMinMatches: 2,
  },
  {
    id: 'T2-discover-activity',
    tier: '2',
    path: '/discover/activity/hiking',
    expect: 'hybrid',
    titleIncludes: 'Hiking',
    h1Includes: 'Hiking',
    bodyAny: ['hiking', 'park', 'trail'],
    bodyMinMatches: 2,
  },
  {
    id: 'T2-intent-couples',
    tier: '2',
    path: '/parks-for-couples',
    expect: 'hybrid',
    titleIncludes: 'Couples',
    h1Includes: 'Best National Parks for Couples',
    bodyAny: ['couples', 'standouts', '470'],
    bodyMinMatches: 2,
  },
  {
    id: 'T3-map',
    tier: '3',
    path: '/map',
    expect: 'client-app',
    titleIncludes: 'Interactive National Parks Map',
    h1Optional: true,
    bodyAny: ['Interactive National Parks Map'],
    forbidLoaders: ['Loading map'],
    maxBytes: 120_000,
  },
  {
    id: 'T3-plan-ai',
    tier: '3',
    path: '/plan-ai',
    expect: 'client-app',
    titleIncludes: 'Trailie',
    h1Includes: 'Trailie',
    bodyAny: ['470', 'national parks', 'itinerar'],
    forbidLoaders: ['Loading trip planner'],
    maxBytes: 120_000,
  },
  {
    id: 'static-report',
    tier: 'static',
    path: '/reports/when-to-go',
    expect: 'static',
    titleIncludes: 'Crowd Calendar',
    h1Includes: 'When to go',
    bodyAny: ['crowd', 'month', 'park'],
  },
];

const SCORE_RANK = {
  static: 5,
  strong: 4,
  hybrid: 3,
  'hybrid-thin': 2,
  'client-app': 1,
  fail: 0,
};

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripScriptsAndStyles(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function extractVisibleText(html) {
  const stripped = stripScriptsAndStyles(html);
  const text = stripped.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

function extractTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '').trim()));
  }
  return matches;
}

function pickMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function pickCanonical(html) {
  const link = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (link) return link[1];
  const og = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1];
  // May only appear in streamed metadata
  const streamed = html.match(/"canonical"[^}]*"href":"([^"]+)"/);
  return streamed ? streamed[1] : null;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, bytes: Buffer.byteLength(html, 'utf8') };
  } finally {
    clearTimeout(timer);
  }
}

function countBodyMatches(visible, keywords) {
  const lower = visible.toLowerCase();
  return keywords.filter((k) => lower.includes(k.toLowerCase())).length;
}

function gradeSample(sample, payload) {
  const { html, bytes, ok, status } = payload;
  const visible = extractVisibleText(html);
  const titles = extractTag(html, 'title');
  const h1s = extractTag(html, 'h1');
  const title = titles[0] || '';
  const metaDescription =
    pickMeta(html, 'description') || pickMeta(html, 'og:description') || '';
  const canonical = pickCanonical(html);
  const hasBailout = html.includes('BAILOUT_TO_CLIENT_SIDE_RENDERING');
  const hasRsc = html.includes('self.__next_f');

  const checks = {
    fetch: ok,
    title: sample.titleIncludes ? title.includes(sample.titleIncludes) : Boolean(title),
    meta: metaDescription.length > 20,
    canonical: sample.canonicalOptional ? true : Boolean(canonical),
    h1:
      sample.h1Optional && !sample.h1Includes
        ? true
        : sample.h1Includes
          ? h1s.some((h) => h.includes(sample.h1Includes))
          : h1s.length > 0,
    body: true,
    bailout: hasBailout,
    rsc: hasRsc,
    loaders: true,
    bytes: true,
  };

  if (sample.bodyAny?.length) {
    const min = sample.bodyMinMatches ?? 1;
    const visibleMatches = countBodyMatches(visible, sample.bodyAny);
    // Tier 2 thin: park names often live in RSC payload, not clean semantic HTML
    const rawMatches =
      sample.expect === 'hybrid-thin' ? countBodyMatches(html, sample.bodyAny) : 0;
    checks.body = Math.max(visibleMatches, rawMatches) >= min;
  }

  if (sample.forbidBody?.length) {
    const lower = visible.toLowerCase();
    const hasForbidden = sample.forbidBody.some((s) => lower.includes(s.toLowerCase()));
    if (hasForbidden) checks.body = false;
  }

  if (sample.forbidLoaders?.length) {
    const lower = visible.toLowerCase();
    const hasLoader = sample.forbidLoaders.some((s) => lower.includes(s.toLowerCase()));
    checks.loaders = !hasLoader;
    if (hasLoader && sample.expect === 'client-app') {
      checks.body = sample.bodyAny
        ? countBodyMatches(visible, sample.bodyAny) >= (sample.bodyMinMatches ?? 1)
        : false;
    }
  }

  if (sample.minBytes != null) checks.bytes = bytes >= sample.minBytes;
  if (sample.maxBytes != null) checks.bytes = checks.bytes && bytes <= sample.maxBytes;

  let score = sample.expect;
  if (!checks.fetch || !checks.title || !checks.meta) {
    score = 'fail';
  } else if (sample.expect === 'strong' && (!checks.h1 || !checks.body)) {
    score = 'hybrid';
  } else if (sample.expect === 'hybrid' && (!checks.body || (!checks.h1 && !sample.h1Optional))) {
    score = checks.body ? 'hybrid-thin' : 'fail';
  } else if (sample.expect === 'hybrid-thin') {
    if (!checks.title || !checks.meta) score = 'fail';
    else if (!checks.body) score = 'fail';
    else if (!checks.h1 && !checks.canonical) score = 'hybrid-thin';
    else score = 'hybrid-thin';
  } else if (sample.expect === 'client-app') {
    if (!checks.title || !checks.meta) score = 'fail';
    else if (!checks.body && !checks.loaders) score = 'hybrid-thin';
    else score = 'client-app';
  } else if (sample.expect === 'static') {
    if (!checks.h1 || !checks.body || hasRsc) score = 'hybrid';
  }

  return {
    id: sample.id,
    tier: sample.tier,
    path: sample.path,
    expect: sample.expect,
    score,
    status,
    bytes,
    checks,
    hasBailout,
    hasRsc: sample.tier === 'static' ? false : hasRsc,
    pass: SCORE_RANK[score] >= SCORE_RANK[sample.expect],
  };
}

function icon(ok) {
  return ok ? '✅' : '❌';
}

function warnIcon(value) {
  return value ? '⚠️' : '·';
}

function printTable(results) {
  const header =
    'URL'.padEnd(42) +
    'title meta h1 body bail rsc'.padEnd(28) +
    'score'.padEnd(14) +
    'tier';
  console.log(`\nSSR sample audit — ${BASE_URL}`);
  console.log(header);
  console.log('-'.repeat(header.length + 20));

  for (const r of results) {
    const url = r.path.padEnd(42);
    const flags =
      `${icon(r.checks.title)}    ${icon(r.checks.meta)}   ${r.checks.h1 ? icon(true) : warnIcon(true)}   ${r.checks.body ? icon(true) : warnIcon(true)}   ${warnIcon(r.hasBailout)}    ${r.hasRsc ? warnIcon(true) : '·'}`.padEnd(
        28
      );
    const score = `${r.score}${r.pass ? '' : ' FAIL'}`.padEnd(14);
    console.log(`${url}${flags}${score}${r.tier}`);
  }

  console.log('\nLegend: title/meta/h1/body = first HTML; bail/rsc = present (not always bad).');
  console.log('Tier 2 thin: body data may live in RSC stream — see docs/ssr-route-audit.md\n');
}

function printFailures(results) {
  const failed = results.filter((r) => !r.pass);
  if (failed.length === 0) {
    console.log('All samples met or exceeded expected SSR quality.');
    return;
  }
  console.log('Regressions (scored below expected tier):');
  for (const r of failed) {
    console.log(`  ${r.id} ${r.path}: expected ${r.expect}, got ${r.score} (HTTP ${r.status})`);
    const bad = Object.entries(r.checks)
      .filter(([, v]) => v === false)
      .map(([k]) => k);
    if (bad.length) console.log(`    failed checks: ${bad.join(', ')}`);
  }
}

async function main() {
  const results = [];

  for (const sample of SAMPLES) {
    const url = `${BASE_URL}${sample.path}`;
    let payload;
    try {
      payload = await fetchHtml(url);
    } catch {
      payload = { ok: false, status: 0, html: '', bytes: 0 };
    }
    results.push(gradeSample(sample, payload));
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
  } else {
    printTable(results);
    printFailures(results);
  }

  if (STRICT && results.some((r) => !r.pass)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
