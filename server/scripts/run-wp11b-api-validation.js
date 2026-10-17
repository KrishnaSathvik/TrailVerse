'use strict';

/**
 * WP11B-1 — REAL LOCAL Trailie v2 API validation harness.
 *
 * Drives the local HTTP API (not the browser, not curl) for 5 guest + 5
 * authenticated turns through the flag-gated integrated v2 runtime.
 *
 * SECURITY: credentials are read from the environment (WP11B_EMAIL / WP11B_PASSWORD)
 * and used ONLY in-memory for the login request. This file never contains, prints,
 * or persists the password or any token/Authorization header. The artifact it
 * writes contains sanitized answers + telemetry only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.WP11B_BASE || 'http://localhost:5001';
const EMAIL = process.env.WP11B_EMAIL || '';
const PASSWORD = process.env.WP11B_PASSWORD || '';
const COST_CAP_USD = Number(process.env.WP11B_COST_CAP_USD || 1.5);
const ARTIFACT = path.resolve(__dirname, '../../artifacts/private/wp11b-api-validation-rerun.json');
const REQUEST_TIMEOUT_MS = 240000;

const GUEST_CASES = (process.env.WP11B_GUEST_CASES || '').split(',').map((s) => s.trim()).filter(Boolean);
const AUTH_CASES = (process.env.WP11B_AUTH_CASES || '').split(',').map((s) => s.trim()).filter(Boolean);
const pickGuest = (q) => GUEST_CASES.length === 0 || GUEST_CASES.includes(q.id);
const pickAuth = (q) => AUTH_CASES.length === 0 || AUTH_CASES.includes(q.id);

const QUESTIONS = [
  { id: 'Q1', text: 'Tell me about Zion National Park and what makes it worth visiting for a first-time visitor.' },
  { id: 'Q2', text: 'Compare Zion National Park and Bryce Canyon National Park for a first-time visitor who prefers easier hikes, scenic views, and a relaxed trip.' },
  { id: 'Q3', text: 'What should I know about current conditions at Yosemite National Park right now, including weather, closures, alerts, and anything that could affect a visit?' },
  { id: 'Q4', text: 'Plan a realistic 3-day Yosemite National Park trip for two adults who enjoy moderate hiking, scenic viewpoints, and wildlife, with no camping.' },
  { id: 'Q5', text: 'Plan a realistic 7-day Yellowstone and Grand Teton trip for two adults, balancing wildlife, scenic drives, and moderate hikes without overpacking each day.' },
];

async function postJson(url, body, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON body captured raw */ }
    return { status: res.status, json, raw: json ? null : text.slice(0, 500), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function unwrap(json) {
  // Terminal transport (legacy dialect) wraps the body in { data: {...} }.
  if (json && typeof json === 'object' && json.data && typeof json.data === 'object') return json.data;
  return json || {};
}

function turnRecord(mode, q, http, payload) {
  const v2 = payload.trailieV2 || null;
  return {
    mode,
    caseId: q.id,
    question: q.text,
    httpStatus: http.status,
    clientLatencyMs: http.latencyMs,
    answer: typeof payload.content === 'string' ? payload.content : null,
    hasItinerary: !!payload.hasItinerary,
    itinerary: payload.itinerary || payload.itineraryData || null,
    itineraryHash: payload.itineraryHash || (v2 && v2.itineraryHash) || null,
    intent: payload.intent || (v2 && v2.intent) || null,
    // Guest quota fields (present only for guest terminal).
    remainingAllowance: payload.remainingAllowance ?? null,
    messageCount: payload.messageCount ?? null,
    canSendMore: payload.canSendMore ?? null,
    // Auth identity fields.
    responseId: payload.responseId ? `redacted:${crypto.createHash('sha256').update(String(payload.responseId)).digest('hex').slice(0, 8)}` : null,
    responseVersion: payload.responseVersion ?? null,
    telemetry: v2,
    errorBody: http.status >= 400 ? (payload.error || http.raw || 'unknown') : null,
  };
}

function turnCostUsd(record) {
  const tc = record.telemetry && record.telemetry.totalCost;
  return tc && tc.costStatus === 'priced' && Number.isFinite(tc.costUsd) ? tc.costUsd : 0;
}

async function main() {
  const report = {
    version: 'wp11b-1-api-validation-v1',
    startedAt: new Date().toISOString(),
    base: BASE,
    costCapUsd: COST_CAP_USD,
    guest: [],
    auth: [],
    notes: [],
    totals: { guestCostUsd: 0, authCostUsd: 0, combinedCostUsd: 0, luna: 0, terraLow: 0, terraMedium: 0, sol: 0, claude: 0, unknownCost: 0 },
  };
  let accumulatedCost = 0;

  const tallyModels = (rec) => {
    for (const a of (rec.telemetry?.attempts || [])) {
      const key = `${a.tier}`;
      if (key === 'luna_low') report.totals.luna += 1;
      else if (key === 'terra_low') report.totals.terraLow += 1;
      else if (key === 'terra_medium') report.totals.terraMedium += 1;
      else if (key === 'sol_medium') report.totals.sol += 1;
      else if (key === 'claude_fallback') report.totals.claude += 1;
      if (a.cost && a.cost.costStatus !== 'priced') report.totals.unknownCost += 1;
    }
  };

  // ---- GUEST: one session, 5 clean-context turns ----
  const anonymousId = `wp11b-guest-${crypto.randomUUID()}`;
  const anonHash = crypto.createHash('sha256').update(anonymousId).digest('hex').slice(0, 8);
  console.log(`[wp11b] guest session (redacted): guest:${anonHash}`);
  for (const q of QUESTIONS) {
    if (!pickGuest(q)) continue;
    if (accumulatedCost >= COST_CAP_USD) { report.notes.push(`cost cap reached before guest ${q.id}`); break; }
    process.stdout.write(`[wp11b] GUEST ${q.id} ... `);
    let rec;
    try {
      const http = await postJson(`${BASE}/api/ai/chat-anonymous`, {
        messages: [{ role: 'user', content: q.text }],
        provider: 'openai',
        anonymousId,
        metadata: { source: 'wp11b-1' },
      });
      rec = turnRecord('guest', q, http, unwrap(http.json));
    } catch (err) {
      rec = { mode: 'guest', caseId: q.id, question: q.text, httpStatus: 0, errorBody: String(err.message || err), telemetry: null };
    }
    report.guest.push(rec);
    tallyModels(rec);
    const c = turnCostUsd(rec); accumulatedCost += c; report.totals.guestCostUsd += c;
    console.log(`http=${rec.httpStatus} tier=${rec.telemetry?.selectedTier || 'n/a'} cost=$${c.toFixed(5)} lat=${rec.clientLatencyMs}ms remain=${rec.remainingAllowance}`);
  }

  // ---- AUTH: login once, 5 clean-context turns ----
  let token = null;
  if (!EMAIL || !PASSWORD) {
    report.notes.push('auth skipped: WP11B_EMAIL/WP11B_PASSWORD not provided in env');
  } else {
    try {
      const login = await postJson(`${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
      if (login.status === 200 && login.json && login.json.token) {
        token = login.json.token;
        report.authLogin = { success: true, identityResolved: !!(login.json.data && login.json.data.id) };
        console.log('[wp11b] auth login: success');
      } else {
        report.authLogin = { success: false, status: login.status, error: (login.json && login.json.error) || 'login_failed' };
        report.notes.push('auth login failed; authenticated turns skipped');
        console.log(`[wp11b] auth login FAILED status=${login.status}`);
      }
    } catch (err) {
      report.authLogin = { success: false, error: String(err.message || err) };
      report.notes.push('auth login threw; authenticated turns skipped');
    }
  }

  if (token) {
    for (const q of QUESTIONS) {
      if (!pickAuth(q)) continue;
      if (accumulatedCost >= COST_CAP_USD) { report.notes.push(`cost cap reached before auth ${q.id}`); break; }
      process.stdout.write(`[wp11b] AUTH ${q.id} ... `);
      let rec;
      try {
        const http = await postJson(`${BASE}/api/ai/chat`, {
          messages: [{ role: 'user', content: q.text }],
          provider: 'openai',
          metadata: { source: 'wp11b-1' },
        }, { Authorization: `Bearer ${token}` });
        rec = turnRecord('auth', q, http, unwrap(http.json));
      } catch (err) {
        rec = { mode: 'auth', caseId: q.id, question: q.text, httpStatus: 0, errorBody: String(err.message || err), telemetry: null };
      }
      report.auth.push(rec);
      tallyModels(rec);
      const c = turnCostUsd(rec); accumulatedCost += c; report.totals.authCostUsd += c;
      console.log(`http=${rec.httpStatus} tier=${rec.telemetry?.selectedTier || 'n/a'} cost=$${c.toFixed(5)} lat=${rec.clientLatencyMs}ms`);
    }
  }
  token = null; // drop token reference

  report.totals.combinedCostUsd = report.totals.guestCostUsd + report.totals.authCostUsd;
  report.finishedAt = new Date().toISOString();

  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`[wp11b] artifact written (private): ${ARTIFACT}`);
  console.log(`[wp11b] combined model cost: $${report.totals.combinedCostUsd.toFixed(5)} (cap $${COST_CAP_USD})`);
  console.log(`[wp11b] model tally: luna=${report.totals.luna} terraLow=${report.totals.terraLow} terraMedium=${report.totals.terraMedium} sol=${report.totals.sol} claude=${report.totals.claude}`);
}

main().catch((err) => { console.error('[wp11b] fatal:', err.message); process.exitCode = 1; });
