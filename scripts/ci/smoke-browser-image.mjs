import './verify-browser-image.mjs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../next-frontend/package.json', import.meta.url));
const { chromium, firefox, webkit } = require('playwright');
for (const type of [chromium, firefox, webkit]) {
  const browser = await type.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Isolated browser check</title>');
    if (await page.title() !== 'Isolated browser check') throw new Error(`${type.name()} smoke failed`);
    console.log(`${type.name()}: launch, local page and shutdown passed`);
  } finally {
    await browser.close();
  }
}
