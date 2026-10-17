'use strict';

const express = require('express');
const { webhookConfigured, readConfig } = require('../config/beehiiv');
const { verifyBeehiivWebhook } = require('../services/beehiivWebhook');
const { applyRemoteUnsubscribe } = require('../services/beehiivSync');

function occurredAtFromPayload(payload) {
  const seconds = payload && payload.event_timestamp;
  if (!seconds) return new Date();
  const ms = Number(seconds) * 1000;
  return Number.isFinite(ms) ? new Date(ms) : new Date();
}

function isUnsubscribeEvent(payload) {
  return payload && payload.event_type === 'subscription.deleted';
}

async function handleBeehiivWebhook(req, res) {
  if (!webhookConfigured()) {
    return res.status(401).json({ success: false, error: 'Webhook is not configured.' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const verified = verifyBeehiivWebhook({
    secret: readConfig().webhookSecret,
    headers: req.headers,
    rawBody,
  });

  if (!verified.ok) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid payload.' });
  }

  if (!isUnsubscribeEvent(payload)) {
    return res.status(200).json({ success: true, ignored: true });
  }

  const data = payload.data || {};
  await applyRemoteUnsubscribe({
    email: data.email,
    beehiivSubscriberId: data.id,
    occurredAt: occurredAtFromPayload(payload),
  });

  return res.status(200).json({ success: true });
}

const router = express.Router();
router.post('/', handleBeehiivWebhook);

module.exports = router;
