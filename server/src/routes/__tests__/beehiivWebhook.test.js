'use strict';

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const Subscriber = require('../../models/Subscriber');

const SECRET = `whsec_${Buffer.from('test-webhook-secret-bytes').toString('base64')}`;

function sign(rawBody, timestamp = Math.floor(Date.now() / 1000), id = 'msg_unsub') {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const digest = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${digest}`,
  };
}

function createApp() {
  const app = express();
  app.use('/api/webhooks/beehiiv', express.raw({ type: 'application/json' }), require('../beehiivWebhooks'));
  return app;
}

describe('Beehiiv webhook unsubscribe', () => {
  beforeEach(() => {
    process.env.BEEHIIV_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.BEEHIIV_WEBHOOK_SECRET;
  });

  test('invalid webhook/auth is rejected', async () => {
    const app = createApp();
    const body = JSON.stringify({
      event_type: 'subscription.deleted',
      data: { email: 'ghost@example.com', id: 'sub_1' },
    });
    const res = await request(app)
      .post('/api/webhooks/beehiiv')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_bad')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,not-a-real-signature')
      .send(body);

    expect(res.status).toBe(401);
  });

  test('Beehiiv webhook unsubscribe updates Subscriber', async () => {
    const app = createApp();
    await Subscriber.create({
      email: 'remote-unsub@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
      beehiivSubscriberId: 'sub_00000000-0000-0000-0000-000000000000',
      beehiivSyncStatus: 'synced',
    });

    const body = JSON.stringify({
      event_type: 'subscription.deleted',
      event_timestamp: 1666800076,
      uid: 'evt_1',
      data: {
        id: 'sub_00000000-0000-0000-0000-000000000000',
        email: 'remote-unsub@example.com',
        status: 'inactive',
      },
    });
    const headers = sign(body);
    const res = await request(app)
      .post('/api/webhooks/beehiiv')
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);

    expect(res.status).toBe(200);
    const row = await Subscriber.findOne({ email: 'remote-unsub@example.com' }).lean();
    expect(row.status).toBe('unsubscribed');
    expect(row.unsubscribedAt).toBeTruthy();
  });

  test('webhook duplicate is idempotent', async () => {
    const app = createApp();
    await Subscriber.create({
      email: 'dup-unsub@example.com',
      status: 'unsubscribed',
      unsubscribedAt: new Date('2026-01-01T00:00:00.000Z'),
      confirmed: false,
      source: 'newsletter-page',
      beehiivSubscriberId: 'sub_dup',
    });

    const body = JSON.stringify({
      event_type: 'subscription.deleted',
      uid: 'evt_dup',
      data: { id: 'sub_dup', email: 'dup-unsub@example.com' },
    });
    const headers = sign(body, Math.floor(Date.now() / 1000), 'msg_dup');

    const first = await request(app).post('/api/webhooks/beehiiv').set('Content-Type', 'application/json').set(headers).send(body);
    const second = await request(app).post('/api/webhooks/beehiiv').set('Content-Type', 'application/json').set(headers).send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const row = await Subscriber.findOne({ email: 'dup-unsub@example.com' }).lean();
    expect(row.status).toBe('unsubscribed');
    expect(new Date(row.unsubscribedAt).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
