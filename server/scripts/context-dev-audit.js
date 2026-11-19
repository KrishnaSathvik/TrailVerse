#!/usr/bin/env node
'use strict';

/**
 * Context.dev evaluation harness. Writes a Markdown report; changes nothing.
 *
 *   node scripts/context-dev-audit.js reader [--direct] [--extract] [--out <file>]
 *   node scripts/context-dev-audit.js search [--out <file>]
 *
 * reader  — for each official page/PDF, compare what Trailie's deterministic
 *           extractors (vehicle limits, park-wide rules) find in:
 *             A) the current reader: axios + regex strip + 8000-char cut
 *                (--direct fetches with axios; otherwise the same strip is
 *                applied to Context.dev's rendered HTML, for sandboxes that
 *                cannot reach nps.gov)
 *             B) the Context.dev reader: main-content Markdown, PDFs parsed
 *           --extract also asks Context.dev's JSON extraction for the vehicle
 *           limit on vehicle pages (+4 credits each) as a CROSS-CHECK on the
 *           parser — a disagreement is a parser backlog item, never a fact.
 *
 * search  — run the same Trailie discovery queries through Context.dev and,
 *           when their keys are set, Brave and Tavily. Scores official-host
 *           hits, whether a returned passage/snippet contains the topic's key
 *           terms, latency and credits.
 *
 * Credits (docs.context.dev account/credits): scrape 1, JSON +4, search
 * 1 per 10 results (+1 per 10 with highlights).
 */

const fs = require('fs');
const path = require('path');
const client = require('../src/services/contextDev/contextDevClient');
const { officialPageOperationalFacts } = require('../src/utils/operationalFactExtraction');
const { officialPageParkRules } = require('../src/utils/parkWideAccess');
const { buildPublicWebQuery } = require('../src/services/webEvidencePolicyService');

const AXIOS_TEXT_LIMIT = 8000;

const READER_PAGES = Object.freeze([
  // [parkCode, parkName, url, kind]
  ['glac', 'Glacier National Park', 'https://www.nps.gov/glac/planyourvisit/directions.htm', 'vehicle'],
  ['glac', 'Glacier National Park', 'https://www.nps.gov/glac/planyourvisit/gtsrinfo.htm', 'vehicle'],
  ['zion', 'Zion National Park', 'https://www.nps.gov/zion/planyourvisit/directions.htm', 'vehicle'],
  ['zion', 'Zion National Park', 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm', 'rules'],
  ['zion', 'Zion National Park', 'https://www.nps.gov/zion/planyourvisit/hours.htm', 'rules'],
  ['arch', 'Arches National Park', 'https://www.nps.gov/arch/planyourvisit/index.htm', 'rules'],
  ['arch', 'Arches National Park', 'https://www.nps.gov/arch/planyourvisit/directions.htm', 'vehicle'],
  ['romo', 'Rocky Mountain National Park', 'https://www.nps.gov/romo/planyourvisit/timed-entry-permit-system.htm', 'rules'],
  ['romo', 'Rocky Mountain National Park', 'https://www.nps.gov/romo/planyourvisit/trail_ridge_road.htm', 'vehicle'],
  ['yose', 'Yosemite National Park', 'https://www.nps.gov/yose/planyourvisit/conditions.htm', 'rules'],
  ['yose', 'Yosemite National Park', 'https://www.nps.gov/yose/planyourvisit/tioga.htm', 'rules'],
  ['yose', 'Yosemite National Park', 'https://www.nps.gov/yose/planyourvisit/upload/Yosemite-Guide-51-8-508V1.pdf', 'pdf'],
  ['grca', 'Grand Canyon National Park', 'https://www.nps.gov/grca/planyourvisit/conditions.htm', 'rules'],
  ['grca', 'Grand Canyon National Park', 'https://www.nps.gov/grca/planyourvisit/hermit-road.htm', 'vehicle'],
  ['yell', 'Yellowstone National Park', 'https://www.nps.gov/yell/planyourvisit/parkroads.htm', 'rules'],
  ['grsm', 'Great Smoky Mountains National Park', 'https://www.nps.gov/grsm/planyourvisit/cadescove.htm', 'vehicle'],
  ['grsm', 'Great Smoky Mountains National Park', 'https://www.nps.gov/grsm/planyourvisit/fees.htm', 'rules'],
  ['mora', 'Mount Rainier National Park', 'https://www.nps.gov/mora/planyourvisit/road-status.htm', 'rules'],
  ['acad', 'Acadia National Park', 'https://www.nps.gov/acad/planyourvisit/vehicle_reservations.htm', 'rules'],
  ['acad', 'Acadia National Park', 'https://www.nps.gov/acad/planyourvisit/directions.htm', 'vehicle'],
  ['grte', 'Grand Teton National Park', 'https://www.nps.gov/grte/planyourvisit/conditions.htm', 'rules'],
  ['jotr', 'Joshua Tree National Park', 'https://www.nps.gov/jotr/planyourvisit/conditions.htm', 'rules'],
  ['brca', 'Bryce Canyon National Park', 'https://www.nps.gov/brca/planyourvisit/shuttle.htm', 'rules'],
  ['brca', 'Bryce Canyon National Park', 'https://www.nps.gov/brca/planyourvisit/directions.htm', 'vehicle'],
  ['shen', 'Shenandoah National Park', 'https://www.nps.gov/shen/planyourvisit/directions.htm', 'vehicle'],
  ['dena', 'Denali National Park & Preserve', 'https://www.nps.gov/dena/planyourvisit/road-lottery.htm', 'rules'],
  ['dena', 'Denali National Park & Preserve', 'https://www.nps.gov/dena/planyourvisit/shuttles.htm', 'rules'],
  ['hale', 'Haleakalā National Park', 'https://www.nps.gov/hale/planyourvisit/sunrise.htm', 'rules'],
  ['glba', 'Glacier Bay National Park & Preserve', 'https://www.nps.gov/glba/learn/news/upload/2026-Fairweather-Newspaper-508c-web-1.pdf', 'pdf'],
  ['crla', 'Crater Lake National Park', 'https://www.nps.gov/crla/planyourvisit/directions.htm', 'vehicle'],
]);

const SEARCH_CASES = Object.freeze([
  // [parkCode, displayName, topic, keyTerms (any must appear in a passage)]
  ['glac', 'Glacier National Park', 'vehicle_restrictions', ['21 feet', '21 ft', 'vehicle', 'length']],
  ['zion', 'Zion National Park', 'transit', ['shuttle']],
  ['zion', 'Zion National Park', 'vehicle_restrictions', ['tunnel', 'escort', 'oversize']],
  ['arch', 'Arches National Park', 'permits_reservations', ['timed', 'reservation']],
  ['romo', 'Rocky Mountain National Park', 'permits_reservations', ['timed', 'permit', 'reservation']],
  ['yose', 'Yosemite National Park', 'roads', ['road', 'closed', 'open', 'chain']],
  ['yose', 'Yosemite National Park', 'alerts_closures', ['closure', 'closed', 'alert']],
  ['grca', 'Grand Canyon National Park', 'transit', ['shuttle', 'bus']],
  ['yell', 'Yellowstone National Park', 'roads', ['road', 'open', 'closed']],
  ['acad', 'Acadia National Park', 'permits_reservations', ['reservation', 'cadillac']],
  ['mora', 'Mount Rainier National Park', 'permits_reservations', ['timed', 'reservation']],
  ['grsm', 'Great Smoky Mountains National Park', 'parking', ['parking', 'tag']],
  ['dena', 'Denali National Park & Preserve', 'transit', ['bus', 'transit']],
  ['jotr', 'Joshua Tree National Park', 'alerts_closures', ['closure', 'closed', 'alert']],
  ['brca', 'Bryce Canyon National Park', 'transit', ['shuttle']],
  ['hale', 'Haleakalā National Park', 'permits_reservations', ['sunrise', 'reservation']],
  ['shen', 'Shenandoah National Park', 'overview', ['skyline']],
  ['olym', 'Olympic National Park', 'activities', ['trail', 'hike']],
  ['grte', 'Grand Teton National Park', 'accessibility', ['accessib', 'wheelchair']],
  ['crla', 'Crater Lake National Park', 'roads', ['rim drive', 'road']],
]);

const OFFICIAL_ONLY_TOPICS = new Set(['transit', 'parking', 'permits_reservations', 'vehicle_restrictions']);

function arg(name) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
}

function regexStrip(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAll(text, { code, name, url, title }) {
  const vehicle = officialPageOperationalFacts({ title, text, url, parkCode: code });
  const rules = officialPageParkRules({ title, text, url, parkCode: code, parkName: name });
  return {
    vehicle: vehicle.map((fact) => `${fact.subject?.name}: ≤${fact.dimension?.maxLengthFeet} ft`),
    rules: rules.map((rule) => rule.type || rule.kind || rule.rule || 'rule'),
  };
}

async function timed(fn) {
  const started = Date.now();
  try { return { value: await fn(), ms: Date.now() - started }; } catch (error) {
    const code = error?.response?.status ? `HTTP ${error.response.status}` : (error?.upstreamCode || error?.code || error?.message || 'error');
    return { error: code, notFound: /NOT_FOUND|HTTP 404/.test(code), ms: Date.now() - started };
  }
}

async function currentReader(url, direct) {
  if (direct) {
    const axios = require('axios');
    const response = await axios.get(url, { timeout: 7000, maxContentLength: 512000, responseType: 'text' });
    const html = String(response.data || '');
    return { title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() || null, text: regexStrip(html), credits: 0, emulated: false };
  }
  const data = await client.contextDevRequest('POST', '/web/scrape', { timeoutMs: 60000, body: { url, formats: { html: true }, maxAgeMs: 86400000 } });
  if (!data?.html?.success) throw Object.assign(new Error('html unavailable'), { code: data?.html?.error_code || 'html_failed' });
  return { title: data?.metadata?.title || null, text: regexStrip(data.html.data), credits: data?.key_metadata?.credits_consumed ?? null, emulated: true };
}

const VEHICLE_SCHEMA = {
  type: 'object',
  properties: {
    maxVehicleLengthFeet: { type: ['number', 'null'], description: 'Maximum vehicle (or vehicle combination) length in feet that this page says is allowed on a named road, or null if the page states none.' },
    roadName: { type: ['string', 'null'] },
  },
};

async function runReader() {
  const direct = process.argv.includes('--direct');
  const extract = process.argv.includes('--extract');
  const rows = [];
  let credits = 0;
  for (const [code, name, url, kind] of READER_PAGES) {
    const meta = { code, name, url };
    const before = kind === 'pdf' ? { value: null, ms: 0, error: 'n/a (axios reader cannot parse PDF)' } : await timed(() => currentReader(url, direct));
    const after = await timed(() => client.scrapePage(url, { timeoutMs: 60000 }));
    const row = { code, kind, url, before: null, after: null, check: null };
    if (before.value) {
      credits += before.value.credits || 0;
      const kept = before.value.text.slice(0, AXIOS_TEXT_LIMIT);
      row.before = { ms: before.ms, totalChars: before.value.text.length, ...extractAll(kept, { ...meta, title: before.value.title }), emulated: before.value.emulated };
    } else row.before = { error: before.error };
    if (after.value) {
      credits += after.value.creditsUsed || 0;
      row.after = { ms: after.ms, chars: after.value.text.length, cache: after.value.cacheStatus, ...extractAll(after.value.text.slice(0, 40000), { ...meta, title: after.value.title }) };
    } else row.after = { error: after.error, notFound: after.notFound };
    if (extract && kind === 'vehicle' && after.value) {
      const checked = await timed(() => client.extractJson(url, VEHICLE_SCHEMA, { instructions: 'Only report a limit the page states explicitly.' }));
      if (checked.value) { credits += checked.value.creditsUsed || 0; row.check = checked.value.data; } else row.check = { error: checked.error };
    }
    rows.push(row);
    process.stderr.write(`${row.after?.error ? '✗' : '✓'} ${url}\n`);
  }

  const fmt = (side) => side?.error ? `error: ${side.error}` : `${side.vehicle.length ? side.vehicle.join('; ') : '—'} / rules ${side.rules.length}`;
  const wins = rows.filter((r) => !r.after?.error && ((r.after.vehicle.length > (r.before?.vehicle?.length || 0)) || (r.after.rules.length > (r.before?.rules?.length || 0))));
  const losses = rows.filter((r) => !r.after?.error && !r.before?.error && ((r.after.vehicle.length < r.before.vehicle.length) || (r.after.rules.length < r.before.rules.length)));
  const afterMs = rows.filter((r) => r.after?.ms && !r.after.error).map((r) => r.after.ms).sort((a, b) => a - b);
  const lines = [
    `# Context.dev official-page reader audit — ${new Date().toISOString().slice(0, 10)}`, '',
    `Pages: ${rows.length}. Current reader ${direct ? 'fetched directly with axios' : 'emulated: same regex strip + 8000-char cut, applied to Context.dev-rendered HTML (nps.gov not reachable from the audit host)'}.`,
    `Context.dev reader: main-content Markdown (PDFs parsed), 40,000-char cap. Credits used by this audit: ${credits}.`, '',
    `- Pages where Context.dev lets the extractors find MORE facts: **${wins.length}**`,
    `- Pages where it finds FEWER: **${losses.length}**`,
    `- Context.dev failures: **${rows.filter((r) => r.after?.error && !r.after.notFound).length}** (plus ${rows.filter((r) => r.after?.notFound).length} page(s) that no longer exist on nps.gov — not a reader failure)`,
    `- Context.dev latency: median ${afterMs[Math.floor(afterMs.length / 2)] ?? '—'} ms, p90 ${afterMs[Math.floor(afterMs.length * 0.9)] ?? '—'} ms`, '',
    '| Park | Kind | Page | Current reader (vehicle / park rules) | Context.dev (vehicle / park rules) | Chars kept → read | ms (CD) |' + (extract ? ' JSON cross-check |' : ''),
    '|---|---|---|---|---|---|---|' + (extract ? '---|' : ''),
    ...rows.map((r) => `| ${r.code} | ${r.kind} | ${r.url.replace('https://www.nps.gov', '')} | ${fmt(r.before)} | ${fmt(r.after)} | ${r.before?.totalChars ? `${Math.min(r.before.totalChars, AXIOS_TEXT_LIMIT)}/${r.before.totalChars}` : '—'} → ${r.after?.chars ?? '—'} | ${r.after?.ms ?? '—'} |`
      + (extract ? ` ${r.check ? (r.check.error ? `error ${r.check.error}` : `${r.check.maxVehicleLengthFeet ?? 'none'} ${r.check.roadName ? `(${r.check.roadName})` : ''}`) : ''} |` : '')),
  ];
  return lines.join('\n');
}

async function braveSearch(query, topic) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const axios = require('axios');
  const q = OFFICIAL_ONLY_TOPICS.has(topic) ? `${query} (site:nps.gov OR site:recreation.gov)` : query;
  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', { headers: { 'X-Subscription-Token': key, Accept: 'application/json' }, params: { q, count: 5 }, timeout: 7000 });
  return (response.data?.web?.results || []).map((r) => ({ url: r.url, text: `${r.title || ''} ${r.description || ''}` }));
}

async function tavilySearch(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const axios = require('axios');
  const response = await axios.post('https://api.tavily.com/search', { api_key: key, query, max_results: 5, search_depth: 'basic', include_answer: false }, { timeout: 7000 });
  return (response.data?.results || []).map((r) => ({ url: r.url, text: `${r.title || ''} ${r.content || ''}` }));
}

async function contextDevSearch(query, topic) {
  const response = await client.searchWeb({ query, numResults: 5, includeDomains: OFFICIAL_ONLY_TOPICS.has(topic) ? ['nps.gov', 'recreation.gov'] : undefined, highlights: true }, { timeoutMs: 30000 });
  return { results: response.results.map((r) => ({ url: r.url, text: `${r.title || ''} ${r.description || ''} ${(r.highlights || []).join(' ')}` })), credits: response.creditsUsed };
}

function score(results, code, terms) {
  if (!results) return null;
  const official = results.filter((r) => /(^|\.)(nps|recreation)\.gov$/i.test(new URL(r.url).hostname));
  const ownPark = official.filter((r) => new RegExp(`nps\\.gov/${code}(/|$)`, 'i').test(r.url));
  const termHit = results.some((r) => terms.some((t) => r.text.toLowerCase().includes(t.toLowerCase())));
  return { n: results.length, official: official.length, ownPark: ownPark.length, topOwn: ownPark.length > 0 && results[0] === ownPark[0], termHit };
}

async function runSearch() {
  const providers = [['context_dev', contextDevSearch], ['brave', braveSearch], ['tavily', tavilySearch]];
  const rows = [];
  let credits = 0;
  for (const [code, displayName, topic, terms] of SEARCH_CASES) {
    const query = buildPublicWebQuery({ entity: { entityId: `nps:park:${code}`, displayName }, topic });
    const row = { code, topic, query, by: {} };
    for (const [id, fn] of providers) {
      const result = await timed(() => fn(query, topic));
      if (result.error) { row.by[id] = { error: result.error, ms: result.ms }; continue; }
      if (result.value == null) continue; // provider key not set
      const list = Array.isArray(result.value) ? result.value : result.value.results;
      if (!Array.isArray(result.value)) credits += result.value.credits || 0;
      row.by[id] = { ...score(list, code, terms), ms: result.ms };
    }
    rows.push(row);
    process.stderr.write(`• ${code} ${topic}\n`);
  }
  const ids = providers.map(([id]) => id).filter((id) => rows.some((r) => r.by[id]));
  const summary = ids.map((id) => {
    const ok = rows.map((r) => r.by[id]).filter((x) => x && !x.error);
    const ms = ok.map((x) => x.ms).sort((a, b) => a - b);
    return `| ${id} | ${ok.length}/${rows.length} | ${ok.filter((x) => x.ownPark > 0).length} | ${ok.filter((x) => x.topOwn).length} | ${ok.filter((x) => x.termHit).length} | ${ms[Math.floor(ms.length / 2)] ?? '—'} |`;
  });
  const cell = (x) => !x ? '—' : x.error ? `error ${x.error}` : `${x.ownPark}/${x.n} own-park${x.topOwn ? ' (top)' : ''}, terms ${x.termHit ? '✓' : '✗'}, ${x.ms} ms`;
  return [
    `# Context.dev search comparison — ${new Date().toISOString().slice(0, 10)}`, '',
    `Queries are Trailie's own discovery queries (buildPublicWebQuery). Providers without a key in this environment are omitted. Context.dev credits used: ${credits}.`, '',
    '| Provider | Answered | Own-park official hit | Own-park page ranked #1 | Key terms in snippet/passage | Median ms |',
    '|---|---|---|---|---|---|',
    ...summary, '',
    `| Park | Topic | ${ids.join(' | ')} |`,
    `|---|---|${ids.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.code} | ${r.topic} | ${ids.map((id) => cell(r.by[id])).join(' | ')} |`),
  ].join('\n');
}

async function main() {
  if (!client.isContextDevConfigured()) throw new Error('Set CONTEXT_DEV_API_KEY first.');
  const command = process.argv[2];
  const run = { reader: runReader, search: runSearch }[command];
  if (!run) throw new Error('Usage: context-dev-audit.js <reader|search> [--direct] [--extract] [--out file]');
  const report = await run();
  const out = arg('--out');
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${report}\n`);
    console.log(`wrote ${out}`);
  } else console.log(report);
}

if (require.main === module) {
  main().catch((error) => { console.error(error?.response?.data || error.message); process.exit(1); });
}

module.exports = { READER_PAGES, SEARCH_CASES, regexStrip };
