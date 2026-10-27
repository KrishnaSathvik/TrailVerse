'use strict';

/**
 * Non-blocking Trailie spend monitoring.
 *
 * After every model-first turn that reached the runtime (complete or not), the
 * turn's model cost and tokens are added to per-user (signed-in only) and
 * aggregate UTC-day counters. When a counter first crosses its configured
 * threshold, exactly one operational alert is emitted for that
 * scope/metric/day, across all instances (atomic claim on `alerts.<metric>`).
 *
 * This module is observability only: it is invoked fire-and-forget after the
 * runtime returns, swallows its own errors, and nothing on the admission path
 * reads these counters. It is NOT a quota.
 */

const { getTrailieFairUseConfig } = require('../config/trailieFairUse');

const SPEND_RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function turnUsage(telemetry = {}) {
  const calls = Array.isArray(telemetry.calls) ? telemetry.calls : [];
  const tokens = calls.reduce((sum, call) => sum
    + (Number(call?.usage?.inputTokens) || 0) + (Number(call?.usage?.outputTokens) || 0), 0);
  const costUsd = telemetry.costStatus === 'priced' && Number.isFinite(Number(telemetry.modelCostUsd))
    ? Number(telemetry.modelCostUsd) : null;
  return { tokens, costUsd };
}

function defaultEmail({ to, alert }) {
  const { getResendClient } = require('./resendEmailService');
  const client = getResendClient();
  const subject = `[TrailVerse] Trailie ${alert.scope} daily ${alert.metric} threshold crossed (${alert.day})`;
  const lines = [
    `Scope: ${alert.scope}`,
    alert.userId ? `User id: ${alert.userId}` : null,
    alert.principalHash ? `Principal hash: ${alert.principalHash}` : null,
    `Day (UTC): ${alert.day}`,
    `Metric: ${alert.metric}`,
    `Value: ${alert.value}`,
    `Threshold: ${alert.threshold}`,
    `Turns today: ${alert.turns} (unpriced: ${alert.unpricedTurns})`,
    '',
    'Observability only: no user was blocked or throttled by this alert.',
  ].filter(line => line !== null);
  return client.emails.send({
    from: `${process.env.EMAIL_FROM_NAME || 'TrailVerse'} <${process.env.EMAIL_FROM_ADDRESS || 'noreply@nationalparksexplorerusa.com'}>`,
    to: [to],
    subject,
    text: lines.join('\n'),
    tags: [{ name: 'category', value: 'trailie-cost-alert' }],
  });
}

function defaultEmitAlert(alert, { emailTo, sendEmail = defaultEmail } = {}) {
  // Structured, greppable line in the Render log stream — always emitted.
  console.error('[Trailie cost_alert]', JSON.stringify(alert));
  if (!emailTo) return;
  Promise.resolve()
    .then(() => sendEmail({ to: emailTo, alert }))
    .catch(error => console.warn('[Trailie cost_alert] email failed', { code: error?.code || 'email_failed' }));
}

function createCostMonitor({
  SpendModel = require('../models/TrailieSpendDaily'),
  hashPrincipal = require('./trailieTurnLedger').hashPrincipal,
  now = () => Date.now(),
  config = () => getTrailieFairUseConfig(),
  emitAlert = null,
} = {}) {
  async function bump(id, base, delta, at) {
    const update = {
      $inc: { costUsd: delta.costUsd || 0, tokens: delta.tokens, turns: 1, unpricedTurns: delta.costUsd == null ? 1 : 0 },
      $setOnInsert: { ...base, expiresAt: new Date(at + SPEND_RETENTION_MS) },
    };
    try {
      return await SpendModel.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true, lean: true });
    } catch (error) {
      // Two instances racing the first upsert of the day: one loses on _id.
      if (error?.code !== 11000) throw error;
      return SpendModel.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true, lean: true });
    }
  }

  async function maybeAlert(doc, metric, value, threshold, extra, cfg, at) {
    if (!(threshold > 0) || !(value >= threshold) || doc.alerts?.[metric]) return false;
    const claimed = await SpendModel.updateOne({ _id: doc._id, [`alerts.${metric}`]: null },
      { $set: { [`alerts.${metric}`]: new Date(at) } });
    if (claimed.modifiedCount !== 1) return false;
    const alert = {
      type: 'trailie_cost_threshold', scope: doc.scope, metric, day: doc.day,
      value: metric === 'cost' ? Number(value.toFixed(4)) : value, threshold,
      turns: doc.turns, unpricedTurns: doc.unpricedTurns,
      principalHash: doc.principalHash || null, ...extra,
    };
    (emitAlert || (a => defaultEmitAlert(a, { emailTo: cfg.alertEmailTo })))(alert);
    return true;
  }

  /** Never throws; returns the alerts emitted (for tests/diagnostics). */
  async function recordTurnSpend({ userId = null, telemetry } = {}) {
    const emitted = [];
    try {
      if (!telemetry) return emitted;
      const cfg = config();
      const at = now();
      const day = utcDay(at);
      const delta = turnUsage(telemetry);
      if (!delta.tokens && delta.costUsd == null) return emitted;
      if (userId) {
        const principalHash = hashPrincipal(String(userId));
        const doc = await bump(`user:${principalHash}:${day}`, { scope: 'user', principalHash, day }, delta, at);
        if (await maybeAlert(doc, 'cost', doc.costUsd, cfg.alertUserDailyUsd, { userId: String(userId) }, cfg, at)) emitted.push(`user:cost`);
        if (await maybeAlert(doc, 'tokens', doc.tokens, cfg.alertUserDailyTokens, { userId: String(userId) }, cfg, at)) emitted.push(`user:tokens`);
      }
      const agg = await bump(`aggregate:all:${day}`, { scope: 'aggregate', principalHash: null, day }, delta, at);
      if (await maybeAlert(agg, 'cost', agg.costUsd, cfg.alertAggregateDailyUsd, {}, cfg, at)) emitted.push('aggregate:cost');
      if (await maybeAlert(agg, 'tokens', agg.tokens, cfg.alertAggregateDailyTokens, {}, cfg, at)) emitted.push('aggregate:tokens');
    } catch (error) {
      console.warn('[Trailie cost_monitor] spend record failed', { code: error?.code || error?.message || 'spend_record_failed' });
    }
    return emitted;
  }

  return { recordTurnSpend };
}

module.exports = { createCostMonitor, turnUsage, utcDay, defaultEmitAlert };
