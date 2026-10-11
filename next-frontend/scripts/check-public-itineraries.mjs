#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(readFileSync(join(here, '../src/data/public-itineraries/index.json'), 'utf8'));
const output = join(here, '../../artifacts/public-itinerary-browser-checks');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of (process.env.ITINERARY_WIDTHS || '390,768,1440,1920').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120000);
    const forbiddenRequests = [];
    page.on('request', request => {
      if (/\/api\/(trips|conversations|ai\/chat)/.test(request.url())) forbiddenRequests.push(new URL(request.url()).pathname);
    });
    for (const path of ['/itineraries', ...samples.filter(sample => !process.env.ITINERARY_CHECK_SLUG || sample.slug === process.env.ITINERARY_CHECK_SLUG).map(sample => `/itineraries/${sample.slug}`)]) {
      const response = await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      for (const image of await page.locator('main img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(async element => { try { await element.decode(); } catch { /* reported below */ } });
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const badImages = await page.locator('main img').evaluateAll(images => images.filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src));
      const interactionErrors = [];
      const invalidLinks = await page.locator('main a[href*="entry=new-trip"]').evaluateAll(links => links.filter(link => {
        const url = new URL(link.href);
        return url.pathname !== '/plan-ai' || url.searchParams.get('entry') !== 'new-trip' || !url.searchParams.get('ask') || url.searchParams.has('tripId');
      }).map(link => link.href));
      if (path !== '/itineraries') {
        const sample = samples.find(item => path === `/itineraries/${item.slug}`);
        const expectedBlocks = sample.plan.days.reduce((count, day) => count + (day.dayStructure?.blocks?.length || 0), 0);
        if (await page.locator('[data-day-block]').count() !== expectedBlocks) interactionErrors.push('Day structure missing from public rendering');
        const mappedDay = sample.plan.days.find(day => day.stops.some(stop => stop.location?.status === 'resolved'));
        const mappedDayNumber = mappedDay?.dayNumber || 1;
        const dayButtons = page.getByRole('group', { name: 'Trip days', exact: true });
        await dayButtons.getByRole('button', { name: 'Day 1', exact: true }).click();
        if (await dayButtons.getByRole('button', { name: 'Day 1', exact: true }).getAttribute('aria-pressed') !== 'true') interactionErrors.push('Day selection failed');
        await dayButtons.getByRole('button', { name: 'All', exact: true }).click();
        await page.getByRole('tab', { name: 'Map', exact: true }).click();
        await page.getByRole('region', { name: 'Trip map view' }).waitFor();
        try {
          await page.locator('[aria-label="Trip map view"] .gm-style').waitFor({ timeout: 20000 });
          await page.locator('[aria-label="Trip map view"] .gm-style').scrollIntoViewIfNeeded();
          await page.locator('[aria-label="Trip map view"] [title*=" · Stop "], [aria-label="Trip map view"] [title*="overlapping stops"]').first().waitFor({ state: 'visible', timeout: 20000 });
          await page.waitForFunction(() => {
            const tiles = [...document.querySelectorAll('[aria-label="Trip map view"] .gm-style img')].filter(image => image.width >= 128);
            return tiles.length > 0 && tiles.every(image => image.complete && image.naturalWidth > 0);
          }, null, { timeout: 20000 });
          const expectedStops = sample.plan.days.flatMap(day => day.stops).filter(stop => stop.location?.status === 'resolved').length;
          await page.waitForFunction(expected => {
            const titles = [...document.querySelectorAll('[aria-label="Trip map view"] [title]')].map(element => element.title);
            const represented = titles.reduce((count, title) => count + (/^Day \d+ · Stop /.test(title) ? 1 : Number(title.match(/^(\d+) overlapping stops\./)?.[1] || 0)), 0);
            return represented === expected;
          }, expectedStops, { timeout: 20000 });
        } catch (error) { interactionErrors.push(`Map readiness: ${error.message.split('\n')[0]}`); }
        if (await page.getByTestId('itinerary-map-runtime-blocked').count()) interactionErrors.push('Map runtime blocked');
        // fitBounds animates the raster fallback after its first loaded tiles.
        // Let that camera transition finish before taking the visual artifact.
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(output, `${path.split('/').filter(Boolean).join('-')}-map-${width}.png`), fullPage: true });
        await dayButtons.getByRole('button', { name: `Day ${mappedDayNumber}`, exact: true }).click();
        try {
          const expectedDayStops = mappedDay.stops.filter(stop => stop.location?.status === 'resolved').length;
          await page.waitForFunction(({ expected, dayNumber }) => {
            const titles = [...document.querySelectorAll('[aria-label="Trip map view"] [title]')].map(element => element.title).filter(title => /^Day \d+ · Stop /.test(title));
            return titles.length === expected && titles.every(title => title.startsWith(`Day ${dayNumber} ·`));
          }, { expected: expectedDayStops, dayNumber: mappedDayNumber }, { timeout: 10000 });
          if (mappedDay.travelEdges.some(edge => edge.status === 'verified' && edge.durationSeconds > 0)) await page.locator('[data-itinerary-edge-label]').first().waitFor({ timeout: 10000 });
          await page.locator(`[aria-label="Trip map view"] [title^="Day ${mappedDayNumber} · Stop "]`).first().click();
          await page.locator('[aria-label="Selected stop"]').waitFor({ state: 'visible', timeout: 10000 });
        } catch (error) { interactionErrors.push(`Day map: ${error.message.split('\n')[0]}`); }
        await dayButtons.getByRole('button', { name: 'All', exact: true }).click();
        await page.getByRole('tab', { name: 'Itinerary', exact: true }).click();
      }
      await page.screenshot({ path: join(output, `${path.split('/').filter(Boolean).join('-')}-${width}.png`), fullPage: true });
      results.push({ width, path, status: response.status(), overflow, badImages, invalidLinks, interactionErrors, forbiddenRequests: [...forbiddenRequests] });
    }
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(join(output, 'results.json'), JSON.stringify({ publishedSamples: samples.length, results }, null, 2));
const failed = result => result.status !== 200 || result.overflow || result.badImages.length || result.invalidLinks.length || result.interactionErrors.length || result.forbiddenRequests.length;
console.log(JSON.stringify({ publishedSamples: samples.length, checkedPages: results.length, failures: results.filter(failed) }, null, 2));
if (results.some(failed)) process.exitCode = 1;
