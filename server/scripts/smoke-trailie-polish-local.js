'use strict';

// Four explicitly authorized paid turns, real auth/router/store, disposable DB.
// Usage: node scripts/smoke-trailie-polish-local.js --live --seed /path/to/prior-turn.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const preflight = process.argv.includes('--preflight');
if ((!process.argv.includes('--live') && !preflight) || !process.argv.includes('--seed')) throw new Error('--live (or --preflight) and --seed required');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
if (process.env.NODE_ENV === 'production') throw new Error('local_only');
process.env.NODE_ENV = 'development';
process.env.TRAILIE_RUNTIME = 'model_first';
process.env.TRAILIE_REVIEW_WORKER_ENABLED = 'false';
process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'false';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const cap = Number(process.env.TRAILIE_SMOKE_BUDGET_USD || .10);
if (!Number.isFinite(cap) || cap <= 0) throw new Error('invalid_budget');
const patchOnly = process.argv.includes('--patch-only');
const out = path.resolve(__dirname, '../../artifacts/private/polish-smoke', patchOnly ? 'patch-retry' : '.');
fs.mkdirSync(out, { recursive: true });
const seed = JSON.parse(fs.readFileSync(path.resolve(arg('--seed')), 'utf8')).final;
assert(seed?.canonicalPlan?.days?.length === 3, 'Need the prior accepted three-day St. John plan');
let spent = 0;
const dispatches = [];
function instrument() {
  const { Responses } = require('openai/resources/responses/responses');
  const original = Responses.prototype.create;
  Responses.prototype.create = async function (body, ...args) {
    if (preflight) throw new Error('paid_call_forbidden_in_preflight');
    assert.equal(body.model, 'gpt-6.1-sol');
    // Count the actual input before reserving spend: UTF-8 bytes overestimate
    // these English/schema prompts enough to block an affordable final call.
    const fields = ['model', 'instructions', 'input', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text'];
    const counted = await this.inputTokens.count(Object.fromEntries(fields.filter(k => body[k] != null).map(k => [k, body[k]])), args[0]);
    assert(Number.isSafeInteger(counted.input_tokens) && counted.input_tokens > 0, 'Input token count required');
    const inputReserve = (counted.input_tokens + 512) * 2.5 / 1e6;
    const allowedOutput = Math.floor((cap - spent - inputReserve) * 1e6 / 10);
    if (allowedOutput < 512) throw Object.assign(new Error('smoke_budget_exhausted'), { code: 'smoke_budget_exhausted' });
    body = { ...body, max_output_tokens: Math.min(body.max_output_tokens, allowedOutput) };
    const row = { model: body.model, countedInputTokens: counted.input_tokens, maxOutputTokens: body.max_output_tokens, costUsd: null };
    dispatches.push(row);
    const reserve = inputReserve + body.max_output_tokens * 10 / 1e6;
    spent += reserve;
    const response = await original.call(this, body, ...args);
    assert(response.usage, 'Usage required for budget accounting');
    const u = response.usage, cached = u.input_tokens_details?.cached_tokens || 0;
    row.costUsd = ((u.input_tokens - cached) * 2 + cached * .1 + u.output_tokens * 10) / 1e6;
    row.usage = u;
    spent += row.costUsd - reserve;
    return response;
  };
}
async function main() {
  instrument();
  const mongoose = require('mongoose');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  process.env.MONGODB_URI = mongo.getUri();
  const results = [], telemetry = [];
  try {
    await mongoose.connect(mongo.getUri());
    const User = require('../src/models/User');
    const TripPlan = require('../src/models/TripPlan');
    const user = await User.create({ name: 'Local Smoke', firstName: 'Local', lastName: 'Smoke', email: `smoke-${crypto.randomUUID()}@example.com`, password: crypto.randomBytes(24).toString('hex') });
    const token = require('jsonwebtoken').sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const trip = await TripPlan.create({ userId: user._id, plan: seed.canonicalPlan,
      planningState: seed.planningState, conversation: [] });
    const before = JSON.parse(JSON.stringify(trip.plan));
    const app = require('express')();
    app.use(require('express').json());
    app.use('/api/ai', require('../src/routes/modelFirstTrailie').createModelFirstRouter({
      observe: async event => { telemetry.push(event); },
    }));
    if (preflight) {
      // Invalid input still exercises real JWT auth, projected User loading and
      // token admission, but is rejected before provider construction.
      const res = await require('supertest')(app).post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`).send({ message: '' });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'invalid_message');
      assert.equal(dispatches.length, 0);
      console.log('PREFLIGHT_PASS: real auth, local three-day seed, zero model calls');
      return;
    }
    const turns = [
      { name: 'Chicago Q&A', message: 'Is Chicago worth visiting in December?' },
      { name: 'Chicago plan', message: 'Plan three full sightseeing days in Chicago without a car. Include the Art Institute of Chicago.' },
      { name: 'St. John patch', tripId: String(trip._id), metadata: { editScope: { dayNumbers: [2] } },
        message: 'Replace day 2 only with Cinnamon Bay in the morning and Peace Hill in the afternoon. Keep days 1 and 3 exactly unchanged.' },
      { name: 'Tokyo', message: 'Plan a three-day trip to Tokyo.' },
    ];
    for (const turn of patchOnly ? turns.filter(t => t.name === 'St. John patch') : turns) {
      const started = Date.now(), callStart = dispatches.length;
      const response = await require('supertest')(app).post('/api/ai/chat').set('Authorization', `Bearer ${token}`)
        .send(turn).timeout({ deadline: 240000 });
      const body = response.body.data || response.body;
      const saved = body.tripId ? await TripPlan.findById(body.tripId).lean() : null;
      const stops = (saved?.plan?.days || []).flatMap(day => (day.stops || []).map(stop => ({ day: day.dayNumber, name: stop.name, location: stop.location, canonicalPlaceId: stop.canonicalPlaceId })));
      const result = { name: turn.name, httpStatus: response.status, latencyMs: Date.now() - started,
        body, savedPlan: saved?.plan || null, stops, dispatches: dispatches.slice(callStart), telemetry: telemetry.at(-1) };
      const hasPin = name => stops.some(stop => stop.name.includes(name) && Number.isFinite(stop.location?.lat) && Number.isFinite(stop.location?.lon));
      result.checks = { httpOk: response.status === 200 };
      if (turn.name === 'Chicago Q&A' || turn.name === 'Tokyo') result.checks.noPlan = !saved?.plan?.days?.length;
      if (turn.name === 'Chicago plan') result.checks.artInstitutePin = hasPin('Art Institute');
      if (turn.name === 'St. John patch') {
        result.checks.cinnamonPin = hasPin('Cinnamon Bay');
        result.checks.peaceHillPin = hasPin('Peace Hill');
        result.checks.untouchedDays = [0, 2].every(i => JSON.stringify(saved?.plan?.days[i]) === JSON.stringify(before.days[i]));
        result.checks.completedWording = /\bI(?:’ve|'ve| have)? (?:replaced|updated|changed|swapped)\b/i.test(body.content || '') && !/I[’']d (?:replace|update|change|swap)/i.test(body.content || '');
      }
      results.push(result);
      fs.writeFileSync(path.join(out, `turn-${results.length}.json`), JSON.stringify(result, null, 2));
      console.log('SMOKE_RESULT', JSON.stringify({ name: turn.name, latencyMs: result.latencyMs, checks: result.checks, spent }));
    }
    const summary = { cap, modelCostUsd: spent, providerCosts: 'Not priced by model token telemetry',
      results: results.map(({ name, checks, latencyMs }) => ({ name, checks, latencyMs })) };
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    assert(results.every(r => Object.values(r.checks).every(Boolean)), 'One or more smoke checks failed; inspect artifacts');
  } finally {
    fs.writeFileSync(path.join(out, 'dispatches.json'), JSON.stringify({ cap, spent, dispatches }, null, 2));
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error('SMOKE_FAILED', error.code || error.message); process.exit(1); });
