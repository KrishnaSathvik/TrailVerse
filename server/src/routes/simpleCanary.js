'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { createCanaryBudget } = require('../services/simpleCanaryBudget');
const DIRECTORY = path.resolve(__dirname, '../../../artifacts/trailie-simple-canary-2026-09-29');
const CONFIG = path.join(DIRECTORY, 'config.json');
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
const router = express.Router();
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' || !loopback(req.socket.remoteAddress) || !fs.existsSync(CONFIG)
    || !['127.0.0.1', 'localhost', '::1'].includes(mongoose.connection.host)) return res.sendStatus(404);
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (!config.enabled) return res.sendStatus(404);
  const origin = req.get('origin');
  if (origin && !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin)) return res.sendStatus(403);
  const forwarded = req.get('x-forwarded-for');
  if (forwarded && !forwarded.split(',').every(ip => loopback(ip.trim()))) return res.sendStatus(403);
  req.canaryOwner = config.ownerId;
  next();
}, protect, (req, res, next) => String(req.user._id) === req.canaryOwner ? next() : res.sendStatus(403));
router.get('/', (_req, res) => res.json({ budget: createCanaryBudget(DIRECTORY).status() }));
router.post('/', async (req, res) => {
  if (typeof req.body.message !== 'string' || !req.body.message.trim() || req.body.message.length > 10000) return res.sendStatus(400);
  const budget = createCanaryBudget(DIRECTORY);
  let turn;
  try { turn = budget.begin(String(req.user._id)); } catch { return res.status(429).json({ status: 'canary_closed', budget: budget.status() }); }
  const trace = { turn, message: req.body.message, startedAt: new Date().toISOString(), modelCalls: [], tools: [] };
  let result;
  const controller = new AbortController();
  req.on('aborted', () => controller.abort());
  try {
    const { createSimpleRuntime } = require('../services/trailieSimpleRuntime');
    const { createSimpleModel } = require('../services/trailieSimpleModel');
    const { createSimpleTravelTools } = require('../services/trailieSimpleTools');
    const { createSimpleTripStore } = require('../services/trailieSimpleStore');
    const { createDefaultEvidenceProviders } = require('../services/evidenceBrokerRuntime');
    const { createEvidenceBroker } = require('../services/evidenceBrokerService');
    const OpenAI = require('openai');
    const sdk = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60000 });
    const client = { responses: { create: async (body, options) => {
      let reservation;
      try { reservation = budget.reserve(body); }
      catch (error) {
        trace.dispatchFailure = error.message === 'canary_budget_exhausted'
          ? 'canary_budget_exhausted' : 'canary_dispatch_denied';
        throw error;
      }
      const raw = await sdk.responses.create(reservation.body, { ...options, maxRetries: 0 });
      budget.settle(reservation.id, raw); return raw;
    } } };
    const model = createSimpleModel({ client });
    const { createMemoryAuthorityVerifier } = require('../services/trailieMemoryAuthority');
    const { createMemoryVerificationModel } = require('../services/trailieMemoryVerificationModel');
    const providers = createDefaultEvidenceProviders().map(provider => ({ ...provider,
      classifyError: error => ({ ...provider.classifyError(error), retryable: false }) }));
    const broker = createEvidenceBroker({ providers, acquireLease: async () => { throw new Error('ephemeral_only'); },
      releaseLease: async () => {}, recordRefreshEvent: async () => {} });
    const travel = createSimpleTravelTools({ broker });
    const store = createSimpleTripStore({ TripPlan: require('../models/TripPlan') });
    const runtime = createSimpleRuntime({ maxCorrections: 0, stopOnToolFailure: true,
      verifyMemory: createMemoryAuthorityVerifier({ model: createMemoryVerificationModel({ client }) }),
      model: async args => { const output = await model(args); trace.modelCalls.push(output); return output; },
      travelTools: { definitions: travel.definitions, execute: async (...args) => {
        const output = await travel.execute(...args); trace.tools.push({ name: args[0], arguments: args[1], output });
        return output;
      } },
      store: { load: async args => { const state = await store.load(args); trace.before = state; return state; },
        commit: async args => { trace.guardrail = { accepted: true, mutation: args.mutation };
          const saved = await store.commit(args); if (saved.ok) trace.after = await store.load({ userId: args.userId, tripId: saved.tripId }); return saved; } },
    });
    result = await runtime({ message: req.body.message, tripId: req.body.tripId || null, userId: String(req.user._id), signal: controller.signal });
  } catch (error) { result = { status: 'canary_failed', code: error.code || error.message }; }
  if (trace.dispatchFailure) result = { ...result, status: trace.dispatchFailure };
  // A failed tool stops the canary even if the runtime produced fallback prose.
  const toolFailed = trace.tools.some(t => t.output.status !== 'fulfilled');
  budget.end(result.status !== 'complete' || toolFailed);
  trace.result = result; trace.budget = budget.status(); trace.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(DIRECTORY, `turn-${turn}.json`), JSON.stringify(trace, null, 2), { mode: 0o600 });
  res.status(result.status === 'complete' ? 200 : 422).json({ ...result, budget: trace.budget });
});
module.exports = router;
