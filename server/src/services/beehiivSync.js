'use strict';

const Subscriber = require('../models/Subscriber');
const beehiivService = require('./beehiivService');

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function isSubscribed(doc) {
  return Subscriber.effectiveStatus(doc) === 'subscribed';
}

async function markSync(doc, fields) {
  Object.assign(doc, fields);
  await doc.save();
  return doc;
}

async function syncSubscriber(subscriber) {
  if (!subscriber || !isSubscribed(subscriber)) {
    return { synced: false, reason: 'not_subscribed' };
  }

  if (!beehiivService.isConfigured()) {
    return { synced: false, reason: 'not_configured' };
  }

  if (subscriber.beehiivSyncStatus === 'synced' && subscriber.beehiivSubscriberId) {
    return { synced: true, reason: 'already_synced' };
  }

  try {
    const result = await beehiivService.upsertSubscriber({
      email: subscriber.email,
      source: subscriber.source,
      utmSource: subscriber.utmSource,
      utmMedium: subscriber.utmMedium,
      utmCampaign: subscriber.utmCampaign,
      pagePath: subscriber.pagePath,
    });

    if (result.skipped) {
      return { synced: false, reason: 'not_configured' };
    }

    const remote = result.subscriber || {};
    await markSync(subscriber, {
      beehiivSubscriberId: remote.id || subscriber.beehiivSubscriberId,
      beehiivSyncedAt: new Date(),
      beehiivSyncStatus: 'synced',
      beehiivSyncError: undefined,
    });
    return { synced: true, reason: 'synced' };
  } catch (err) {
    await markSync(subscriber, {
      beehiivSyncStatus: 'failed',
      beehiivSyncError: beehiivService.errorCode(err),
    }).catch(() => {});
    return { synced: false, reason: 'failed' };
  }
}

async function unsubscribeSubscriber(subscriber) {
  if (!subscriber) return { ok: false, reason: 'missing' };
  if (!beehiivService.isConfigured()) {
    return { ok: true, skipped: true };
  }

  try {
    await beehiivService.unsubscribeSubscriber(subscriber.email);
    await markSync(subscriber, {
      beehiivSyncStatus: 'synced',
      beehiivSyncedAt: new Date(),
      beehiivSyncError: undefined,
    });
    return { ok: true };
  } catch (err) {
    await markSync(subscriber, {
      beehiivSyncStatus: 'unsubscribe_failed',
      beehiivSyncError: beehiivService.errorCode(err),
    }).catch(() => {});
    return { ok: false, reason: 'failed' };
  }
}

async function findUnsyncedSubscribed() {
  return Subscriber.find({
    status: 'subscribed',
    beehiivSyncStatus: { $ne: 'synced' },
  }).lean();
}

async function applyRemoteUnsubscribe({ email, beehiivSubscriberId, occurredAt } = {}) {
  const clauses = [];
  const normalized = normalizeEmail(email);
  if (normalized) clauses.push({ email: normalized });
  if (beehiivSubscriberId) clauses.push({ beehiivSubscriberId });
  if (clauses.length === 0) return { updated: false };

  const subscriber = await Subscriber.findOne({ $or: clauses });
  if (!subscriber) return { updated: false };
  if (subscriber.status === 'suppressed') return { updated: false, reason: 'suppressed' };
  if (subscriber.status === 'unsubscribed') return { updated: false, reason: 'already_unsubscribed' };
  if (subscriber.status !== 'subscribed') return { updated: false, reason: 'not_subscribed' };

  subscriber.status = 'unsubscribed';
  subscriber.unsubscribedAt = occurredAt || new Date();
  subscriber.confirmed = false;
  await subscriber.save();
  return { updated: true };
}

module.exports = {
  syncSubscriber,
  unsubscribeSubscriber,
  findUnsyncedSubscribed,
  applyRemoteUnsubscribe,
};
