#!/usr/bin/env node
// Real authenticated /plan-ai UI capture; never imports or publishes candidates.
// Credentials are read once, kept in memory, and never included in artifacts.
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { REVIEW_CHECKS, validateCapture } from '../src/lib/publicItineraryExport.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = process.env.ITINERARY_FRONTEND || 'http://127.0.0.1:3000';
const backend = process.env.ITINERARY_BACKEND || 'http://127.0.0.1:5001';
for (const value of [frontend, backend]) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname)) throw new Error('Capture is restricted to local development');
}
const output = resolve(process.env.ITINERARY_CAPTURE_DIR || join(here, '../../artifacts/public-itinerary-candidates'));
const concepts = JSON.parse(readFileSync(join(here, 'public-itinerary-concepts.json'), 'utf8'));
const followups = process.env.ITINERARY_FOLLOWUP_FILE ? JSON.parse(readFileSync(process.env.ITINERARY_FOLLOWUP_FILE, 'utf8')) : {};
const email = process.env.ITINERARY_EMAIL;
const secret = process.env.ITINERARY_SECRET_FILE;
if (!email || !secret) throw new Error('Set ITINERARY_EMAIL and ITINERARY_SECRET_FILE; never pass a password on the command line');
mkdirSync(output, { recursive: true, mode: 0o700 });
chmodSync(output, 0o700);
const save = (name, value) => writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

const login = await fetch(`${backend}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: readFileSync(secret, 'utf8').trim() }),
});
const auth = await login.json();
const token = auth.token || auth.data?.token;
const user = auth.user || auth.data;
if (!login.ok || !token || !user) throw new Error(`Local login failed: HTTP ${login.status}`);
const headers = { Authorization: `Bearer ${token}` };
const me = await fetch(`${backend}/api/auth/me`, { headers });
if (!me.ok) throw new Error('Local authentication could not be verified');

const helperPath = join(output, 'map-helper.mjs');
buildSync({ entryPoints: [join(here, '../src/lib/itineraryMapStops.js')], bundle: true, platform: 'node', format: 'esm', outfile: helperPath });
const { buildTripMapModel } = await import(pathToFileURL(helperPath));
const browser = await chromium.launch();
try {
  for (const concept of concepts.filter(item => !process.env.ITINERARY_SLUG || process.env.ITINERARY_SLUG.split(',').includes(item.slug))) {
    const context = await browser.newContext();
    const started = Date.now();
    const prior = process.env.ITINERARY_RESUME_DIR ? JSON.parse(readFileSync(join(process.env.ITINERARY_RESUME_DIR, `${concept.slug}.json`), 'utf8')) : null;
    if (prior && (prior.prompt !== concept.prompt || !prior.tripId)) throw new Error('Resume capture does not match the original concept');
    console.log(`${concept.slug}: ${prior ? 'continuing the same captured conversation' : 'starting a fresh authenticated conversation'}`);
    try {
      await context.addCookies([{ name: 'trailverse_auth_token', value: token, url: frontend }]);
      await context.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      }, { token, user });
      const page = await context.newPage();
      const events = [];
      const newPrompts = prior ? (followups[concept.slug] || []) : [concept.prompt, ...(followups[concept.slug] || [])];
      const prompts = prior ? [concept.prompt, ...(prior.followups || []), ...newPrompts] : newPrompts;
      if (prior) {
        await page.goto(`${frontend}/plan-ai/${encodeURIComponent(prior.tripId)}?chat=true&entry=continue`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.locator('#chat-input:not([disabled])').waitFor({ state: 'visible', timeout: 120000 });
      }
      for (let turn = 0; turn < newPrompts.length; turn += 1) {
        const terminal = page.waitForResponse(response => new URL(response.url()).pathname === '/api/ai/chat-stream', { timeout: 300000 });
        terminal.catch(() => {});
        if (turn === 0 && !prior) await page.goto(`${frontend}/plan-ai?entry=new-trip&ask=${encodeURIComponent(concept.prompt)}`);
        else {
          const composer = page.locator('#chat-input');
          await composer.waitFor({ state: 'visible' });
          // Restoring a saved conversation may remount the composer. Refill
          // only when a click never happened; never resend an accepted click.
          for (let attempt = 0; attempt < 5; attempt += 1) {
            await composer.fill(newPrompts[turn]);
            try {
              await page.getByRole('button', { name: 'Send message', exact: true }).click({ timeout: 10000 });
              break;
            } catch (error) {
              if (error.name !== 'TimeoutError' || attempt === 4) throw error;
            }
          }
        }
        const response = await terminal;
        const stream = await response.body();
        if (!response.ok()) throw new Error(`Authenticated generation returned HTTP ${response.status()}`);
        if (response.headers()['x-trailie-runtime'] !== 'model_first') throw new Error('Capture did not use the model-first runtime');
        const turnEvents = stream.toString('utf8').split('\n').filter(line => line.startsWith('data:')).flatMap(line => {
          try { return [JSON.parse(line.slice(5).trim())]; } catch { return []; }
        });
        events.push(...turnEvents);
        save(`${concept.slug}.transport.json`, { prompt: concept.prompt, prompts, events });
      }
      const terminalEvent = events.filter(event => event.type === 'done').at(-1);
      if (terminalEvent?.artifactStatus?.status === 'save_failed') throw new Error('Latest Trailie update was not saved; prior plan is not a new candidate');
      // Trip identity comes from the real accepted response, never from another sample.
      const tripId = events.map(event => event.tripId || event.data?.tripId).filter(Boolean).at(-1)
        || new URL(page.url()).pathname.match(/^\/plan-ai\/([a-f\d]{24})/i)?.[1];
      if (!tripId) throw new Error('Generation did not return a saved trip');
      if (prior && tripId !== prior.tripId) throw new Error('Follow-up changed conversation identity');
      const savedResponse = await fetch(`${backend}/api/trips/${encodeURIComponent(tripId)}`, { headers });
      const trip = (await savedResponse.json()).data;
      if (!savedResponse.ok || !trip?.plan?.days?.length) throw new Error('No accepted canonical trip was saved');
      if (trip.conversation?.find(message => message.role === 'user')?.content !== concept.prompt) throw new Error('Conversation isolation failed');
      const plan = trip.plan;
      const map = buildTripMapModel(plan);
      const stops = map.days.flatMap(day => day.stops);
      const codes = [...new Set([plan.parkCode, ...(plan.destinations || []).map(item => item.parkCode)].filter(Boolean))];
      const images = [];
      for (const code of codes) {
        const res = await fetch(`${backend}/api/parks/${encodeURIComponent(code)}`);
        if (!res.ok) continue;
        const body = await res.json();
        const park = Array.isArray(body.data) ? body.data[0] : body.data || body;
        const image = park?.images?.[0];
        if (!image?.url) continue;
        const url = new URL(image.url);
        if (url.protocol !== 'https:' || !(url.hostname === 'nps.gov' || url.hostname.endsWith('.nps.gov'))) continue;
        const check = await fetch(image.url);
        const verified = check.ok && (check.headers.get('content-type') || '').startsWith('image/');
        await check.body?.cancel();
        images.push({ url: image.url, alt: image.altText || image.title || park.fullName, credit: image.credit || '', verified });
      }
      const capture = {
        sourceResponseId: terminalEvent?.responseId || null,
        prompt: concept.prompt, followups: prompts.slice(1), response: trip.conversation.filter(item => item.role === 'assistant').at(-1)?.content || '',
        conversation: trip.conversation.map(item => ({ role: item.role, content: item.content })),
        tripId, saved: true, itineraryHash: plan.itineraryHash || trip.itineraryHash,
        plan, images, latencyMs: Date.now() - started,
        mapCoverage: { mapped: stops.filter(stop => stop.mapped).length, missing: stops.filter(stop => stop.mappable && !stop.mapped).length },
        validationWarnings: [],
      };
      capture.validationWarnings = validateCapture(capture, concept);
      save(`${concept.slug}.json`, capture);
      const digest = createHash('sha256').update(readFileSync(join(output, `${concept.slug}.json`))).digest('hex');
      save(`${concept.slug}.review.json`, { captureDigest: digest, itineraryHash: capture.itineraryHash, description: '', checks: Object.fromEntries(REVIEW_CHECKS.map(check => [check, false])), notes: '' });
      console.log(`${concept.slug}: captured; ${capture.validationWarnings.length} validation warnings; review required`);
    } catch (error) {
      const failedPage = context.pages()[0];
      if (failedPage) {
        try {
          save(`${concept.slug}.ui-failure.json`, {
            text: await failedPage.locator('body').innerText(),
            inputs: await failedPage.locator('textarea').evaluateAll(inputs => inputs.map(input => ({ id: input.id, disabled: input.disabled, length: input.value.length }))),
          });
        } catch { /* Preserve the original failure if the page has closed. */ }
      }
      // Do not log raw network/auth/provider errors or response bodies.
      save(`${concept.slug}.failure.json`, { slug: concept.slug, status: 'capture-failed', reason: String(error.message).replace(token, '[redacted]'), stack: String(error.stack).split('\n').slice(0,4).map(line => line.replace(token, '[redacted]')), latencyMs: Date.now() - started });
      console.error(`${concept.slug}: capture failed (${error.name}); no fixture exported`);
      process.exitCode = 1;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
