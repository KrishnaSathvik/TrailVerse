'use strict';

/**
 * ONE paid turn only — Continuity turn 1.
 * Authorized: "Give me four days in Zion."
 * Stops after this request. No follow-ups.
 */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

process.chdir(path.resolve(__dirname, '..'));
require('dotenv').config();
if (process.env.NODE_ENV === 'production') throw new Error('local_only');
process.env.NODE_ENV = 'development';
delete process.env.TRAILIE_V2_RUNTIME_ENABLED;
process.env.TRAILIE_REVIEW_WORKER_ENABLED = 'false';
process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'false';

const RUN = process.env.TRAILIE_CORE_RUN || 'zion-one-turn';
const LOG = `/tmp/trailie-core-${RUN}.log`;
const JSONL = `/tmp/trailie-core-${RUN}.jsonl`;
const PROMPT = 'Give me four days in Zion.';
const qualificationPolicy = require('../src/utils/qualificationDispatchPolicy').createQualificationDispatchPolicy();

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const prices = { 'gpt-6-luna': [0.1, 0.01, 0.5], 'gpt-6-sol': [2, 0.2, 10], 'gpt-6-astra': [10, 1, 50] };
let spentOrReserved = 0;
const cap = Number(process.env.TRAILIE_SMOKE_BUDGET_USD || 3);
if (!Number.isFinite(cap) || cap <= 0) throw new Error('invalid_budget');
const dispatches = [];
let capturedExecution = null;
let capturedClassification = null;
let capturedEvidence = null;
const persistDispatches = () => fs.writeFileSync(`${JSONL}.dispatches.json`, JSON.stringify(dispatches, null, 2), { mode: 0o600 });

function instrument() {
  const Responses = require('openai/resources/responses/responses').Responses;
  const create = Responses.prototype.create;
  Responses.prototype.create = async function (body, ...args) {
    qualificationPolicy.authorize({ model: body.model, purpose: body.metadata?.purpose });
    if (!body.metadata?.purpose) throw new Error('unattributed_model_dispatch');
    if (!prices[body.model]) throw new Error(`unexpected_model:${body.model}`);
    const [inp, cache, out] = prices[body.model];
    const reserve = ((Buffer.byteLength(JSON.stringify(body)) + 2048) * inp * 1.25 + body.max_output_tokens * out) / 1e6;
    if (spentOrReserved + reserve > cap) throw new Error('smoke_budget_exhausted');
    spentOrReserved += reserve;
    const row = {
      generated: '',
      startedAt: new Date().toISOString(),
      request: body,
      purpose: body.metadata.purpose,
      model: body.model,
      reasoning: body.reasoning?.effort,
      endpoint: 'responses',
      cost: null,
    };
    dispatches.push(row);
    persistDispatches();
    const settle = (usage) => {
      row.completedAt = new Date().toISOString();
      row.usage = usage || null;
      if (!usage) { persistDispatches(); return; }
      const read = usage.input_tokens_details?.cached_tokens || 0;
      const write = usage.input_tokens_details?.cache_write_tokens || 0;
      row.cost = ((usage.input_tokens - read - write) * inp + read * cache + write * inp * 1.25 + usage.output_tokens * out) / 1e6;
      spentOrReserved -= reserve - row.cost;
      persistDispatches();
    };
    let result;
    try {
      result = await create.call(this, body, { ...(args[0] || {}), maxRetries: 0 });
    } catch (error) {
      row.providerError = { status: error.status, code: error.code, type: error.type };
      persistDispatches();
      console.log('PROVIDER_ERROR', JSON.stringify(row.providerError));
      throw error;
    }
    if (result?.[Symbol.asyncIterator]) {
      return (async function* () {
        let usage;
        try {
          for await (const event of result) {
            if (event.error || event.response?.error) {
              const e = event.error || event.response.error;
              row.providerError = { type: event.type, code: e.code };
              console.log('PROVIDER_ERROR', JSON.stringify(row.providerError));
            }
            if (event.response?.usage) usage = event.response.usage;
            if (['response.output_text.delta', 'response.function_call_arguments.delta'].includes(event.type)) {
              row.generated += event.delta || '';
            }
            yield event;
          }
        } catch (error) {
          row.providerError = {
            status: error.status, code: error.code, type: error.type, name: error.name,
          };
          console.log('PROVIDER_ERROR', JSON.stringify(row.providerError));
          throw error;
        } finally {
          settle(usage);
        }
      })();
    }
    row.generated = (result.output || []).map(item => item.arguments || (item.content || []).map(part => part.text || '').join('')).join('');
    settle(result.usage);
    return result;
  };
  require('@anthropic-ai/sdk/resources/messages').Messages.prototype.create = async () => {
    throw new Error('unexpected_claude_dispatch');
  };
  require('openai/resources/chat/completions').Completions.prototype.create = async () => {
    throw new Error('unexpected_chat_completions_dispatch');
  };
}

function summarizePlan(plan) {
  if (!plan || !Array.isArray(plan.days)) return null;
  return {
    dayCount: plan.days.length,
    canonicalPlanState: plan.canonicalPlanState || plan.status || null,
    itineraryHash: plan.itineraryHash || null,
    days: plan.days.map((d) => ({
      dayNumber: d.dayNumber,
      label: d.label ?? null,
      title: d.title ?? null,
      summary: d.summary ?? null,
      notes: d.notes ?? null,
      id: d.id || null,
      status: d.status || null,
      stopCount: Array.isArray(d.stops) ? d.stops.length : 0,
      stops: (d.stops || []).map((s) => ({
        name: s.name || null,
        type: s.type || null,
        resolutionStatus: s.resolutionStatus || null,
        experienceKind: s.experienceKind || null,
        evidenceRef: s.evidenceRef || null,
        canonicalPlaceName: s.canonicalPlaceName || null,
        displayName: s.displayName || null,
        evidenceDocumentTitle: s.evidenceDocumentTitle || null,
        semanticCategory: s.semanticCategory || null,
        compoundVisit: s.compoundVisit || null,
        experienceRole: require('../src/utils/semanticDayValue').experienceRole(s, {
          bundle: capturedEvidence, classifyStop: require('../src/utils/itineraryCompleteness').classifyStop,
        }),
        actionability: require('../src/utils/semanticDayValue').experienceRole(s, { bundle: capturedEvidence, classifyStop: require('../src/utils/itineraryCompleteness').classifyStop }).actionabilityStatus,
        duration: s.duration ?? null,
        note: s.note || null,
        why: s.why || null,
        experienceSubject: s.experienceSubject || null,
        subjectEvidenceRef: s.subjectEvidenceRef || null,
      })),
    })),
  };
}

async function main() {
  instrument();
  fs.writeFileSync(LOG, '', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(JSONL, '', { flag: 'wx', mode: 0o600 });
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1', name: 'trailie_zion_one' },
  });
  process.env.MONGODB_URI = mongo.getUri();
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    require('../src/config/anonymousChatLimits').ANONYMOUS_USER_MESSAGE_LIMIT = 100;
    const classifier = require('../src/services/trailieIntentClassifier');
    const classify = classifier.classifyTrailieIntent;
    classifier.classifyTrailieIntent = function (...args) {
      const result = classify.apply(this, args);
      capturedClassification = result;
      return result;
    };
    const execution = require('../src/services/trailieExecutionService');
    const execute = execution.executeTrailieTurn;
    execution.executeTrailieTurn = async function (...args) {
      const deps = args[1];
      if (typeof deps?.resolveEvidence === 'function') {
        const resolve = deps.resolveEvidence;
        args[1] = { ...deps, resolveEvidence: async (...evidenceArgs) => {
          capturedEvidence = await resolve(...evidenceArgs);
          fs.writeFileSync(`${JSONL}.evidence.json`, JSON.stringify(capturedEvidence, null, 2), { mode: 0o600 });
          return capturedEvidence;
        } };
      }
      capturedExecution = await execute.apply(this, args);
      fs.writeFileSync(`${JSONL}.execution.json`, JSON.stringify(capturedExecution, null, 2), { mode: 0o600 });
      return capturedExecution;
    };
    execution.executeTrailieV2Turn = execution.executeTrailieTurn;
    const loaded = require('../src/app');
    server = loaded.server;
    const request = require('supertest');

    const anonymousId = crypto.randomUUID();
    const messages = [{ role: 'user', content: PROMPT }];
    const start = Date.now();
    const startCall = dispatches.length;

    console.log('ZION_ONE_TURN_START', JSON.stringify({ run: RUN, prompt: PROMPT, cap }));
    const res = await request(loaded.app)
      .post('/api/ai/chat-anonymous')
      .set('User-Agent', 'TrailieZionOneTurn/1')
      .send({
        anonymousId,
        clientTurnId: crypto.randomUUID(),
        messages,
        metadata: {},
      })
      .timeout({ deadline: 240000 });

    const body = res.body.data || res.body;
    const session = await mongoose.connection.collection('anonymoussessions')
      .findOne({ anonymousId: body.anonymousId || anonymousId });
    const turnDispatches = dispatches.slice(startCall);
    const savedPlan = [...(session?.messages || [])].reverse().find((m) => m.canonicalPlan)?.canonicalPlan || null;
    const plan = savedPlan
      || body.trailieV2?.canonicalPlan
      || null;
    const draftPlan = session?.planningState?.draftPlan || null;
    const v2 = body.trailieV2 || {};
    const attempts = (capturedExecution?.attempts || v2.attempts || []).map((a) => ({
      model: a.model,
      effort: a.reasoningEffort,
      validation: a.validationStatus,
      reasons: a.validationReasonCodes,
      retryability: a.retryability || null,
      stage: a.validationStage || null,
      target: a.validationTargetDiagnostics || null,
      blockerSignature: a.blockerSignature || null,
    }));
    const identityStatuses = summarizePlan(plan)?.days?.flatMap((d) => d.stops.map((s) => s.resolutionStatus)) || [];
    const hasDraftDayIds = Boolean(
      draftPlan?.days?.some((d) => String(d.id || '').startsWith('draft-day-'))
      || plan?.days?.some((d) => String(d.id || '').startsWith('draft-day-'))
    );
    const astraUsed = turnDispatches.some((d) => String(d.model || '').includes('astra'));
    const settledCost = turnDispatches.reduce((sum, d) => sum + (Number(d.cost) || 0), 0);

    const result = {
      run: RUN,
      qualificationDispatchPolicy: qualificationPolicy.snapshot(),
      prompt: PROMPT,
      httpStatus: res.status,
      status: v2.status || body.status || null,
      terminalReason: v2.terminalReason || null,
      executionDecision: capturedClassification?.understanding?.executionDecision
        || v2.executionContract?.executionDecision
        || v2.understanding?.executionDecision
        || body.executionDecision
        || null,
      clarificationNeeded: v2.executionContract?.clarificationNeeded ?? null,
      allowsCanonicalPlanArtifact: v2.executionContract?.allowsCanonicalPlanArtifact ?? null,
      latencyMs: Date.now() - start,
      attemptCount: attempts.length,
      repairScope: capturedExecution?.telemetrySummary?.subDispatches || [],
      attempts,
      dispatches: turnDispatches.map((d) => ({
        model: d.model,
        purpose: d.purpose,
        reasoning: d.reasoning,
        cost: d.cost,
        providerError: d.providerError || null,
      })),
      astraUsed,
      wholePlanRegenerations: Math.max(0, turnDispatches.filter(d => d.purpose === 'primary_generation').length - 1),
      experienceDiagnostics: capturedExecution?.telemetrySummary?.experienceDiagnostics || null,
      tripQuality: capturedExecution?.telemetrySummary?.tripQuality || null,
      tripQualityReasonCodes: (capturedExecution?.validation?.reasonCodes || []).filter(code => ['excessive_trip_repetition', 'conditional_primary_unsupported'].includes(code)),
      finalNarrative: String(body.content || ''),
      contentPreview: String(body.content || '').slice(0, 400),
      itineraryPresent: Boolean(body.itinerary || plan),
      itineraryHash: body.itineraryHash || plan?.itineraryHash || null,
      savedHashMatches: body.itineraryHash
        ? body.itineraryHash === savedPlan?.itineraryHash
        : null,
      canonicalPlanState: v2.canonicalPlanState || plan?.canonicalPlanState || plan?.status || null,
      planSummary: summarizePlan(plan),
      draftPlanSummary: summarizePlan(draftPlan),
      hasDraftDayIds,
      identityStatuses,
      failureReasons: attempts.flatMap((a) => a.reasons || []).filter(Boolean),
      planningStateKeys: session?.planningState ? Object.keys(session.planningState) : [],
      costSettledUsd: settledCost,
      spentOrReserved,
      cap,
    };

    fs.appendFileSync(JSONL, `${JSON.stringify({ prompt: PROMPT, body, session, execution: capturedExecution, classification: capturedClassification, dispatches: turnDispatches })}\n`);
    fs.appendFileSync(LOG, `${JSON.stringify(result, null, 2)}\n`);
    console.log('ZION_ONE_TURN_RESULT', JSON.stringify(result, null, 2));
    console.log('ZION_ONE_TURN_COST', JSON.stringify({
      calls: turnDispatches.length,
      settledUsd: settledCost,
      spentOrReserved,
      cap,
      astraUsed,
    }));

    if (turnDispatches.some((d) => d.providerError?.code === 'credit_balance_exhausted'
      || d.providerError?.type === 'insufficient_quota')) {
      throw Object.assign(new Error('provider credit exhausted'), { code: 'credit_balance_exhausted' });
    }
  } finally {
    server?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}

main()
  .then(() => {
    console.log('ZION_ONE_TURN_DONE');
    process.exit(0);
  })
  .catch((error) => {
    console.error('ZION_ONE_TURN_FAILED', error.code || error.name, error.message);
    process.exit(1);
  });
