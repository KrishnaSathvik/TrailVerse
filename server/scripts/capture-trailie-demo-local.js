'use strict';

// Authenticated demo capture, disposable local DB, $2 cumulative model cap.
// Raw artifacts stay private; import reviewed turns through the public allowlist.
// --release-refusal runs the missing release check separately, capped at $0.10.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const preflight = process.argv.includes('--preflight');
if (!process.argv.includes('--live') && !preflight) throw new Error('--live or --preflight required');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
if (process.env.NODE_ENV === 'production') throw new Error('local_only');
process.env.NODE_ENV = 'development';
process.env.TRAILIE_RUNTIME = 'model_first';
process.env.TRAILIE_REVIEW_WORKER_ENABLED = 'false';
process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'false';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const releaseRefusal = process.argv.includes('--release-refusal');
const cap = releaseRefusal ? .10 : 2;
if (!Number.isFinite(cap) || cap <= 0) throw new Error('invalid_budget');
const out = path.resolve(__dirname, '../../artifacts/private', releaseRefusal ? 'release-refusal-2026-10-15' : 'demo-capture-2026-10-15');
fs.mkdirSync(out, { recursive: true });
const manifest = releaseRefusal
  ? [{ id: 'restaurant-guarantee', expected: ['advice'], questions: ['Guarantee restaurant tables tonight.'] }]
  : require('./trailie-demo-capture-prompts.json');
const ledgerPath = path.join(out, 'budget.json');
const previous = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath)) : { spent: 0, dispatches: [] };
let spent = previous.spent;
const dispatches = previous.dispatches;
function saveBudget() { fs.writeFileSync(ledgerPath, JSON.stringify({ cap, spent, dispatches }, null, 2)); }
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
    saveBudget();
    const response = await original.call(this, body, { ...args[0], maxRetries: 0 });
    assert(response.usage, 'Usage required for budget accounting');
    const u = response.usage, cached = u.input_tokens_details?.cached_tokens || 0;
    row.costUsd = ((u.input_tokens - cached) * 2 + cached * .1 + u.output_tokens * 10) / 1e6;
    row.usage = u;
    spent += row.costUsd - reserve;
    saveBudget();
    return response;
  };
}

async function main() {
  instrument();
  const mongoose = require('mongoose');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  process.env.MONGODB_URI = mongo.getUri();
  try {
    await mongoose.connect(mongo.getUri());
    const User = require('../src/models/User');
    const TripPlan = require('../src/models/TripPlan');
    const user = await User.create({ name: 'Demo Capture', firstName: 'Demo', lastName: 'Capture', email: `capture-${crypto.randomUUID()}@example.com`, password: crypto.randomBytes(24).toString('hex') });
    const token = require('jsonwebtoken').sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '2h' });
    const app = require('express')(); app.use(require('express').json());
    const telemetry = [];
    app.use('/api/ai', require('../src/routes/modelFirstTrailie').createModelFirstRouter({ observe: async event => { telemetry.push(event); } }));
    if (preflight) {
      const res = await require('supertest')(app).post('/api/ai/chat').set('Authorization', `Bearer ${token}`).send({ message: '' });
      assert.equal(res.status, 400); console.log('PREFLIGHT_PASS zero paid calls'); return;
    }
    fs.writeFileSync(path.join(out, 'prompts.json'), JSON.stringify(manifest, null, 2));
    for (const spec of manifest) {
      if (process.argv.includes('--scenario') && spec.id !== arg('--scenario')) continue;
      const dir = path.join(out, spec.id); fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(path.join(dir, 'accepted.json'))) { console.log('KEEP_FIRST_PASS', spec.id); continue; }
      const attempts = fs.readdirSync(dir).filter(f => /^attempt-\d+\.json$/.test(f));
      const attempt = attempts.length + 1;
      assert(attempt <= 2, 'Conversation rerun limit');
      const reason = process.argv.includes('--rerun') ? arg('--rerun') : null;
      assert(attempt === 1 || ['infrastructure', 'grounding'].includes(reason), 'Rerun needs eligible inspected reason');
      const result = { id: spec.id, attempt, reason, turns: [], status: 'started' };
      const file = path.join(dir, `attempt-${attempt}.json`);
      const persist = () => fs.writeFileSync(file, JSON.stringify(result, null, 2)); persist();
      let tripId = null, before = null;
      for (let i = 0; i < spec.questions.length; i++) {
        const start = Date.now(), callStart = dispatches.length;
        const response = await require('supertest')(app).post('/api/ai/chat').set('Authorization', `Bearer ${token}`)
          .send({ message: spec.questions[i], ...(tripId ? { tripId } : {}) }).timeout({ deadline: 300000 });
        const body = response.body.data || response.body;
        const saved = body.tripId ? await TripPlan.findById(body.tripId).lean() : null;
        const turn = { question: spec.questions[i], httpStatus: response.status, latencyMs: Date.now()-start, body,
          savedPlan: saved?.plan || null, telemetry: telemetry.at(-1), dispatches: dispatches.slice(callStart) };
        const checks = { httpOk: response.status === 200, content: !!body.content?.trim() };
        if (checks.httpOk) {
          if (spec.expected[i] === 'advice') checks.noMutation = JSON.stringify(saved?.plan || null) === JSON.stringify(before);
          else checks.dayCount = saved?.plan?.days?.length === spec.days;
          if (spec.id === 'chicago' && i > 0) checks.artInstitutePin = saved?.plan?.days?.some(d => d.stops?.some(s => /Art Institute/i.test(s.name) && Number.isFinite(s.location?.lat) && Number.isFinite(s.location?.lon)));
          if ((spec.id === 'road-trip' && i === 2) || (spec.id === 'st-john' && i === 1)) {
            const changedDay = spec.id === 'road-trip' ? 3 : 2;
            checks.untouchedDays = before.days.filter(d => d.dayNumber !== changedDay).every(d => JSON.stringify(d) === JSON.stringify(saved.plan.days.find(n => n.dayNumber === d.dayNumber)));
          }
        }
        turn.checks = checks; result.turns.push(turn); persist();
        console.log('CAPTURE_TURN', JSON.stringify({ id: spec.id, attempt, turn: i+1, checks, spent, latencyMs: turn.latencyMs }));
        if (!Object.values(checks).every(Boolean)) { result.status = 'needs-review'; persist(); throw new Error('Capture check failed: '+spec.id); }
        tripId = body.tripId; before = saved?.plan || null;
      }
      result.status = 'captured-awaiting-review'; persist();
    }
  } finally { saveBudget(); await mongoose.disconnect(); await mongo.stop(); }
}
main().then(()=>process.exit(0)).catch(e=>{console.error('CAPTURE_STOPPED',e.code || e.message);process.exit(1);});
