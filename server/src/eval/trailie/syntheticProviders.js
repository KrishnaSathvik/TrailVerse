'use strict';

/**
 * Stage 13 — synthetic provider clients + prose deliverer for the RECORDED and
 * MOCKED evaluation modes.
 *
 * These are NOT a fake pipeline. They only stand in for the network boundary:
 * the synthetic Anthropic/OpenAI clients expose the exact `.messages.create` /
 * `.chat.completions.create` shapes the real structured adapters consume, so the
 * REAL orchestrator, finalizer, verifier, and consistency logic run unchanged.
 *
 * A scenario's `structuredResponses` is a per-attempt QUEUE (the orchestrator may
 * retry once) and `proseResponses` is a per-Phase-B-call queue (verify/enforce may
 * regenerate once). Each entry is a small behavior descriptor:
 *
 *   Structured (Phase A):
 *     { kind: 'complete', itinerary }        valid create_itinerary tool call
 *     { kind: 'missing_tool' }               model answered with prose, no tool
 *     { kind: 'malformed', input? }          tool call with an invalid payload
 *     { kind: 'unknown_tool' }               a tool call that isn't create_itinerary
 *     { kind: 'truncated', itinerary? }      cut off (stop_reason max_tokens)
 *     { kind: 'conflicting', a, b }          two distinct create_itinerary calls
 *     { kind: 'provider_error', message? }   adapter throws → provider_error
 *     { kind: 'timeout', message? }          adapter throws a timeout
 *
 *   Prose (Phase B):
 *     { content }                            normal prose (may carry markers)
 *     { empty: true }                        provider returned nothing
 *     { aborted: true }                      provider failure / abort
 *
 * `usage` (input/output token counts) can be attached to any entry so the cost
 * layer has deterministic numbers to aggregate.
 */

const DEFAULT_USAGE = { inputTokens: 1200, outputTokens: 900 };

function usageFor(entry, fallback = DEFAULT_USAGE) {
  const u = entry && entry.usage ? entry.usage : fallback;
  return { inputTokens: u.inputTokens || 0, outputTokens: u.outputTokens || 0 };
}

/** A queue consumer that repeats the last entry once exhausted. */
function makeQueue(items) {
  const arr = Array.isArray(items) ? items.slice() : [];
  let i = 0;
  return {
    next() {
      if (arr.length === 0) return null;
      const item = arr[Math.min(i, arr.length - 1)];
      i += 1;
      return item;
    },
    get consumed() { return i; },
  };
}

// ── Anthropic synthetic client ──────────────────────────────────────────────

function anthropicResponseFor(entry) {
  const usage = usageFor(entry);
  const anthropicUsage = { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens };

  switch (entry.kind) {
    case 'complete':
      return {
        content: [{ type: 'tool_use', name: 'create_itinerary', input: entry.itinerary, id: 't_ok' }],
        stop_reason: 'tool_use',
        usage: anthropicUsage,
      };
    case 'truncated':
      // Either no tool at all, or an incomplete payload, cut off by max_tokens.
      return {
        content: entry.itinerary
          ? [{ type: 'tool_use', name: 'create_itinerary', input: entry.itinerary, id: 't_trunc' }]
          : [{ type: 'text', text: 'Here is your plan so f' }],
        stop_reason: 'max_tokens',
        usage: anthropicUsage,
      };
    case 'missing_tool':
      return { content: [{ type: 'text', text: 'A day-by-day plan in prose only.' }], stop_reason: 'end_turn', usage: anthropicUsage };
    case 'unknown_tool':
      return { content: [{ type: 'tool_use', name: 'search_web', input: { q: 'x' }, id: 't_unk' }], stop_reason: 'tool_use', usage: anthropicUsage };
    case 'malformed':
      return {
        content: [{ type: 'tool_use', name: 'create_itinerary', input: entry.input || { notDays: true }, id: 't_bad' }],
        stop_reason: 'tool_use',
        usage: anthropicUsage,
      };
    case 'conflicting':
      return {
        content: [
          { type: 'tool_use', name: 'create_itinerary', input: entry.a, id: 't_a' },
          { type: 'tool_use', name: 'create_itinerary', input: entry.b, id: 't_b' },
        ],
        stop_reason: 'tool_use',
        usage: anthropicUsage,
      };
    default:
      return { content: [{ type: 'text', text: '' }], stop_reason: 'end_turn', usage: anthropicUsage };
  }
}

function openaiResponseFor(entry) {
  const usage = usageFor(entry);
  const openaiUsage = { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens };
  const mk = (toolCalls, finish) => ({ choices: [{ message: { tool_calls: toolCalls }, finish_reason: finish }], usage: openaiUsage });
  const call = (name, obj, id) => ({ id, function: { name, arguments: JSON.stringify(obj) } });

  switch (entry.kind) {
    case 'complete':
      return mk([call('create_itinerary', entry.itinerary, 'c_ok')], 'tool_calls');
    case 'truncated':
      return entry.itinerary
        ? mk([call('create_itinerary', entry.itinerary, 'c_trunc')], 'length')
        : mk([{ id: 'c_t', function: { name: 'create_itinerary', arguments: '{"days":[{"id":"day-1' } }], 'length');
    case 'missing_tool':
      return { choices: [{ message: { content: 'Prose plan only.', tool_calls: [] }, finish_reason: 'stop' }], usage: openaiUsage };
    case 'unknown_tool':
      return mk([call('search_web', { q: 'x' }, 'c_unk')], 'tool_calls');
    case 'malformed':
      return mk([call('create_itinerary', entry.input || { notDays: true }, 'c_bad')], 'tool_calls');
    case 'conflicting':
      return mk([call('create_itinerary', entry.a, 'c_a'), call('create_itinerary', entry.b, 'c_b')], 'tool_calls');
    default:
      return { choices: [{ message: { content: '', tool_calls: [] }, finish_reason: 'stop' }], usage: openaiUsage };
  }
}

function shouldThrow(entry) {
  return entry && (entry.kind === 'provider_error' || entry.kind === 'timeout');
}

/**
 * Build a synthetic client pair. Only the client matching `provider` is populated
 * so the real generator's `if (!anthropic)` / `if (!openai)` guards behave exactly
 * as in production.
 */
function makeSyntheticProviders({ provider, structuredResponses = [] } = {}) {
  const queue = makeQueue(structuredResponses);
  const usageLedger = { structuredInputTokens: 0, structuredOutputTokens: 0, attempts: 0 };

  const record = (entry) => {
    usageLedger.attempts += 1;
    const u = usageFor(entry);
    usageLedger.structuredInputTokens += u.inputTokens;
    usageLedger.structuredOutputTokens += u.outputTokens;
  };

  const anthropic = provider === 'claude'
    ? {
        messages: {
          create: async () => {
            const entry = queue.next() || { kind: 'missing_tool' };
            record(entry);
            if (shouldThrow(entry)) {
              const err = new Error(entry.message || (entry.kind === 'timeout' ? 'Request timed out' : 'provider error'));
              err.name = entry.kind === 'timeout' ? 'AbortError' : 'Error';
              throw err;
            }
            return anthropicResponseFor(entry);
          },
        },
      }
    : null;

  const openai = provider === 'openai'
    ? {
        chat: {
          completions: {
            create: async () => {
              const entry = queue.next() || { kind: 'missing_tool' };
              record(entry);
              if (shouldThrow(entry)) {
                const err = new Error(entry.message || (entry.kind === 'timeout' ? 'Request timed out' : 'provider error'));
                err.name = entry.kind === 'timeout' ? 'AbortError' : 'Error';
                throw err;
              }
              return openaiResponseFor(entry);
            },
          },
        },
      }
    : null;

  return { anthropic, openai, usageLedger };
}

/**
 * Phase B prose deliverer over a fixed queue. Returns the exact
 * `{content, provider, model, usage, aborted}` shape the seam expects and records
 * per-call token usage for the cost layer.
 */
function makeSyntheticProseDeliverer({ provider, model, proseResponses = [] } = {}) {
  const queue = makeQueue(proseResponses);
  const ledger = { calls: 0, proseInputTokens: 0, proseOutputTokens: 0, retryInputTokens: 0, retryOutputTokens: 0 };

  const deliverProse = async () => {
    const entry = queue.next() || { empty: true };
    const isRetry = ledger.calls >= 1;
    ledger.calls += 1;
    const u = usageFor(entry, { inputTokens: 1500, outputTokens: 700 });
    if (isRetry) { ledger.retryInputTokens += u.inputTokens; ledger.retryOutputTokens += u.outputTokens; }
    else { ledger.proseInputTokens += u.inputTokens; ledger.proseOutputTokens += u.outputTokens; }

    if (entry.aborted) return { aborted: true };
    if (entry.empty) return { content: '', provider, model, usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens } };
    return { content: entry.content, provider, model, usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens } };
  };

  return { deliverProse, ledger };
}

module.exports = {
  makeQueue,
  makeSyntheticProviders,
  makeSyntheticProseDeliverer,
  anthropicResponseFor,
  openaiResponseFor,
};
