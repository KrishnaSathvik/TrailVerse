'use strict';
const fs = require('fs');
const path = require('path');
const { resolveModelPrice } = require('../config/trailiePricingRegistry');
const { priceProviderCall } = require('./trailieTurnLedger');
const { normalizeUsage } = require('./providers/openaiResponsesAdapter');

function createCanaryBudget(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'budget.json');
  const lock = path.join(directory, 'turn.lock');
  const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { turns: 0, chargedMicros: 0, active: false, stopped: false, calls: [] };
  const write = state => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.renameSync(`${file}.tmp`, file); };
  return {
    status: read,
    begin(ownerId) {
      const fd = fs.openSync(lock, 'wx', 0o600); fs.closeSync(fd);
      try {
        const state = read();
        if (state.active || state.stopped || state.turns >= 6 || state.chargedMicros >= 150000
          || state.ownerId && state.ownerId !== ownerId) throw new Error('canary_closed');
        Object.assign(state, { ownerId, turns: state.turns + 1, active: true }); write(state); return state.turns;
      } catch (error) { fs.unlinkSync(lock); throw error; }
    },
    reserve(body) {
      const state = read();
      if (!state.active || state.stopped || body.model !== 'gpt-6-sol') throw new Error('canary_dispatch_denied');
      const price = resolveModelPrice({ provider: 'openai', model: body.model, at: new Date() });
      if (!price) throw new Error('canary_unpriced_model');
      // One token per UTF-8 byte is conservative for text/tool JSON. Add framing
      // headroom; cached input is charged at the highest input rate for admission.
      const inputBound = Buffer.byteLength(JSON.stringify(body), 'utf8') + 4096;
      const inputRate = Math.max(price.inputPerMillion, price.cacheWritePerMillion || 0);
      const remaining = 150000 - state.chargedMicros;
      const outputCap = Math.min(body.max_output_tokens, 4000, Math.floor((remaining - inputBound * inputRate) / price.outputPerMillion));
      if (outputCap < 512) throw new Error('canary_budget_exhausted');
      const reserve = Math.ceil(inputBound * inputRate + outputCap * price.outputPerMillion);
      const id = state.calls.length;
      state.calls.push({ id, status: 'reserved', reserveMicros: reserve, inputBound, outputCap, model: body.model });
      state.chargedMicros += reserve; write(state);
      return { id, body: { ...body, max_output_tokens: outputCap } };
    },
    settle(id, raw) {
      const state = read(), row = state.calls[id];
      const usage = normalizeUsage(raw.usage);
      const priced = priceProviderCall({ provider: 'openai', model: row.model, usage });
      if (priced.costStatus !== 'priced' || usage.inputTokens > row.inputBound || usage.outputTokens > row.outputCap) {
        row.status = 'unknown_cost_stop'; state.stopped = true; write(state); throw new Error('canary_cost_unknown');
      }
      const actual = Math.ceil(priced.costUsd * 1000000);
      if (actual > row.reserveMicros) { state.stopped = true; write(state); throw new Error('canary_price_bound_violation'); }
      state.chargedMicros += actual - row.reserveMicros;
      Object.assign(row, { status: 'settled', usage, costUsd: priced.costUsd, chargedMicros: actual }); write(state);
    },
    end(failed) {
      const state = read(); state.active = false;
      state.stopped = state.stopped || failed || state.calls.some(c => c.status !== 'settled');
      write(state); if (fs.existsSync(lock)) fs.unlinkSync(lock);
    },
  };
}
module.exports = { createCanaryBudget };
