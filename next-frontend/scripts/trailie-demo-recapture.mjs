#!/usr/bin/env node
/**
 * /trailie-demo re-capture review run.
 *
 * Drives the REAL authenticated /plan-ai UI — same composer, same
 * /api/ai/chat-stream, same persistence — for each existing demo scenario, and
 * records what actually happened. It never touches the static demo playback and
 * never publishes: every output lands in a candidates directory for review.
 *
 * Scenario order is fixed. Each scenario starts a fresh conversation, EXCEPT
 * Zion turn 2, which continues turn 1's conversation so the follow-up is
 * answered from real context.
 *
 * No turn is retried or regenerated. A failed scenario is recorded as failed and
 * the run continues, because a partial batch is still reviewable.
 *
 * Secrets: the fixture password is read from a 0600 file outside the repository,
 * used once against the real login route, and never written, printed or placed
 * in a screenshot. Only the token lives in memory, and it is redacted from every
 * artifact.
 */

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isWelcomeProse,
  selectRecaptureAnswer,
} from '../src/lib/trailieDemoRecaptureCapture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

const FRONTEND = process.env.TRAILIE_DEMO_FRONTEND || 'http://127.0.0.1:3000';
const BACKEND = process.env.TRAILIE_DEMO_BACKEND || 'http://127.0.0.1:5001';
const OUT_DIR = process.env.TRAILIE_DEMO_LEDGER_DIR
  || join(ROOT, 'artifacts/trailie-demo-recapture-candidates');
const SECRET_FILE = process.env.TRAILIE_DEMO_SECRET_FILE;
const EMAIL = process.env.TRAILIE_DEMO_EMAIL;
const TURN_TIMEOUT_MS = Number(process.env.TRAILIE_DEMO_TURN_TIMEOUT_MS || 300000);
const KEY_FILTER = (process.env.TRAILIE_DEMO_KEYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SECRET_FILE || !EMAIL) {
  console.error('[recapture] TRAILIE_DEMO_SECRET_FILE and TRAILIE_DEMO_EMAIL are required');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(join(OUT_DIR, 'screenshots'), { recursive: true });

/** The run plan. `continues` means: stay in the previous turn's conversation. */
const PLAN = [
  {
    key: '1-valley-of-fire',
    scenarioId: 'valley-of-fire-weekend',
    label: 'Valley of Fire',
    question:
      'Plan a relaxed weekend at Valley of Fire from Las Vegas with easy hikes, sunset spots, and minimal rushing.',
    expectedKind: 'itinerary',
  },
  {
    key: '2-acadia-shenandoah',
    scenarioId: 'compare-acadia-shenandoah',
    label: 'Compare',
    question:
      'I have 3 days in October. Should I choose Acadia or Shenandoah for fall colors, easy hikes, and photography? Pick one and explain why.',
    expectedKind: 'conversation',
  },
  {
    key: '3-yellowstone-relaxed',
    scenarioId: 'yellowstone-relaxed',
    label: 'Yellowstone',
    question:
      'Plan a relaxed 2-day Yellowstone trip for first-time visitors who want geysers, wildlife, and scenic drives without rushing.',
    expectedKind: 'itinerary',
  },
  {
    key: '4-rocky-mountain',
    scenarioId: 'rocky-mountain-one-day',
    label: 'Rocky Mountain',
    question:
      "I only have one full day in Rocky Mountain National Park. What should I prioritize, and what's a good backup if Bear Lake parking or access doesn't work out?",
    expectedKind: 'conversation',
  },
  {
    key: '5-zion',
    scenarioId: 'zion-couple-itinerary',
    label: 'Zion',
    question:
      'Plan a realistic 2-day Zion trip for a couple who wants scenic views, easy-to-moderate hikes, and no exposed scary trails.',
    expectedKind: 'itinerary',
  },
];

/**
 * Browser-side probe. Installed before app code so it sees the whole turn.
 * Watches itinerary cards by aria-label. Counts distinct card nodes so follow-up
 * refinements that add a second card are visible.
 */
function installCardProbe() {
  const SELECTOR = 'section[aria-label="Trip itinerary"]';
  const now = () => performance.now();
  const countDays = (card) => card.querySelectorAll('article').length || null;
  const known = new Set();

  const P = {
    card: {
      mounts: 0,
      unmounts: 0,
      firstSeenAtMs: null,
      lastSeenAtMs: null,
      lastRemovedAtMs: null,
      dayCountFirstSeen: null,
      dayCountLatest: null,
      cardCountLatest: 0,
    },
    proseFirstSeenAtMs: null,
    consoleErrors: [],
    resetForTurn() {
      P.card.mounts = 0;
      P.card.unmounts = 0;
      P.card.firstSeenAtMs = null;
      P.card.lastSeenAtMs = null;
      P.card.lastRemovedAtMs = null;
      P.card.dayCountFirstSeen = null;
      P.card.dayCountLatest = null;
      P.card.cardCountLatest = 0;
      P.proseFirstSeenAtMs = null;
      known.clear();
      for (const card of document.querySelectorAll(SELECTOR)) {
        delete card.dataset.probeId;
      }
      // Reconcile immediately so a card already on screen after reset is counted.
      check();
    },
    reconcile() {
      check();
      return {
        mounts: P.card.mounts,
        cardCountLatest: P.card.cardCountLatest,
      };
    },
  };
  window.__cardProbe = P;

  const check = () => {
    const cards = [...document.querySelectorAll(SELECTOR)];
    P.card.cardCountLatest = cards.length;
    const liveIds = new Set();

    for (const card of cards) {
      if (!card.dataset.probeId) {
        card.dataset.probeId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      const id = card.dataset.probeId;
      liveIds.add(id);
      if (!known.has(id)) {
        known.add(id);
        P.card.mounts += 1;
        const t = now();
        if (P.card.firstSeenAtMs == null) {
          P.card.firstSeenAtMs = t;
          P.card.dayCountFirstSeen = countDays(card);
        }
        P.card.lastSeenAtMs = t;
        P.card.dayCountLatest = countDays(card);
      } else {
        P.card.dayCountLatest = countDays(card);
        P.card.lastSeenAtMs = now();
      }
    }

    for (const id of [...known]) {
      if (!liveIds.has(id)) {
        known.delete(id);
        P.card.unmounts += 1;
        P.card.lastRemovedAtMs = now();
      }
    }

    if (P.proseFirstSeenAtMs == null) {
      const bubbles = document.querySelectorAll('.prose');
      for (const b of bubbles) {
        if ((b.textContent || '').trim().length > 220) {
          P.proseFirstSeenAtMs = now();
          break;
        }
      }
    }
  };

  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(check, 120);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Marks which turn the server-side ledger should attribute rows to. */
function markTurn(key) {
  writeFileSync(join(OUT_DIR, '.current-turn'), key);
}

async function login() {
  const password = readFileSync(SECRET_FILE, 'utf8').trim();
  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  const body = await res.json().catch(() => ({}));
  const token = body.token || body.data?.token || null;
  // AuthContext restores a session only when BOTH `token` and `user` are
  // present in localStorage. Seeding just the token leaves the app anonymous —
  // which silently routes the whole run through /api/ai/chat-anonymous-stream.
  const user = body.data || body.user || null;
  if (!res.ok || !token || !user) {
    throw new Error(`login failed: HTTP ${res.status} (token=${Boolean(token)}, user=${Boolean(user)})`);
  }
  return { token, user };
}

/**
 * Refuses to send anything until the page is genuinely authenticated.
 * A guest turn is not the thing under review, and it also burns quota and money
 * producing an answer that would have to be discarded.
 */
async function assertAuthenticated(page) {
  const state = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    let meOk = false;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      meOk = res.ok;
    } catch { /* leave false */ }
    return {
      hasToken: Boolean(token),
      hasUser: Boolean(user),
      meOk,
      guestQuotaVisible: /messages? (left|remaining)/i.test(document.body.innerText),
    };
  });

  if (!state.hasToken || !state.hasUser || !state.meOk || state.guestQuotaVisible) {
    throw new Error(`not authenticated: ${JSON.stringify(state)}`);
  }
  return state;
}

/** Waits for the turn to finish: terminal SSE + accepted content (not welcome). */
async function waitForTurnComplete(page, deadlineMs, { expectItinerary = false } = {}) {
  const started = Date.now();
  let lastLength = -1;
  let stableFor = 0;

  while (Date.now() - started < deadlineMs) {
    const state = await page.evaluate(() => {
      const last = window.__trailieDemo?.last?.() || null;
      const sendBtn = document.querySelector('button[aria-label="Send message"]');
      const card = document.querySelector('section[aria-label="Trip itinerary"]');
      const bubbles = [...document.querySelectorAll('.prose')];
      const proseTexts = bubbles.map((b) => (b.textContent || '').trim()).filter(Boolean);
      const welcomeMarkers = [
        "Hey Trailie, I'm Trailie",
        'I help you choose where to go outdoors',
      ];
      const nonWelcome = proseTexts.filter(
        (text) => !welcomeMarkers.some((marker) => text.includes(marker))
      );
      const longest = nonWelcome.reduce((n, t) => Math.max(n, t.length), 0);
      // TypingIndicator uses role=status with aria-live — do NOT treat itinerary
      // card pending labels (also role=status) as thinking.
      const thinkingNodes = [...document.querySelectorAll('[role="status"][aria-live]')];
      const incompleteNotes = /Trip notes were not completed|Preparing trip notes|Trip notes pending/i;
      const thinking = thinkingNodes.some((n) => {
        if (n.closest('section[aria-label="Trip itinerary"]')) return false;
        const t = (n.textContent || '').trim();
        if (!t) return false;
        if (incompleteNotes.test(t)) return false;
        return true;
      });
      const notesLabelVisible = incompleteNotes.test(document.body.innerText);
      const body = document.body.innerText || '';
      const generationFailed = /couldn'?t complete this request|please try again/i.test(body);
      return {
        turnComplete: last?.turnCompleteObserved === true || last?.doneWrites > 0,
        proseReady: last?.proseReadyObserved === true,
        itineraryReady: last?.itineraryReadyObserved === true,
        hasPlanSnapshot: Boolean(last?.planSnapshot?.days?.length),
        cardPresent: Boolean(document.querySelector('section[aria-label="Trip itinerary"]')),
        composerDisabled: sendBtn ? sendBtn.disabled === true : null,
        longest,
        hasNonWelcomeProse: nonWelcome.length > 0,
        thinking,
        notesLabelVisible,
        generatingChrome: thinking,
        generationFailed,
      };
    });

    if (state.longest === lastLength) stableFor += 1;
    else stableFor = 0;
    lastLength = state.longest;

    const acceptedVisible = expectItinerary
      ? (state.itineraryReady && (state.cardPresent || state.hasPlanSnapshot))
      : (state.hasNonWelcomeProse || state.proseReady);

    // Card + terminal is enough only when THIS turn emitted itinerary_ready.
    // Historical cards from a prior turn must not settle a failed refinement.
    if (
      expectItinerary
      && state.turnComplete
      && state.itineraryReady
      && (state.cardPresent || state.hasPlanSnapshot)
      && stableFor >= 2
      && !state.thinking
    ) {
      return { ok: true, settledWithPlan: true, ...state };
    }

    if (
      state.turnComplete
      && acceptedVisible
      && stableFor >= 3
      && !state.thinking
      && (state.composerDisabled === false || state.cardPresent || state.hasPlanSnapshot)
    ) {
      return { ok: true, ...state };
    }

    // Failed generation still finalizes — capture the error, do not wait forever.
    if (state.turnComplete && state.generationFailed && state.composerDisabled === false) {
      return { ok: true, settledFailed: true, ...state };
    }

    // Conversation turns without itinerary: allow settle on non-welcome prose.
    if (
      !expectItinerary
      && state.hasNonWelcomeProse
      && state.longest >= 40
      && state.composerDisabled === false
      && stableFor >= 8
      && !state.thinking
    ) {
      return { ok: true, settledWithoutTerminal: true, ...state };
    }

    await sleep(1000);
  }
  return { ok: false, timedOut: true };
}

/** Everything the review needs from the page after a turn settles. */
async function captureTurn(page, plan) {
  const raw = await page.evaluate(() => {
    const observer = window.__trailieDemo?.last?.() || null;
    const probe = window.__cardProbe || null;
    if (probe?.reconcile) probe.reconcile();
    else if (probe) {
      // Fallback: if cards are present but mounts stayed 0, count live cards.
      const liveCards = document.querySelectorAll('section[aria-label="Trip itinerary"]');
      if (liveCards.length && (!probe.card.mounts || probe.card.mounts === 0)) {
        probe.card.mounts = liveCards.length;
        probe.card.cardCountLatest = liveCards.length;
      }
    }

    const userBubbles = [...document.querySelectorAll('[data-role="user"], .justify-end')];
    const proseNodes = [...document.querySelectorAll('.prose')];
    const serializeNode = (node) => {
      const clone = node.cloneNode(true);
      for (const table of clone.querySelectorAll('table')) {
        const rows = [...table.querySelectorAll('tr')].map((tr) =>
          [...tr.querySelectorAll('th,td')]
            .map((c) => (c.textContent || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .join(' | ')
        ).filter(Boolean);
        const md = rows.map((r) => `| ${r} |`).join('\n');
        table.replaceWith(document.createTextNode(`\n${md}\n`));
      }
      return (clone.innerText || clone.textContent || '').trim();
    };
    const proseCandidates = proseNodes.map(serializeNode).filter(Boolean);

    const cards = [...document.querySelectorAll('section[aria-label="Trip itinerary"]')];
    // Follow-up turns may leave prior cards in history — always take the latest.
    const card = cards.length ? cards[cards.length - 1] : null;
    const dayCards = card ? [...card.querySelectorAll('article')] : [];

    const composer = document.querySelector('textarea');
    const sendBtn = document.querySelector('button[aria-label="Send message"]');

    const bodyText = document.body.innerText;
    const internalLeaks = [
      'responseId', 'responseVersion', 'responseRevision', 'itineraryHash',
      'contentHash', 'lifecycleStatus', 'claude-sonnet', 'tool_first',
      'itinerary_ready', 'costUsd', 'inputTokens',
    ].filter((needle) => bodyText.includes(needle));

    return {
      proseCandidates,
      userBubbleCount: userBubbles.length,
      itineraryCardPresent: Boolean(card),
      itineraryDayCount: dayCards.length || null,
      itineraryParkName: card ? card.querySelector('p')?.textContent?.trim() || null : null,
      itineraryText: card ? card.innerText.slice(0, 4000) : null,
      structuredPlan: observer?.planSnapshot || null,
      cardProbe: probe
        ? {
            mounts: probe.card.mounts,
            unmounts: probe.card.unmounts,
            firstSeenAtMs: probe.card.firstSeenAtMs,
            lastSeenAtMs: probe.card.lastSeenAtMs,
            dayCountFirstSeen: probe.card.dayCountFirstSeen,
            dayCountLatest: probe.card.dayCountLatest,
            cardCountLatest: probe.card.cardCountLatest,
            proseFirstSeenAtMs: probe.proseFirstSeenAtMs,
            cardBeforeProse:
              probe.card.firstSeenAtMs != null && probe.proseFirstSeenAtMs != null
                ? probe.card.firstSeenAtMs < probe.proseFirstSeenAtMs
                : null,
            remountedAfterFirstMount: probe.card.mounts > 1,
          }
        : null,
      notesLabelVisible: /Trip notes were not completed|Preparing trip notes|Trip notes pending/i.test(bodyText),
      thinkingVisible: [...document.querySelectorAll('[role="status"][aria-live]')].some(
        (n) => !n.closest('section[aria-label="Trip itinerary"]') && (n.textContent || '').trim()
      ),
      observer: observer
        ? {
            prompt: observer.prompt,
            authenticated: observer.authenticated,
            tripId: observer.tripId,
            responseId: observer.responseId,
            responseVersion: observer.responseVersion,
            responseRevision: observer.responseRevision,
            provider: observer.provider,
            model: observer.model,
            providerRequestCount: observer.providerRequestCount,
            itineraryReadyObserved: observer.itineraryReadyObserved,
            proseReadyObserved: observer.proseReadyObserved,
            turnCompleteObserved: observer.turnCompleteObserved,
            persistenceWrites: observer.persistenceWrites,
            doneWrites: observer.doneWrites,
            costUsd: observer.costUsd,
            eventTypes: (observer.events || []).map((e) => e.type),
            writes: observer.writes,
            planSnapshot: observer.planSnapshot || null,
          }
        : null,
      composerEnabled: composer ? !composer.disabled : null,
      composerValue: composer ? composer.value : null,
      sendButtonPresent: Boolean(sendBtn),
      internalLeaks,
      visibleErrorText: [...document.querySelectorAll('[role="alert"]')]
        .map((n) => n.textContent.trim())
        .filter(Boolean),
    };
  });

  const selected = selectRecaptureAnswer({
    expectedKind: plan.expectedKind,
    observer: raw.observer,
    cardPresent: raw.itineraryCardPresent,
    cardText: raw.itineraryText,
    proseCandidates: raw.proseCandidates,
  });

  return {
    ...raw,
    answer: selected.answer,
    answerLength: selected.answer.length,
    proseBubbleCount: raw.proseCandidates.length,
    captureSource: selected.captureSource,
    hasItinerary: selected.hasItinerary,
    canonicalItinerary: selected.canonicalItinerary,
    captureIssues: selected.issues,
    welcomeProseDetected: isWelcomeProse(selected.answer)
      || selected.captureSource === 'welcome_prose',
  };
}

async function main() {
  const { token, user } = await login();
  console.log('[recapture] authenticated via real login route');

  const browser = await chromium.launch();
  const results = [];
  const networkByTurn = {};
  let context = null;
  let page = null;
  let currentTurnKey = null;

  const newSession = async () => {
    if (context) await context.close();
    context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
    await context.addInitScript(
      ({ t, u }) => {
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
      },
      { t: token, u: user }
    );
    await context.addInitScript(installCardProbe);

    page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        (networkByTurn[currentTurnKey] ||= { requests: [], consoleErrors: [] }).consoleErrors.push(
          msg.text().slice(0, 300)
        );
      }
    });
    page.on('request', (req) => {
      const url = req.url();
      if (!/\/api\//.test(url)) return;
      const bucket = (networkByTurn[currentTurnKey] ||= { requests: [], consoleErrors: [] });
      bucket.requests.push(`${req.method()} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
    });
  };

  for (const plan of PLAN) {
    if (KEY_FILTER.length && !KEY_FILTER.includes(plan.key)) continue;
    currentTurnKey = plan.key;
    markTurn(plan.key);
    console.log(`\n[recapture] ── ${plan.key}`);

    try {
      if (!plan.continues) {
        await newSession();
        await page.goto(`${FRONTEND}/plan-ai?newchat=${Date.now()}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('textarea', { timeout: 60000 });
        await sleep(4000); // let the welcome state settle before typing
        const auth = await assertAuthenticated(page);
        console.log(`[recapture]   auth verified: ${JSON.stringify(auth)}`);
      }

      const composer = page.locator('textarea').first();
      await page.evaluate(() => window.__cardProbe?.resetForTurn?.());
      await composer.click();
      await composer.fill(plan.question);
      await page.locator('button[aria-label="Send message"]').first().click();
      console.log('[recapture]   sent, waiting for the turn to settle…');

      const settled = await waitForTurnComplete(page, TURN_TIMEOUT_MS, {
        expectItinerary: plan.expectedKind === 'itinerary',
      });
      await sleep(2500);

      const captured = await captureTurn(page, plan);
      const shotPath = join(OUT_DIR, 'screenshots', `${plan.key}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });

      const requests = networkByTurn[plan.key]?.requests || [];
      const usedAuthenticatedEndpoint = requests.some((r) => r.includes('/api/ai/chat-stream'));
      const usedAnonymousEndpoint = requests.some((r) => r.includes('chat-anonymous'));

      const rejectedWrites = (captured.observer?.writes || []).filter(
        (write) => write.persistenceAccepted === false || write.status >= 400
      );
      const integrityIssues = [...(captured.captureIssues || [])];
      if (!settled.ok) integrityIssues.push('turn_timeout');
      if (usedAnonymousEndpoint) integrityIssues.push('anonymous_endpoint');
      if (rejectedWrites.length) integrityIssues.push('persistence_rejected');
      if (plan.expectedKind === 'itinerary' && !captured.itineraryCardPresent) {
        if (!integrityIssues.includes('itinerary_card_missing')) {
          integrityIssues.push('itinerary_card_missing');
        }
      }
      if (captured.hasItinerary && captured.captureSource === 'welcome_prose') {
        integrityIssues.push('welcome_prose_despite_itinerary');
      }
      if (captured.hasItinerary && !captured.canonicalItinerary?.days?.length) {
        integrityIssues.push('missing_canonical_itinerary');
      }

      const record = {
        ...plan,
        status: integrityIssues.length === 0 ? 'completed' : 'failed',
        integrityIssues,
        screenshot: shotPath,
        usedAuthenticatedEndpoint,
        usedAnonymousEndpoint,
        liveDataRequests: requests.filter((r) =>
          /\/parks\/|weather|alerts|events|campgrounds|search/i.test(r)
        ),
        network: networkByTurn[plan.key] || null,
        ...captured,
      };
      results.push(record);
      writeFileSync(
        join(OUT_DIR, `${plan.key}.json`),
        `${JSON.stringify(redactRecord(record, token), null, 2)}\n`
      );

      if (usedAnonymousEndpoint) {
        console.error('[recapture]   WARNING: turn used the anonymous endpoint — not an authenticated capture');
      }
      console.log(
        `[recapture]   ${settled.ok ? 'completed' : 'TIMED OUT'} · source=${captured.captureSource} · card=${captured.itineraryCardPresent} · answer=${captured.answerLength} chars`
      );
      if (integrityIssues.length) {
        console.error(`[recapture]   integrity: ${integrityIssues.join(', ')}`);
      }
    } catch (error) {
      console.error(`[recapture]   FAILED: ${error.message}`);
      results.push({ ...plan, status: 'failed', error: error.message });
      // Continue to the next scenario — a partial batch is still reviewable.
    }
  }

  if (context) await context.close();
  await browser.close();
  markTurn('idle');

  const redact = (value) => redactRecord(value, token);
  writeFileSync(
    join(OUT_DIR, 'recapture-results.json'),
    `${JSON.stringify(redact({ generatedAt: new Date().toISOString(), frontend: FRONTEND, results }), null, 2)}\n`
  );
  writeFileSync(
    join(OUT_DIR, 'capture-2-results.json'),
    `${JSON.stringify(redact({ generatedAt: new Date().toISOString(), frontend: FRONTEND, results }), null, 2)}\n`
  );
  console.log(`\n[recapture] wrote ${join(OUT_DIR, 'recapture-results.json')}`);
}

function redactRecord(value, token) {
  return JSON.parse(JSON.stringify(value).replaceAll(token, '[REDACTED_TOKEN]'));
}

main().catch((error) => {
  console.error('[recapture] run failed:', error.message);
  process.exit(1);
});
