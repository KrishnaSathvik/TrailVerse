'use strict';

// Explicit, bounded live smoke. Never connects to the configured application DB.
const path = require('path');
const crypto = require('crypto');
process.chdir(path.resolve(__dirname, '..'));
require('dotenv').config();
if (!process.argv.includes('--live')) throw new Error('Pass --live to authorize the six paid smoke checks');
if (process.env.NODE_ENV === 'production') throw new Error('local_only');
process.env.NODE_ENV = 'development';
delete process.env.TRAILIE_V2_RUNTIME_ENABLED;
process.env.TRAILIE_REVIEW_WORKER_ENABLED = 'false';
process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'false';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const prices = { 'gpt-6-luna': [.1, .01, .5], 'gpt-6-sol': [2, .2, 10], 'gpt-6-astra': [10, 1, 50] };
let spentOrReserved = 0;
const cap = Number(process.env.TRAILIE_SMOKE_BUDGET_USD || 3);
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
    const row = { model: body.model, reasoning: body.reasoning?.effort, endpoint: 'responses', cost: null };
    dispatches.push(row);
    const settle = usage => {
      if (!usage) return;
      const read = usage.input_tokens_details?.cached_tokens || 0;
      const write = usage.input_tokens_details?.cache_write_tokens || 0;
      row.cost = ((usage.input_tokens - read - write) * inp + read * cache + write * inp * 1.25 + usage.output_tokens * out) / 1e6;
      spentOrReserved -= reserve - row.cost;
    };
    const result = await create.call(this, body, ...args);
    if (result?.[Symbol.asyncIterator]) return (async function* () {
      let usage;
      try { for await (const event of result) { if (event.response?.usage) usage = event.response.usage; yield event; } }
      finally { settle(usage); }
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
    const loaded = require('../src/app'); server = loaded.server;
    const request = require('supertest');
    const cases = [
      ['Brooks Falls', ['Can I drive to Brooks Falls?']],
      ['Fall colors', ['Acadia or Shenandoah for fall colors?']],
      ['November desert', ['Where should I go in November for desert landscapes?']],
      ['Zion + edit', ["Give me three relaxed days in Zion staying in Springdale. I don't like scary exposed hikes and sunrise photography matters to me.", 'Redo day two and make it easier.']],
      ['Unrealistic multi-park', ['Yellowstone, Grand Teton, Glacier and Banff in five days.']],
    ];
    const selected = process.argv.includes('--zion') ? [cases[3]] : process.argv.includes('--blockers') ? cases.slice(3) : process.argv.includes('--remaining') ? cases.slice(0, 3) : cases;
    for (const [name, prompts] of selected) {
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
        const plan = [...(session?.messages || [])].reverse().find(m => m.canonicalPlan)?.canonicalPlan || null;
        const changedDays = priorPlan && plan ? plan.days.flatMap((d, i) => JSON.stringify(d) === JSON.stringify(priorPlan.days[i]) ? [] : [i + 1]) : null;
        console.log('SMOKE_RESULT', JSON.stringify({ name, prompt, httpStatus: res.status,
          status: body.trailieV2?.status, latencyMs: Date.now() - start,
          attempts: body.trailieV2?.attempts?.map(a => ({ model: a.model, effort: a.reasoningEffort, validation: a.validationStatus, reasons: a.validationReasonCodes })),
          dispatches: dispatches.slice(startCall), content: body.content, itinerary: body.itinerary || null,
          changedDays, unchangedOtherDays: changedDays ? changedDays.every(d => d === 2) : null,
          savedHashMatches: body.itineraryHash ? body.itineraryHash === plan?.itineraryHash : null,
          planningState: session?.planningState || null }));
        priorPlan = plan;
        if (body.content) messages.push({ role: 'assistant', content: body.content });
      }
    }
    if (!process.argv.includes('--zion') && !process.argv.includes('--blockers') && !process.argv.includes('--remaining')) {
    const { createResponsesRequest, executeResponses } = require('../src/services/responsesAdapter');
    const { createOpenAIResponsesAdapter } = require('../src/services/providers/openaiResponsesAdapter');
    const { getCreateItineraryTool, isValidToolItinerary } = require('../src/utils/itineraryToolSchema');
    const { bindGeneratedItineraryContract } = require('../src/utils/generationContractBinding');
    const OpenAI = require('openai');
    const result = await executeResponses(createResponsesRequest({
      provider: 'openai', model: 'gpt-6-astra', reasoning: { effort: 'medium' },
      instructions: 'Use create_itinerary to create one relaxed day in Zion with two stops. Do not invent current conditions.',
      input: [{ role: 'user', content: 'One relaxed day in Zion.' }], maxOutputTokens: 3000,
      tools: [getCreateItineraryTool({ reduced: true })], toolChoice: { name: 'create_itinerary' },
    }), { adapters: { openai: createOpenAIResponsesAdapter({ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 90000 }) }) } });
    const tool = result.toolCalls.find(t => t.name === 'create_itinerary');
    console.log('SMOKE_RESULT', JSON.stringify({ name: 'Astra compatibility', model: result.model,
      status: result.completionStatus, tool: tool?.name,
      valid: !!tool && isValidToolItinerary(bindGeneratedItineraryContract({ itineraryData: tool.input })) }));
    }
    console.log('SMOKE_COST', JSON.stringify({ calls: dispatches.length, spentOrReserved, cap }));
  } finally {
    server?.close(); await mongoose.disconnect(); await mongo.stop();
  }
}
main().then(() => process.exit(0)).catch(error => {
  console.error('SMOKE_FAILED', error.code || error.name); process.exit(1);
});
