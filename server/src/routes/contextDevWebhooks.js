'use strict';

/**
 * POST /api/webhooks/context-dev — Context.dev monitor events.
 * Mounted with express.raw BEFORE express.json so the signature is checked
 * against the exact bytes Context.dev signed.
 */

const express = require('express');
const { verifyContextDevSignature, handleContextDevEvent } = require('../services/contextDev/contextDevWebhook');

/**
 * Every Context.dev monitor has its OWN signing secret, even on a shared
 * receiver URL. `CONTEXT_DEV_WEBHOOK_SECRETS` holds them comma-separated
 * (printed by `scripts/context-dev-monitors.js sync`); a request is accepted
 * if it verifies against any of them.
 */
function configuredSecrets(env = process.env) {
  return [env.CONTEXT_DEV_WEBHOOK_SECRETS, env.CONTEXT_DEV_WEBHOOK_SECRET]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function createContextDevWebhookHandler({ secrets = () => configuredSecrets(), handle = handleContextDevEvent, log = console } = {}) {
  return async function contextDevWebhook(req, res) {
    const signingSecrets = secrets();
    if (!signingSecrets.length) return res.status(503).json({ success: false, error: 'Webhook is not configured.' });

    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    const header = req.get('X-Context-Signature') || '';
    if (!rawBody || !signingSecrets.some((secret) => verifyContextDevSignature(rawBody, header, secret))) {
      return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid payload.' });
    }
    if (!event || typeof event.id !== 'string' || event.id !== req.get('X-Context-Id')
      || typeof event.event !== 'string' || event.event !== req.get('X-Context-Event')) {
      return res.status(400).json({ success: false, error: 'Invalid event envelope.' });
    }

    try {
      const outcome = await handle(event);
      log.info?.('[context-dev webhook]', { eventId: event.id, event: event.event, ...outcome });
      return res.status(200).json({ success: true, action: outcome.action });
    } catch (error) {
      // 5xx → Context.dev retries; invalidation is idempotent.
      log.error?.('[context-dev webhook] handling failed', { eventId: event.id, message: error?.message });
      return res.status(503).json({ success: false, error: 'Could not process event.' });
    }
  };
}

const router = express.Router();
router.post('/', createContextDevWebhookHandler());

module.exports = router;
module.exports.createContextDevWebhookHandler = createContextDevWebhookHandler;
module.exports.configuredSecrets = configuredSecrets;
