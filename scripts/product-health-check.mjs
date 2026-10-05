#!/usr/bin/env node
/**
 * Product-route health check. Does not deploy.
 *
 *   API_BASE=http://127.0.0.1:5001 \
 *   FRONTEND_BASE=http://127.0.0.1:3000 \
 *   node scripts/product-health-check.mjs
 */

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:5001').replace(/\/$/, '');
const FRONTEND_BASE = (process.env.FRONTEND_BASE || '').replace(/\/$/, '');

const FRONTEND_ROUTES = [
  '/',
  '/explore',
  '/map',
  '/compare',
  '/plan-ai',
  '/reports/when-to-go.html',
  '/parks/yellowstone-national-park',
  '/parks/state/utah',
  '/sitemap.xml',
  '/where-next',
];

async function fetchStatus(url) {
  const res = await fetch(url, { redirect: 'manual' });
  return { url, status: res.status, ok: res.status >= 200 && res.status < 400 };
}

async function checkApi() {
  const results = [];
  const ping = await fetchStatus(`${API_BASE}/health/ping`);
  results.push(ping);

  const product = await fetch(`${API_BASE}/health/product`);
  const body = await product.json().catch(() => ({}));
  results.push({
    url: `${API_BASE}/health/product`,
    status: product.status,
    ok: product.ok && body.status === 'healthy',
    detail: body,
  });
  return results;
}

async function checkFrontend() {
  if (!FRONTEND_BASE) return [];
  const out = [];
  for (const path of FRONTEND_ROUTES) {
    out.push(await fetchStatus(`${FRONTEND_BASE}${path}`));
  }
  return out;
}

async function main() {
  const api = await checkApi();
  const frontend = await checkFrontend();
  const all = [...api, ...frontend];
  const failed = all.filter((row) => !row.ok);

  for (const row of all) {
    const mark = row.ok ? 'ok' : 'FAIL';
    console.log(`${mark} ${row.status} ${row.url}`);
  }

  if (failed.length) {
    console.error(`\n${failed.length} health check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll health checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
