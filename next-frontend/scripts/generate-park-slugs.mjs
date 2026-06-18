/**
 * Pre-build script: fetches the full park list ONCE from the backend,
 * extracts only parkCode + fullName, and writes a tiny JSON file.
 *
 * This avoids hitting the 5 MB response 470+ times during SSG
 * (which exceeds Vercel's 2 MB data-cache limit and triggers 429s).
 *
 * On rate limit or transient API failure, keeps the committed
 * src/data/park-slugs.json so CI/Vercel builds still succeed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://127.0.0.1:5001/api');

const OUT = fileURLToPath(new URL('../src/data/park-slugs.json', import.meta.url));

function loadExistingSlugs() {
  if (!existsSync(OUT)) return null;
  try {
    const parsed = JSON.parse(readFileSync(OUT, 'utf-8'));
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeSlugs(parks) {
  writeFileSync(OUT, JSON.stringify(parks), 'utf-8');
  console.log(
    `[prebuild] Wrote ${parks.length} parks to src/data/park-slugs.json (${(JSON.stringify(parks).length / 1024).toFixed(1)} KB)`
  );
}

function useExistingFallback(reason) {
  const existing = loadExistingSlugs();
  if (!existing) {
    throw new Error(`${reason} and no existing src/data/park-slugs.json to fall back to`);
  }
  console.warn(
    `[prebuild] ${reason} — using existing park-slugs.json (${existing.length} parks)`
  );
}

async function main() {
  console.log(`[prebuild] Fetching park list from ${API_BASE}/parks?all=true`);

  let res;
  try {
    res = await fetch(`${API_BASE}/parks?all=true`, {
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    useExistingFallback(`Parks API request failed (${err.message})`);
    return;
  }

  if (res.status === 429 || res.status >= 500) {
    useExistingFallback(`Parks API returned ${res.status}`);
    return;
  }

  if (!res.ok) {
    useExistingFallback(`Parks API returned ${res.status}`);
    return;
  }

  const json = await res.json();
  const parks = (json.data || []).map((p) => ({
    parkCode: p.parkCode,
    fullName: p.fullName,
    designation: p.designation || '',
  }));

  if (!parks.length) {
    useExistingFallback('Parks API returned an empty list');
    return;
  }

  writeSlugs(parks);
}

main().catch((err) => {
  console.error('[prebuild] Failed to generate park slugs:', err.message);
  process.exit(1);
});
