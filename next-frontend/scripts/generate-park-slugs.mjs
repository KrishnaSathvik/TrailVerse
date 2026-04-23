/**
 * Pre-build script: fetches the full park list ONCE from the backend,
 * extracts only parkCode + fullName, and writes a tiny JSON file.
 *
 * This avoids hitting the 5 MB response 470+ times during SSG
 * (which exceeds Vercel's 2 MB data-cache limit and triggers 429s).
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

const OUT = new URL('../src/data/park-slugs.json', import.meta.url);

async function main() {
  console.log(`[prebuild] Fetching park list from ${API_BASE}/parks?all=true`);

  const res = await fetch(`${API_BASE}/parks?all=true`);
  if (!res.ok) throw new Error(`Parks API returned ${res.status}`);

  const json = await res.json();
  const parks = (json.data || []).map((p) => ({
    parkCode: p.parkCode,
    fullName: p.fullName,
    designation: p.designation || '',
  }));

  const { writeFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  writeFileSync(fileURLToPath(OUT), JSON.stringify(parks), 'utf-8');

  console.log(`[prebuild] Wrote ${parks.length} parks to src/data/park-slugs.json (${(JSON.stringify(parks).length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('[prebuild] Failed to generate park slugs:', err.message);
  process.exit(1);
});
