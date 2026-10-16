import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

// Updating Playwright requires deliberately selecting a matching official image.
const expected = '1.58.2';
const require = createRequire(new URL('../../next-frontend/package.json', import.meta.url));
const lock = JSON.parse(readFileSync(new URL('../../next-frontend/package-lock.json', import.meta.url)));
for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
  if (lock.packages[`node_modules/${name}`]?.version !== expected ||
      require(`${name}/package.json`).version !== expected) {
    throw new Error(`Browser image version mismatch: ${name}; expected ${expected}`);
  }
}
const { chromium, firefox, webkit } = require('playwright');
for (const browser of [chromium, firefox, webkit]) {
  const path = browser.executablePath();
  if (!path.startsWith('/ms-playwright/') || !existsSync(path)) {
    throw new Error(`Missing preinstalled ${browser.name()} browser: ${path}`);
  }
}
console.log(`Verified Playwright ${expected} and all three preinstalled browser executables.`);
