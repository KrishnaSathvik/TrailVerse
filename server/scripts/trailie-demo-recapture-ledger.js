'use strict';

/**
 * Provider ledger for the /trailie-demo re-capture review run.
 *
 * Loaded with `node -r` so the transport tee is installed before any provider
 * module can be imported. It records one row per Anthropic request, reading the
 * usage the provider itself reports, and prices it through the repository's
 * versioned pricing config — never an invented rate.
 *
 * This is a SEPARATE ledger. It writes only to its own candidate directory and
 * never reads, merges with, or touches the Stage 14.7 / 14.8 historical ledgers.
 *
 * A safety ceiling refuses dispatch beyond a bounded envelope for this run. It
 * is a backstop against a runaway loop, not a budget target — the five reviewed
 * turns are expected to sit far below it.
 *
 * Retains no prompt text, no response prose, no credential and no Authorization
 * header: only model, phase shape, token counts and timing.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = process.env.TRAILIE_DEMO_LEDGER_DIR
  || path.resolve(__dirname, '..', '..', 'artifacts', 'trailie-demo-recapture-candidates');
fs.mkdirSync(OUT_DIR, { recursive: true });

const LEDGER_PATH = path.join(OUT_DIR, 'provider-ledger.json');
const CEILING = {
  maxRequests: Number(process.env.TRAILIE_DEMO_MAX_REQUESTS || 30),
  maxCostUsd: Number(process.env.TRAILIE_DEMO_MAX_COST_USD || 4),
};

const { estimateCostUsd } = require('../src/eval/trailie/pricing');

const rows = [];
let refusals = 0;

function classifyPurpose(body) {
  if (Array.isArray(body?.tools) && body.tools.some((tool) => tool?.name === 'create_itinerary')) {
    return 'structured_itinerary';
  }
  const system = Array.isArray(body?.system)
    ? body.system.map((item) => item?.text || '').join(' ')
    : String(body?.system || '');
  if (/Pick ONE web-search category/i.test(system)) return 'intent_classification';
  if (/brief factual digest for Trailie/i.test(system)) return 'fact_processing';
  if (/JSON extraction tool|Extract the structured itinerary/i.test(system)) return 'destination_extraction';
  if (/consistency|matches the frozen|verified itinerary/i.test(system)) return 'consistency_check';
  return 'prose';
}

/** Current label for attributing rows to a scenario turn, set by the driver. */
function currentLabel() {
  try {
    const marker = path.join(OUT_DIR, '.current-turn');
    return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : 'unattributed';
  } catch {
    return 'unattributed';
  }
}

function totals() {
  return rows.reduce(
    (acc, row) => ({
      requests: acc.requests + 1,
      usageKnownRequests: acc.usageKnownRequests + (Number.isFinite(row.actualInputTokens) && Number.isFinite(row.actualOutputTokens) ? 1 : 0),
      usageUnknownRequests: acc.usageUnknownRequests + (Number.isFinite(row.actualInputTokens) && Number.isFinite(row.actualOutputTokens) ? 0 : 1),
      inputTokens: acc.inputTokens + (row.inputTokens || 0),
      outputTokens: acc.outputTokens + (row.outputTokens || 0),
      costUsd: Number((acc.costUsd + (row.costUsd || 0)).toFixed(6)),
    }),
    { requests: 0, usageKnownRequests: 0, usageUnknownRequests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  );
}

function writeLedger() {
  const perTurn = {};
  for (const row of rows) {
    const t = (perTurn[row.turn] ||= { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    t.requests += 1;
    t.inputTokens += row.inputTokens || 0;
    t.outputTokens += row.outputTokens || 0;
    t.costUsd = Number((t.costUsd + (row.costUsd || 0)).toFixed(6));
  }

  fs.writeFileSync(
    LEDGER_PATH,
    `${JSON.stringify(
      {
        ledgerId: 'trailie-demo-recapture',
        note: 'Independent of the Stage 14.7 and Stage 14.8 ledgers. Not merged with them.',
        generatedAt: new Date().toISOString(),
        ceiling: CEILING,
        refusals,
        totals: totals(),
        perTurn,
        rows,
      },
      null,
      2
    )}\n`
  );
}

/** Reads token usage out of a streaming SSE body or a JSON body. */
function parseUsage(text) {
  const usage = { inputTokens: null, outputTokens: null, cacheCreation: null, cacheRead: null };
  let model = null;

  if (text.includes('event:') || text.includes('data:')) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (event.type === 'message_start' && event.message) {
        model = event.message.model || model;
        const u = event.message.usage || {};
        if (Number.isFinite(u.input_tokens)) usage.inputTokens = u.input_tokens;
        if (Number.isFinite(u.output_tokens)) usage.outputTokens = u.output_tokens;
        if (Number.isFinite(u.cache_creation_input_tokens)) usage.cacheCreation = u.cache_creation_input_tokens;
        if (Number.isFinite(u.cache_read_input_tokens)) usage.cacheRead = u.cache_read_input_tokens;
      }
      if (event.type === 'message_delta' && Number.isFinite(event.usage?.output_tokens)) {
        usage.outputTokens = event.usage.output_tokens;
      }
    }
    return { usage, model };
  }

  try {
    const body = JSON.parse(text);
    const u = body.usage || {};
    return {
      usage: {
        inputTokens: Number.isFinite(u.input_tokens) ? u.input_tokens : null,
        outputTokens: Number.isFinite(u.output_tokens) ? u.output_tokens : null,
        cacheCreation: Number.isFinite(u.cache_creation_input_tokens) ? u.cache_creation_input_tokens : null,
        cacheRead: Number.isFinite(u.cache_read_input_tokens) ? u.cache_read_input_tokens : null,
      },
      model: body.model || null,
    };
  } catch {
    return { usage, model };
  }
}

const originalFetch = global.fetch;

global.fetch = async function trailieDemoLedgerFetch(input, init) {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (!/^https:\/\/api\.anthropic\.com\//.test(url)) {
    return originalFetch.call(this, input, init);
  }

  const running = totals();
  if (running.requests >= CEILING.maxRequests || running.costUsd >= CEILING.maxCostUsd) {
    refusals += 1;
    writeLedger();
    throw Object.assign(new Error('trailie_demo_ledger_ceiling'), { code: 'trailie_demo_ledger_ceiling' });
  }

  let requestModel = null;
  let toolCount = 0;
  let purpose = 'prose';
  try {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    requestModel = body.model || null;
    toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
    purpose = classifyPurpose(body);
  } catch {
    /* unparseable body keeps nulls */
  }

  const startedAt = Date.now();
  const response = await originalFetch.call(this, input, init);

  const row = {
    turn: currentLabel(),
    at: new Date(startedAt).toISOString(),
    phase: purpose,
    purpose,
    provider: 'claude',
    requestModel,
    httpStatus: response.status,
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    actualInputTokens: null,
    actualOutputTokens: null,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: null,
    costUsd: null,
    costBasis: null,
  };
  rows.push(row);
  writeLedger();

  // Read a clone so the application's stream is untouched.
  const cloned = response.clone();
  cloned
    .text()
    .then((text) => {
      const { usage, model } = parseUsage(text);
      row.durationMs = Date.now() - startedAt;
      row.inputTokens = usage.inputTokens;
      row.outputTokens = usage.outputTokens;
      row.actualInputTokens = usage.inputTokens;
      row.actualOutputTokens = usage.outputTokens;
      row.responseModel = model || requestModel;

      row.cacheCreationInputTokens = usage.cacheCreation;
      row.cacheReadInputTokens = usage.cacheRead;

      // Prompt caching splits input tokens across fields the versioned config
      // does not price, so `estimateCostUsd` correctly returns cost_unknown.
      // Rather than report nothing, bill every cached token at the full input
      // rate — an over-estimate, never an under-estimate, and labelled as such.
      const usageKnown = Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens);
      if (!usageKnown) {
        row.costBasis = 'usage_unknown';
        row.costUsd = null;
        writeLedger();
        return;
      }

      const billableInput = usage.inputTokens + (usage.cacheCreation || 0) + (usage.cacheRead || 0);

      const priced = estimateCostUsd({
        model: row.responseModel,
        inputTokens: billableInput,
        outputTokens: usage.outputTokens || 0,
        atDate: new Date(startedAt),
      });

      if (Number.isFinite(priced)) {
        row.costUsd = Number(priced.toFixed(6));
        row.costBasis =
          usage.cacheCreation || usage.cacheRead
            ? 'versioned_config_conservative_cache_at_full_input_rate'
            : 'versioned_config';
      } else {
        row.costBasis = String(priced);
      }
      writeLedger();
    })
    .catch(() => {
      row.costBasis = 'usage_unreadable';
      writeLedger();
    });

  return response;
};

process.on('exit', writeLedger);
console.log(`[trailie-demo-ledger] installed → ${LEDGER_PATH} (ceiling ${CEILING.maxRequests} req / $${CEILING.maxCostUsd})`);
