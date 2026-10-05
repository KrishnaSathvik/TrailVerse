'use strict';

/**
 * Stage 14.7B §2/§3 — localize the actual-route startup stall.
 *
 * Stage 14.7A's dry run hung somewhere in `beforeAll` and the report grouped
 * three candidates together. This walks the sequence one bounded step at a time
 * so the exact boundary is identified rather than guessed.
 *
 * Emits only: checkpoint name, elapsed ms, outcome, bounded code, and — on
 * timeout — active handle/request type names. Never URIs, credentials, prompts,
 * request bodies, provider payloads or user data.
 */

// Load the real environment first so checkpoints exercise realistic config.
// As of Stage 14.7D1 the AI router no longer validates NPS_API_KEY at import —
// npsService is built lazily — so an absent key surfaces as a bounded
// nps_not_configured at invocation rather than an import-time crash.
require('dotenv').config();

const EVAL_URI = 'mongodb://127.0.0.1:27018/trailverse_eval_14_7';
const results = [];

/** Bounded per-step timeout; local setup should be fast or it is a defect. */
async function checkpoint(name, fn, timeoutMs = 8000) {
  const startedAt = Date.now();
  let timer;
  try {
    const outcome = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { __timeout: true })), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    const row = { checkpoint: name, elapsedMs: Date.now() - startedAt, outcome: 'ok', detail: outcome ?? null };
    results.push(row);
    console.log(`  ok    ${name}  (${row.elapsedMs}ms)${outcome ? `  ${outcome}` : ''}`);
    return { ok: true, value: outcome };
  } catch (err) {
    clearTimeout(timer);
    const elapsedMs = Date.now() - startedAt;
    const timedOut = err && err.__timeout === true;
    const row = {
      checkpoint: name,
      elapsedMs,
      outcome: timedOut ? 'timeout' : 'error',
      boundedCode: timedOut ? 'checkpoint_timeout' : 'checkpoint_error',
      ...(timedOut
        ? {
            activeHandleTypes: [...new Set((process._getActiveHandles?.() || []).map((h) => h?.constructor?.name).filter(Boolean))],
            activeRequestTypes: [...new Set((process._getActiveRequests?.() || []).map((r) => r?.constructor?.name).filter(Boolean))],
          }
        : { boundedMessage: String(err && err.message).slice(0, 120) }),
    };
    results.push(row);
    console.log(`  FAIL  ${name}  (${elapsedMs}ms)  ${row.boundedCode}`);
    if (timedOut) {
      console.log(`        activeHandles: ${row.activeHandleTypes.join(',') || '(none)'}`);
      console.log(`        activeRequests: ${row.activeRequestTypes.join(',') || '(none)'}`);
    } else {
      console.log(`        ${row.boundedMessage}`);
    }
    return { ok: false };
  }
}

async function main() {
  console.log('\nStage 14.7B — actual-route startup checkpoints');
  console.log('='.repeat(70));

  // ── A. evaluation environment ──
  await checkpoint('A. install evaluation environment', () => {
    process.env.MONGODB_URI = EVAL_URI;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage-14-7b-eval-secret';
    process.env.TRAILIE_EARLY_ITINERARY_EVENTS = 'true';
    process.env.TRAILIE_PROSE_RECOVERY = 'false';
    delete process.env.OPENAI_API_KEY;
    return 'env installed';
  });

  // ── B. guard ──
  const guard = await checkpoint('B. isolated-store guard', () => {
    const { assessEvalPersistenceTarget } = require('./evalPersistenceGuard');
    const r = assessEvalPersistenceTarget({ evalUri: EVAL_URI, productionUri: null });
    if (!r.ok) throw new Error(r.failures.join('; '));
    return `${r.target.host}:${r.target.port}/${r.target.database}`;
  });
  if (!guard.ok) return finish();

  // ── C. mongoose import ──
  let mongoose;
  const imported = await checkpoint('C. import mongoose', () => {
    mongoose = require('mongoose');
    return `v${mongoose.version}`;
  });
  if (!imported.ok) return finish();

  // ── D. connect (bounded server selection) ──
  const connected = await checkpoint(
    'D. connect to isolated MongoDB',
    async () => {
      await mongoose.connect(EVAL_URI, { serverSelectionTimeoutMS: 3000 });
      return 'connected';
    },
    10000
  );
  if (!connected.ok) return finish();

  // ── E. verify host/database ──
  await checkpoint('E. verify connected host/database', () => {
    const c = mongoose.connection;
    if (c.name !== 'trailverse_eval_14_7') throw new Error(`unexpected database ${c.name}`);
    if (!['127.0.0.1', 'localhost'].includes(c.host)) throw new Error(`unexpected host ${c.host}`);
    return `${c.host}/${c.name}`;
  });

  // ── §3 probe: prove write/delete works before any application import ──
  await checkpoint('E2. evaluation-owned probe record round-trip', async () => {
    const col = mongoose.connection.db.collection('eval_probe');
    const runId = `probe-${Date.now()}`;
    await col.insertOne({ evaluationRunId: runId, evaluationOwned: true });
    const found = await col.countDocuments({ evaluationRunId: runId });
    await col.deleteMany({ evaluationRunId: runId });
    const after = await col.countDocuments({ evaluationRunId: runId });
    if (found !== 1 || after !== 0) throw new Error('probe round-trip failed');
    return 'insert+delete ok';
  });

  // ── F. models ──
  let User;
  const models = await checkpoint('F. import evaluation-owned models', () => {
    User = require('../src/models/User');
    require('../src/models/TripPlan');
    return 'User + TripPlan';
  });
  if (!models.ok) return finish();

  // ── I(a). seed user BEFORE the application import, per §3 ──
  await checkpoint('I. seed evaluation user', async () => {
    const doc = await User.create({
      name: 'Stage 14.7B Probe',
      email: `eval-14-7b-${Date.now()}@example.com`,
      password: 'Evaluation-Only-Password-1',
      isEmailVerified: true,
    });
    await User.deleteOne({ _id: doc._id });
    return 'create+delete ok';
  });

  // ── G. auth middleware ──
  await checkpoint('G. import authentication middleware', () => {
    require('../src/middleware/auth');
    return 'protect loaded';
  });

  // ── H. the suspected boundary: the AI router ──
  await checkpoint(
    'H. import AI router',
    () => {
      require('../src/routes/ai');
      return 'ai router loaded';
    },
    15000
  );

  await checkpoint('H2. import trips router', () => {
    require('../src/routes/trips');
    return 'trips router loaded';
  });

  return finish();
}

function finish() {
  console.log('='.repeat(70));
  const firstFailure = results.find((r) => r.outcome !== 'ok');
  console.log(
    firstFailure
      ? `\n❌ First failing checkpoint: ${firstFailure.checkpoint} (${firstFailure.boundedCode})`
      : '\n✅ All startup checkpoints passed.'
  );
  console.log('\nJSON:', JSON.stringify({ results, firstFailure: firstFailure?.checkpoint ?? null }, null, 1));
  // Do not leave the process alive on stray handles; this is a diagnostic.
  process.exit(firstFailure ? 1 : 0);
}

main().catch((e) => {
  console.error('unexpected diagnostic failure:', String(e.message).slice(0, 120));
  process.exit(1);
});
