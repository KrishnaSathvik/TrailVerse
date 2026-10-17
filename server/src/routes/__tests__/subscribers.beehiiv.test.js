'use strict';

const express = require('express');
const request = require('supertest');
const axios = require('axios');
const Subscriber = require('../../models/Subscriber');

jest.mock('axios');

jest.mock('../../services/resendEmailService', () => ({
  sendNewsletterConfirmation: jest.fn().mockResolvedValue(undefined),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/subscribers', require('../subscribers'));
  return app;
}

describe('confirmation and unsubscribe keep Mongo consent when Beehiiv fails', () => {
  const app = createApp();

  beforeEach(() => {
    process.env.BEEHIIV_API_KEY = 'test-beehiiv-key';
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_00000000-0000-0000-0000-000000000000';
    axios.mockReset();
    axios.mockRejectedValue({ response: { status: 503 } });
  });

  afterEach(() => {
    delete process.env.BEEHIIV_API_KEY;
    delete process.env.BEEHIIV_PUBLICATION_ID;
  });

  test('Beehiiv failure does not undo Mongo confirmation', async () => {
    const pending = await Subscriber.create({
      email: 'confirm-fail@example.com',
      status: 'pending',
      confirmed: false,
      source: 'newsletter-page',
      confirmToken: 'confirm-fail-token',
    });

    const res = await request(app)
      .get(`/api/subscribers/confirm/${pending.confirmToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/newsletter?subscribed=true');

    const row = await Subscriber.findById(pending._id).lean();
    expect(row.status).toBe('subscribed');
    expect(row.confirmed).toBe(true);
    expect(row.confirmedAt).toBeTruthy();
    expect(row.beehiivSyncStatus).toBe('failed');
  });

  test('Beehiiv failure does not undo local unsubscribe', async () => {
    const sub = await Subscriber.create({
      email: 'unsub-fail@example.com',
      status: 'subscribed',
      confirmed: true,
      confirmedAt: new Date(),
      source: 'newsletter-page',
      unsubscribeToken: 'unsub-fail-token',
      beehiivSubscriberId: 'sub_fail',
      beehiivSyncStatus: 'synced',
    });

    const res = await request(app)
      .get(`/api/subscribers/unsubscribe/${sub.unsubscribeToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/newsletter?unsubscribed=true');
    const row = await Subscriber.findById(sub._id).lean();
    expect(row.status).toBe('unsubscribed');
    expect(row.beehiivSyncStatus).toBe('unsubscribe_failed');
  });

  test('pending signup never calls Beehiiv', async () => {
    const res = await request(app).post('/api/subscribers').send({
      email: 'still-pending@example.com',
      source: 'newsletter-page',
    });
    expect(res.status).toBe(201);
    expect(axios).not.toHaveBeenCalled();
    const row = await Subscriber.findOne({ email: 'still-pending@example.com' }).lean();
    expect(row.status).toBe('pending');
  });
});
