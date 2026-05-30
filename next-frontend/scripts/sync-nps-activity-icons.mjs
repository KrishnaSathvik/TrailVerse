#!/usr/bin/env node
/**
 * Download NPS NPMap activity pictograms into public/discover/activity-icons/
 * Run from next-frontend: node scripts/sync-nps-activity-icons.mjs
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllActivitySymbolNames } from '../src/lib/discoverActivityNpsSymbols.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/discover/activity-icons');
const BASE =
  'https://raw.githubusercontent.com/nationalparkservice/symbol-library/gh-pages/src/standalone';

async function downloadSymbol(name) {
  const url = `${BASE}/${name}-black-22.svg`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${name}: HTTP ${res.status}`);
  }
  const svg = await res.text();
  await writeFile(path.join(outDir, `${name}.svg`), svg, 'utf8');
}

await mkdir(outDir, { recursive: true });

const symbols = getAllActivitySymbolNames();
let ok = 0;
const failed = [];

for (const symbol of symbols) {
  try {
    await downloadSymbol(symbol);
    ok += 1;
  } catch (error) {
    failed.push({ symbol, error: error.message });
  }
}

console.log(`Downloaded ${ok}/${symbols.length} NPS activity icons to public/discover/activity-icons/`);
if (failed.length) {
  console.error('Failed:', failed);
  process.exit(1);
}
