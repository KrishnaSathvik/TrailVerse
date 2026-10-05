'use strict';

// Explicit, bounded live smoke. Never connects to the configured application DB.
const path = require('path');
const crypto = require('crypto');
process.chdir(path.resolve(__dirname, '..'));
require('dotenv').config();
if (!process.argv.includes('--live')) throw new Error('Pass --live to authorize the paid core qualification');
if (process.env.NODE_ENV === 'production') throw new Error('local_only');
process.env.NODE_ENV = 'development';
delete process.env.TRAILIE_V2_RUNTIME_ENABLED;
process.env.TRAILIE_REVIEW_WORKER_ENABLED = 'false';
process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'false';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const prices = { 'gpt-6-luna': [.1, .01, .5], 'gpt-6-sol': [2, .2, 10], 'gpt-6-astra': [10, 1, 50] };
let spentOrReserved = 0;
const cap = Number(process.env.TRAILIE_SMOKE_BUDGET_USD || 8);
if (!Number.isFinite(cap) || cap <= 0) throw new Error('invalid_budget');
const dispatches = [];
function instrument() {
  const Responses = require('openai/resources/responses/responses').Responses;
  const create = Responses.prototype.create;
  Responses.prototype.create = async function (body, ...args) {
    if (!prices[body.model]) throw new Error('unexpected_model');
    const [inp, cache, out] = prices[body.model];
    const reserve = ((Buffer.byteLength(JSON.stringify(body)) + 2048) * inp * 1.25 + body.max_output_tokens * out) / 1e6;
    if (spentOrReserved + reserve > cap) throw new Error('smoke_budget_exhausted');
    spentOrReserved += reserve;
    const row = { generated: '', model: body.model, reasoning: body.reasoning?.effort, endpoint: 'responses', cost: null };
    dispatches.push(row);
    const settle = usage => {
      if (!usage) return;
      const read = usage.input_tokens_details?.cached_tokens || 0;
      const write = usage.input_tokens_details?.cache_write_tokens || 0;
      row.cost = ((usage.input_tokens - read - write) * inp + read * cache + write * inp * 1.25 + usage.output_tokens * out) / 1e6;
      spentOrReserved -= reserve - row.cost;
    };
    let result;
    try { result = await create.call(this, body, ...args); }
    catch (error) { row.providerError = {status: error.status, code: error.code, type: error.type}; console.log('PROVIDER_ERROR', JSON.stringify(row.providerError)); throw error; }
    if (result?.[Symbol.asyncIterator]) return (async function* () {
      let usage;
      try { for await (const event of result) { if (event.error || event.response?.error) { const e = event.error || event.response.error; row.providerError = {type: event.type, code: e.code}; console.log('PROVIDER_ERROR', JSON.stringify(row.providerError)); } if (event.response?.usage) usage = event.response.usage; if (['response.output_text.delta', 'response.function_call_arguments.delta'].includes(event.type)) row.generated += event.delta || ''; yield event; } }
      catch (error) { row.providerError = {status: error.status, code: error.code, type: error.type, name: error.name}; console.log('PROVIDER_ERROR', JSON.stringify(row.providerError)); throw error; } finally { settle(usage); }
    })();
    settle(result.usage);
    return result;
  };
  require('@anthropic-ai/sdk/resources/messages').Messages.prototype.create = async () => { throw new Error('unexpected_claude_dispatch'); };
  require('openai/resources/chat/completions').Completions.prototype.create = async () => { throw new Error('unexpected_chat_completions_dispatch'); };
}

async function main() {
  instrument();
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1', name: 'trailie_local_smoke' } });
  process.env.MONGODB_URI = mongo.getUri();
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    require('../src/config/anonymousChatLimits').ANONYMOUS_USER_MESSAGE_LIMIT = 100;
    const loaded = require('../src/app'); server = loaded.server;
    const request = require('supertest');
    const coreCases = [
      ['Wheelchair', ["I use a wheelchair and we're staying near Zion for three days. Help me plan something scenic without assuming hiking."]],
      ['Continuity', ['Give me four days in Zion.', "We're going September 12–17.", 'No scary exposed hikes.', 'Sunrise photography is really important.', 'We booked a hotel in Springdale.', 'Redo day two.', 'Make day three more relaxed.', 'Skip that hike and give us a scenic afternoon.', 'My parents are joining for the last two days.', 'Redo day four for them.']],
      ['Closure', ['Give me three relaxed days in Zion staying in Springdale.', 'The canyon road is closed. What should we do instead?', "It's raining until noon tomorrow.", "We're exhausted. Simplify tomorrow."]],
      ['Seattle', ['Plan three days in Seattle.']],
    ];
    const smokeCases = [
      ['Smoke 1', ['Can I drive to Brooks Falls?']],
      ['Smoke 2', ['Acadia or Shenandoah for fall colors?']],
      ['Smoke 3', ['Where should I go in November for desert landscapes?']],
      ['Smoke 4-6', ["Give me three relaxed days in Zion staying in Springdale. I don't like exposed hikes and sunrise photography matters.", 'Redo day two and make it easier.', 'The canyon road is closed. What should we do instead?']],
      ['Smoke 7', ['Yellowstone, Grand Teton, Glacier and Banff in five days.']],
      ['Smoke 8', ['Give me three days in Seattle.']],
      ['Smoke 9', ['Plan Brooks Falls from Anchorage as a day trip.']],
      ['Smoke 10', ['Give me a photography-focused Grand Teton trip.']],
    ];
    const selected = process.argv.includes('--smoke') ? smokeCases : coreCases;
    for (const [name, prompts] of selected.filter(c => !process.argv.includes('--wheelchair') || c[0] === 'Wheelchair')) {
      let anonymousId = crypto.randomUUID();
      const messages = []; let priorPlan = null;
      for (const prompt of prompts) {
        messages.push({ role: 'user', content: prompt });
        const start = Date.now(); const startCall = dispatches.length;
        const res = await request(loaded.app).post('/api/ai/chat-anonymous')
          .set('User-Agent', 'TrailieLocalSmoke/1')
          .send({ anonymousId, clientTurnId: crypto.randomUUID(), messages,
            metadata: name === 'Zion + edit' ? { parkCode: 'zion', parkName: 'Zion National Park' } : {} })
          .timeout({ deadline: 240000 });
        const body = res.body.data || res.body;
        anonymousId = body.anonymousId || anonymousId;
        const session = await mongoose.connection.collection('anonymoussessions').findOne({ anonymousId });
        require('fs').appendFileSync(`/tmp/trailie-core-final-${process.env.TRAILIE_CORE_RUN || 'diagnostic'}.jsonl`, JSON.stringify({name, prompt, body, session, dispatches: dispatches.slice(startCall)}) + '\n');
        const plan = [...(session?.messages || [])].reverse().find(m => m.canonicalPlan)?.canonicalPlan || null;
        const changedDays = priorPlan && plan ? plan.days.flatMap((d, i) => JSON.stringify(d) === JSON.stringify(priorPlan.days[i]) ? [] : [i + 1]) : null;
        console.log('SMOKE_RESULT', JSON.stringify({ name, prompt, httpStatus: res.status,
          status: body.trailieV2?.status, latencyMs: Date.now() - start,
          attempts: body.trailieV2?.attempts?.map(a => ({ model: a.model, effort: a.reasoningEffort, validation: a.validationStatus, reasons: a.validationReasonCodes })),
          dispatches: dispatches.slice(startCall), content: body.content, itinerary: body.itinerary || null,
          changedDays, unchangedOtherDays: changedDays ? changedDays.every(d => d === 2) : null,
          savedHashMatches: body.itineraryHash ? body.itineraryHash === plan?.itineraryHash : null,
          planningState: session?.planningState || null }));
        if (dispatches.slice(startCall).some(d => d.providerError?.code === 'credit_balance_exhausted' || d.providerError?.type === 'insufficient_quota')) {
          throw Object.assign(new Error('Live qualification blocked: provider credit exhausted'), {code: 'credit_balance_exhausted'});
        }
        priorPlan = plan;
        if (body.content) messages.push({ role: 'assistant', content: body.content });
      }
    }
    console.log('SMOKE_COST', JSON.stringify({ calls: dispatches.length, spentOrReserved, cap }));
  } finally {
    server?.close(); await mongoose.disconnect(); await mongo.stop();
  }
}
main().then(() => process.exit(0)).catch(error => {
  console.error('SMOKE_FAILED', error.code || error.name); process.exit(1);
});
