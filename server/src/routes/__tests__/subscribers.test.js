'use strict';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Subscriber = require('../../models/Subscriber');
const { GENERIC_SUBSCRIBE_MESSAGE } = require('../../constants/subscriberStatus');
const { migrateSubscriberStatus } = require('../../services/subscriberMigration');
const { eraseAccountData } = require('../../services/accountErasureService');

jest.mock('../../services/resendEmailService', () => ({
  sendNewsletterConfirmation: jest.fn().mockResolvedValue(undefined),
}));

const resendEmailService = require('../../services/resendEmailService');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/subscribers', require('../subscribers'));
  return app;
}

async function postSubscribe(app, body, headers = {}) {
  const req = request(app).post('/api/subscribers').send(body);
  Object.entries(headers).forEach(([key, value]) => req.set(key, value));
  return req;
}

describe('POST /api/subscribers and confirmation', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('valid signup creates a pending Subscriber', async () => {
    const res = await postSubscribe(app, {
      email: 'new@example.com',
      source: 'newsletter-page',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe(GENERIC_SUBSCRIBE_MESSAGE);

    const row = await Subscriber.findOne({ email: 'new@example.com' }).lean();
    expect(row.status).toBe('pending');
    expect(row.confirmed).toBe(false);
    expect(row.confirmedAt).toBeFalsy();
    expect(row.consentVersion).toBe('where-next-v1');
    expect(resendEmailService.sendNewsletterConfirmation).toHaveBeenCalledTimes(1);
  });

  test('invalid email is rejected', async () => {
    const res = await postSubscribe(app, { email: 'not-an-email', source: 'newsletter-page' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(await Subscriber.countDocuments()).toBe(0);
    expect(resendEmailService.sendNewsletterConfirmation).not.toHaveBeenCalled();
  });

  test('newsletter-page is an accepted source', async () => {
    const res = await postSubscribe(app, {
      email: 'page@example.com',
      source: 'newsletter-page',
    });
    expect(res.status).toBe(201);
    const row = await Subscriber.findOne({ email: 'page@example.com' }).lean();
    expect(row.source).toBe('newsletter-page');
  });

  test('blog-footer is an accepted source', async () => {
    const res = await postSubscribe(app, {
      email: 'footer@example.com',
      source: 'blog-footer',
    });
    expect(res.status).toBe(201);
    const row = await Subscriber.findOne({ email: 'footer@example.com' }).lean();
    expect(row.source).toBe('blog-footer');
  });

  test('attribution metadata persists', async () => {
    const res = await postSubscribe(app, {
      email: 'attr@example.com',
      source: 'blog-inline',
      sourceDetail: 'glacier-2026',
      pagePath: '/blog/glacier-2026',
      parkCode: 'glac',
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: 'where_next_launch',
      ignoredFutureField: 'ok',
    });
    expect(res.status).toBe(201);
    const row = await Subscriber.findOne({ email: 'attr@example.com' }).lean();
    expect(row.source).toBe('blog-inline');
    expect(row.sourceDetail).toBe('glacier-2026');
    expect(row.pagePath).toBe('/blog/glacier-2026');
    expect(row.parkCode).toBe('glac');
    expect(row.utmSource).toBe('instagram');
    expect(row.utmMedium).toBe('social');
    expect(row.utmCampaign).toBe('where_next_launch');
    expect(row.ignoredFutureField).toBeUndefined();
  });

  test('duplicate pending signup resends confirmation and does not create a second row', async () => {
    await postSubscribe(app, { email: 'dup-pending@example.com', source: 'homepage' });
    const first = await Subscriber.findOne({ email: 'dup-pending@example.com' }).lean();

    const res = await postSubscribe(app, {
      email: 'dup-pending@example.com',
      source: 'homepage',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await Subscriber.countDocuments({ email: 'dup-pending@example.com' })).toBe(1);
    expect(resendEmailService.sendNewsletterConfirmation).toHaveBeenCalledTimes(2);

    const second = await Subscriber.findOne({ email: 'dup-pending@example.com' }).lean();
    expect(String(second._id)).toBe(String(first._id));
    expect(second.status).toBe('pending');
  });

  test('duplicate subscribed signup is handled safely without sending another email', async () => {
    await Subscriber.create({
      email: 'already@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
    });

    const res = await postSubscribe(app, {
      email: 'already@example.com',
      source: 'newsletter-page',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(resendEmailService.sendNewsletterConfirmation).not.toHaveBeenCalled();
    const row = await Subscriber.findOne({ email: 'already@example.com' }).lean();
    expect(row.status).toBe('subscribed');
  });

  test('confirmation token confirms a pending Subscriber and sets confirmedAt', async () => {
    await postSubscribe(app, { email: 'confirm-me@example.com', source: 'newsletter-page' });
    const pending = await Subscriber.findOne({ email: 'confirm-me@example.com' });

    const res = await request(app)
      .get(`/api/subscribers/confirm/${pending.confirmToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/newsletter?subscribed=true');

    const confirmed = await Subscriber.findOne({ email: 'confirm-me@example.com' }).lean();
    expect(confirmed.status).toBe('subscribed');
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.confirmedAt).toBeTruthy();
  });

  test('invalid confirmation token is rejected', async () => {
    const res = await request(app)
      .get('/api/subscribers/confirm/not-a-real-token')
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/newsletter?subscribe_error=invalid');
  });

  test('expired confirmation token is rejected', async () => {
    const expired = await Subscriber.create({
      email: 'expired@example.com',
      status: 'pending',
      confirmed: false,
      source: 'newsletter-page',
      confirmToken: 'expired-token',
      confirmTokenExpires: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .get(`/api/subscribers/confirm/${expired.confirmToken}`)
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/newsletter?subscribe_error=expired');

    const row = await Subscriber.findOne({ email: 'expired@example.com' }).lean();
    expect(row.status).toBe('pending');
    expect(row.confirmed).toBe(false);
  });

  test('confirmation cannot create a duplicate subscriber', async () => {
    const pending = await Subscriber.create({
      email: 'once@example.com',
      status: 'pending',
      confirmed: false,
      source: 'newsletter-page',
      confirmToken: 'confirm-once',
      confirmTokenExpires: new Date(Date.now() + 60_000),
    });

    await request(app).get(`/api/subscribers/confirm/${pending.confirmToken}`).redirects(0);
    await request(app).get(`/api/subscribers/confirm/${pending.confirmToken}`).redirects(0);

    expect(await Subscriber.countDocuments({ email: 'once@example.com' })).toBe(1);
    const row = await Subscriber.findOne({ email: 'once@example.com' }).lean();
    expect(row.status).toBe('subscribed');
  });

  test('unsubscribe updates state rather than deleting', async () => {
    const sub = await Subscriber.create({
      email: 'leave@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
      unsubscribeToken: 'leave-token',
    });

    const res = await request(app)
      .get(`/api/subscribers/unsubscribe/${sub.unsubscribeToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/newsletter?unsubscribed=true');
    const row = await Subscriber.findOne({ email: 'leave@example.com' });
    expect(row).not.toBeNull();
    expect(row.status).toBe('unsubscribed');
    expect(row.unsubscribedAt).toBeTruthy();
  });

  test('unsubscribe works without a User account', async () => {
    const sub = await Subscriber.create({
      email: 'no-account@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'blog-footer',
      unsubscribeToken: 'no-user-token',
    });

    expect(await User.findOne({ email: 'no-account@example.com' })).toBeNull();
    await request(app).get(`/api/subscribers/unsubscribe/${sub.unsubscribeToken}`).redirects(0);
    const row = await Subscriber.findOne({ email: 'no-account@example.com' }).lean();
    expect(row.status).toBe('unsubscribed');
  });

  test('unsubscribed subscriber is not silently reactivated by signup', async () => {
    await Subscriber.create({
      email: 'opted-out@example.com',
      status: 'unsubscribed',
      unsubscribedAt: new Date(),
      confirmed: false,
      source: 'newsletter-page',
    });

    const res = await postSubscribe(app, {
      email: 'opted-out@example.com',
      source: 'newsletter-page',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(resendEmailService.sendNewsletterConfirmation).not.toHaveBeenCalled();

    const row = await Subscriber.findOne({ email: 'opted-out@example.com' }).lean();
    expect(row.status).toBe('unsubscribed');
    expect(row.confirmed).toBe(false);
  });

  test('suppressed subscriber is not silently reactivated by signup', async () => {
    await Subscriber.create({
      email: 'bounced@example.com',
      status: 'suppressed',
      suppressedAt: new Date(),
      suppressionReason: 'bounce',
      source: 'newsletter-page',
    });

    await postSubscribe(app, { email: 'bounced@example.com', source: 'homepage' });
    const row = await Subscriber.findOne({ email: 'bounced@example.com' }).lean();
    expect(row.status).toBe('suppressed');
    expect(resendEmailService.sendNewsletterConfirmation).not.toHaveBeenCalled();
  });

  test('creating a User with blogNotifications does not create a Subscriber', async () => {
    await User.create({
      name: 'Account Person',
      email: 'account-user@example.com',
      password: 'password123',
      emailNotifications: { blogNotifications: true },
    });
    expect(await Subscriber.countDocuments({ email: 'account-user@example.com' })).toBe(0);
  });

  test('rate limiting is preserved at 5 requests per 15 minutes per IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await postSubscribe(
        app,
        { email: `rate-${i}@example.com`, source: 'newsletter-page' },
        { 'x-test-enable-rate-limit': '1' }
      );
      expect(res.status).toBe(201);
    }

    const blocked = await postSubscribe(
      app,
      { email: 'rate-overflow@example.com', source: 'newsletter-page' },
      { 'x-test-enable-rate-limit': '1' }
    );
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
  });
});

describe('legacy subscriber migration', () => {
  test('five legacy confirmed subscribers remain confirmed and the unconfirmed one stays pending', async () => {
    const confirmed = [];
    for (let i = 0; i < 4; i += 1) {
      confirmed.push(await Subscriber.collection.insertOne({
        email: `legacy-confirmed-${i}@example.com`,
        confirmed: true,
        confirmedAt: new Date('2026-04-01T00:00:00.000Z'),
        source: 'blog-listing',
        subscribedAt: new Date('2026-03-01T00:00:00.000Z'),
      }));
    }
    await Subscriber.collection.insertOne({
      email: 'legacy-confirmed-no-date@example.com',
      confirmed: true,
      source: 'blog-post',
      subscribedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    await Subscriber.collection.insertOne({
      email: 'legacy-pending@example.com',
      confirmed: false,
      source: 'blog-listing',
      subscribedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    const result = await migrateSubscriberStatus({ collection: Subscriber.collection });

    expect(result.subscribed).toBe(5);
    expect(result.pending).toBe(1);
    expect(result.demoted).toBe(0);
    expect(result.deleted).toBe(0);

    const stillConfirmed = await Subscriber.find({ status: 'subscribed' }).lean();
    expect(stillConfirmed).toHaveLength(5);
    const missingDate = await Subscriber.findOne({ email: 'legacy-confirmed-no-date@example.com' }).lean();
    expect(missingDate.status).toBe('subscribed');
    expect(missingDate.confirmed).toBe(true);
    expect(missingDate.confirmedAt).toBeFalsy();

    const pending = await Subscriber.findOne({ email: 'legacy-pending@example.com' }).lean();
    expect(pending.status).toBe('pending');
    expect(pending.confirmed).toBe(false);
  });
});

describe('unsubscribe vs GDPR erasure', () => {
  test('newsletter unsubscribe keeps the Subscriber row', async () => {
    const app = createApp();
    const sub = await Subscriber.create({
      email: 'keep-row@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
      unsubscribeToken: 'gdpr-not-unsub',
    });
    await request(app).get(`/api/subscribers/unsubscribe/${sub.unsubscribeToken}`).redirects(0);
    expect(await Subscriber.findOne({ email: 'keep-row@example.com' })).not.toBeNull();
  });

  test('GDPR erasure still deletes the Subscriber for that email', async () => {
    const user = await User.create({
      name: 'Erase Newsletter',
      email: 'erase-newsletter@example.com',
      password: 'password123',
    });
    await Subscriber.create({
      email: user.email,
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
    });

    await eraseAccountData({
      userId: user._id,
      actor: { type: 'self', id: user._id },
    });

    expect(await Subscriber.findOne({ email: 'erase-newsletter@example.com' })).toBeNull();
  });
});
