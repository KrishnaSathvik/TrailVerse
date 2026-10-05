import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
const dist = path.join(path.dirname(packagePath), 'dist');
const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(frontendRoot, 'public', 'maplibre', version);

// MapLibre's supported Next.js integration serves both unmodified ESM modules.
// A new URL(worker, import.meta.url) emits only the entry, losing its sibling.
// Versioned paths keep cached workers paired with their own shared module.
mkdirSync(destination, { recursive: true });
for (const filename of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, filename), path.join(destination, filename));
}
console.log(`Prepared MapLibre ${version} worker modules`);
