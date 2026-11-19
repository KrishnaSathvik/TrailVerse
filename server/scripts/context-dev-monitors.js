#!/usr/bin/env node
'use strict';

/**
 * Manage Context.dev page monitors on the official park pages whose content
 * changes operationally (roads, closures, shuttles, timed entry). A detected
 * change POSTs to /api/webhooks/context-dev, which invalidates the cached
 * evidence read from that page so the next Trailie turn re-reads it.
 *
 *   node scripts/context-dev-monitors.js limits
 *   node scripts/context-dev-monitors.js list
 *   node scripts/context-dev-monitors.js sync --webhook-url https://<api-host>/api/webhooks/context-dev [--dry-run]
 *   node scripts/context-dev-monitors.js remove-all
 *
 * Requires CONTEXT_DEV_API_KEY. `sync` creates monitors (tagged `trailverse`)
 * for pages in WATCHED_PAGES that are not yet monitored, up to the plan's
 * monitor limit (Free = 10). Each page run costs 1 credit (docs.context.dev
 * account/credits); a daily schedule × 10 pages ≈ 300 credits/month.
 *
 * Each monitor gets its OWN webhook signing secret. `sync` prints the
 * comma-separated list once — set it as CONTEXT_DEV_WEBHOOK_SECRETS on the API
 * server, and never commit or log it.
 */

const client = require('../src/services/contextDev/contextDevClient');

const TAG = 'trailverse';

// Highest-traffic parks × the page most likely to change a plan. Ordered by
// priority: `sync` stops at the plan's monitor limit.
const WATCHED_PAGES = Object.freeze([
  { name: 'Glacier — roads & Going-to-the-Sun', url: 'https://www.nps.gov/glac/planyourvisit/directions.htm' },
  { name: 'Yosemite — conditions', url: 'https://www.nps.gov/yose/planyourvisit/conditions.htm' },
  { name: 'Zion — shuttle system', url: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm' },
  { name: 'Rocky Mountain — timed entry', url: 'https://www.nps.gov/romo/planyourvisit/timed-entry-permit-system.htm' },
  { name: 'Arches — plan your visit', url: 'https://www.nps.gov/arch/planyourvisit/index.htm' },
  { name: 'Grand Canyon — conditions', url: 'https://www.nps.gov/grca/planyourvisit/conditions.htm' },
  { name: 'Yellowstone — park roads', url: 'https://www.nps.gov/yell/planyourvisit/parkroads.htm' },
  { name: 'Great Smoky Mountains — seasonal roads', url: 'https://www.nps.gov/grsm/planyourvisit/seasonalroads.htm' },
  { name: 'Mount Rainier — road status', url: 'https://www.nps.gov/mora/planyourvisit/road-status.htm' },
  { name: 'Acadia — vehicle reservations', url: 'https://www.nps.gov/acad/planyourvisit/vehicle_reservations.htm' },
  { name: 'Grand Teton — road conditions', url: 'https://www.nps.gov/grte/planyourvisit/conditions.htm' },
  { name: 'Joshua Tree — conditions', url: 'https://www.nps.gov/jotr/planyourvisit/conditions.htm' },
]);

const MONITOR_DEFAULTS = Object.freeze({
  mode: 'web',
  // Visible-text diff of the main content; nav/footer churn is ignored.
  change_detection: { type: 'exact' },
  schedule: { type: 'interval', frequency: 1, unit: 'days' },
});

function arg(name) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
}

async function allTrailverseMonitors() {
  const out = [];
  let cursor;
  do {
    const page = await client.listMonitors({ tag: TAG, limit: 100, ...(cursor ? { cursor } : {}) });
    out.push(...(page?.data || []));
    cursor = page?.next_cursor || null;
  } while (cursor);
  return out;
}

async function cmdLimits() {
  console.log(JSON.stringify(await client.getMonitorLimits(), null, 2));
}

async function cmdList() {
  for (const monitor of await allTrailverseMonitors()) {
    console.log(`${monitor.id}  ${monitor.status.padEnd(7)} ${monitor.target?.url}  last_change=${monitor.last_change_at || '-'}`);
  }
}

async function cmdSync() {
  const webhookUrl = arg('--webhook-url');
  const dryRun = process.argv.includes('--dry-run');
  if (!webhookUrl || !/^https:\/\//.test(webhookUrl)) {
    throw new Error('sync needs --webhook-url https://<api-host>/api/webhooks/context-dev');
  }
  const existing = await allTrailverseMonitors();
  const watched = new Set(existing.map((monitor) => monitor.target?.url));
  const limits = await client.getMonitorLimits();
  let room = Math.max(0, (limits.monitors_limit ?? 0) - (limits.monitors_used ?? 0));
  const secrets = [];
  for (const page of WATCHED_PAGES) {
    if (watched.has(page.url)) continue;
    if (room <= 0) { console.log(`limit reached (${limits.plan}): skipping ${page.url}`); continue; }
    if (dryRun) { console.log(`[dry-run] would monitor ${page.url}`); room -= 1; continue; }
    const monitor = await client.createMonitor({
      ...MONITOR_DEFAULTS,
      name: `TrailVerse: ${page.name}`,
      target: { type: 'page', url: page.url },
      webhook: { url: webhookUrl, events: ['change.detected'], retry: {} },
      tags: [TAG],
    });
    room -= 1;
    console.log(`created ${monitor.id}  ${page.url}`);
    if (monitor?.webhook?.secret) secrets.push(monitor.webhook.secret);
  }
  if (secrets.length) {
    console.log('\nNew webhook signing secrets — append to CONTEXT_DEV_WEBHOOK_SECRETS (comma-separated) on the API server, then clear this terminal:');
    console.log(secrets.join(','));
  } else if (!dryRun) {
    console.log('No new monitors created.');
  }
}

async function cmdRemoveAll() {
  for (const monitor of await allTrailverseMonitors()) {
    await client.deleteMonitor(monitor.id);
    console.log(`deleted ${monitor.id}  ${monitor.target?.url}`);
  }
}

async function main() {
  if (!client.isContextDevConfigured()) throw new Error('Set CONTEXT_DEV_API_KEY first.');
  const command = process.argv[2];
  const commands = { limits: cmdLimits, list: cmdList, sync: cmdSync, 'remove-all': cmdRemoveAll };
  if (!commands[command]) throw new Error(`Usage: context-dev-monitors.js <${Object.keys(commands).join('|')}>`);
  await commands[command]();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.response?.data || error.message);
    process.exit(1);
  });
}

module.exports = { WATCHED_PAGES, MONITOR_DEFAULTS };
