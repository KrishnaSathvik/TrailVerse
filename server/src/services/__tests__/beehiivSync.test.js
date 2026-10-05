'use strict';

const crypto = require('crypto');
const axios = require('axios');
const Subscriber = require('../../models/Subscriber');
const User = require('../../models/User');
const { readFileSync } = require('fs');
const path = require('path');

jest.mock('axios');

const beehiivSync = require('../beehiivSync');
const beehiivService = require('../beehiivService');

function setBeehiivEnv() {
  process.env.BEEHIIV_API_KEY = 'test-beehiiv-key';
  process.env.BEEHIIV_PUBLICATION_ID = 'pub_00000000-0000-0000-0000-000000000000';
}

function clearBeehiivEnv() {
  delete process.env.BEEHIIV_API_KEY;
  delete process.env.BEEHIIV_PUBLICATION_ID;
  delete process.env.BEEHIIV_WEBHOOK_SECRET;
}

function activeSubscription(email = 'synced@example.com') {
  return {
    data: {
      id: 'sub_11111111-1111-1111-1111-111111111111',
      email,
      status: 'active',
    },
  };
}

async function createSubscriber(overrides = {}) {
  return Subscriber.create({
    email: 'reader@example.com',
    status: 'subscribed',
    confirmed: true,
    confirmedAt: new Date(),
    source: 'newsletter-page',
    ...overrides,
  });
}

describe('beehiivService configuration', () => {
  afterEach(() => {
    clearBeehiivEnv();
    jest.clearAllMocks();
  });

  test('is not configured without API credentials and does not call Beehiiv', async () => {
    clearBeehiivEnv();
    expect(beehiivService.isConfigured()).toBe(false);
    await expect(beehiivService.getSubscriber('anyone@example.com')).resolves.toBeNull();
    expect(axios).not.toHaveBeenCalled();
    expect(axios.request).not.toHaveBeenCalled();
  });
});

describe('beehiivSync eligibility and consent', () => {
  beforeEach(() => {
    setBeehiivEnv();
    axios.mockReset();
    axios.request = axios;
  });

  afterEach(() => {
    clearBeehiivEnv();
  });

  test('pending subscriber is never synced', async () => {
    const pending = await createSubscriber({
      email: 'pending@example.com',
      status: 'pending',
      confirmed: false,
      confirmedAt: undefined,
    });

    const result = await beehiivSync.syncSubscriber(pending);
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('not_subscribed');
    expect(axios).not.toHaveBeenCalled();
    const row = await Subscriber.findById(pending._id).lean();
    expect(row.beehiivSubscriberId).toBeFalsy();
    expect(row.status).toBe('pending');
  });

  test('unsubscribed subscriber is never added', async () => {
    const row = await createSubscriber({
      email: 'left@example.com',
      status: 'unsubscribed',
      confirmed: false,
      unsubscribedAt: new Date(),
    });
    const result = await beehiivSync.syncSubscriber(row);
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('not_subscribed');
    expect(axios).not.toHaveBeenCalled();
  });

  test('suppressed subscriber is never added', async () => {
    const row = await createSubscriber({
      email: 'bounce@example.com',
      status: 'suppressed',
      confirmed: false,
      suppressedAt: new Date(),
      suppressionReason: 'bounce',
    });
    const result = await beehiivSync.syncSubscriber(row);
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('not_subscribed');
    expect(axios).not.toHaveBeenCalled();
  });

  test('subscribed subscriber can sync and stores remote id and timestamp', async () => {
    axios.mockResolvedValue({ status: 200, data: activeSubscription() });
    const row = await createSubscriber();

    const result = await beehiivSync.syncSubscriber(row);
    expect(result.synced).toBe(true);
    expect(axios).toHaveBeenCalled();

    const createCall = axios.mock.calls.find((call) => {
      const config = call[0] || {};
      return config.method === 'post' || String(config.url || '').includes('/subscriptions');
    }) || axios.mock.calls[0];
    const config = createCall[0];
    expect(config.url).toMatch(/\/publications\/pub_00000000-0000-0000-0000-000000000000\/subscriptions/);
    expect(config.headers.Authorization).toBe('Bearer test-beehiiv-key');
    expect(config.data.email).toBe('reader@example.com');
    expect(config.data.double_opt_override).toBe('off');
    expect(config.data.send_welcome_email).toBe(false);

    const saved = await Subscriber.findById(row._id).lean();
    expect(saved.beehiivSubscriberId).toBe('sub_11111111-1111-1111-1111-111111111111');
    expect(saved.beehiivSyncedAt).toBeTruthy();
    expect(saved.beehiivSyncStatus).toBe('synced');
    expect(saved.status).toBe('subscribed');
  });

  test('duplicate sync is idempotent and remote existing subscriber is handled safely', async () => {
    axios.mockResolvedValue({ status: 200, data: activeSubscription() });
    const row = await createSubscriber({ email: 'dup@example.com' });

    await beehiivSync.syncSubscriber(row);
    await beehiivSync.syncSubscriber(await Subscriber.findById(row._id));

    expect(axios).toHaveBeenCalledTimes(1);
    const saved = await Subscriber.findById(row._id).lean();
    expect(saved.beehiivSubscriberId).toBe('sub_11111111-1111-1111-1111-111111111111');
    expect(saved.beehiivSyncStatus).toBe('synced');
  });

  test('remote existing subscriber is handled safely', async () => {
    axios.mockImplementation((config) => {
      if (config.method === 'post') {
        const err = new Error('exists');
        err.response = { status: 409 };
        return Promise.reject(err);
      }
      return Promise.resolve({
        status: 200,
        data: { data: { id: 'sub_existing', email: 'already-on-beehiiv@example.com', status: 'active' } },
      });
    });

    const row = await createSubscriber({ email: 'already-on-beehiiv@example.com' });
    const result = await beehiivSync.syncSubscriber(row);
    expect(result.synced).toBe(true);

    const saved = await Subscriber.findById(row._id).lean();
    expect(saved.beehiivSubscriberId).toBe('sub_existing');
    expect(saved.beehiivSyncStatus).toBe('synced');
    expect(saved.status).toBe('subscribed');
  });

  test('Beehiiv failure records retryable sync state and does not change consent', async () => {
    axios.mockRejectedValue({ response: { status: 503, data: { statusText: 'unavailable' } } });
    const row = await createSubscriber({ email: 'fail@example.com' });

    const result = await beehiivSync.syncSubscriber(row);
    expect(result.synced).toBe(false);

    const saved = await Subscriber.findById(row._id).lean();
    expect(saved.status).toBe('subscribed');
    expect(saved.confirmed).toBe(true);
    expect(saved.beehiivSyncStatus).toBe('failed');
    expect(saved.beehiivSubscriberId).toBeFalsy();
    expect(JSON.stringify(saved.beehiivSyncError || '')).not.toMatch(/fail@example.com/);
  });

  test('User collection is never used as Beehiiv audience', async () => {
    await User.create({
      name: 'Blog Alerts User',
      email: 'user-alerts@example.com',
      password: 'password123',
      emailNotifications: { blogNotifications: true },
    });

    const files = [
      path.join(__dirname, '../beehiivService.js'),
      path.join(__dirname, '../beehiivSync.js'),
      path.join(__dirname, '../../../scripts/sync-newsletter-subscribers-to-beehiiv.js'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/models\/User|emailNotifications|blogNotifications/);
    }

    const eligible = await beehiivSync.findUnsyncedSubscribed();
    expect(eligible.map((row) => row.email)).not.toContain('user-alerts@example.com');
  });

  test('pending legacy Subscriber remains excluded and five subscribed rows are eligible but not auto-synced', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createSubscriber({
        email: `seed-${i}@example.com`,
        source: 'blog-listing',
      });
    }
    await createSubscriber({
      email: 'legacy-pending@example.com',
      status: 'pending',
      confirmed: false,
      confirmedAt: undefined,
    });

    const eligible = await beehiivSync.findUnsyncedSubscribed();
    expect(eligible).toHaveLength(5);
    expect(eligible.every((row) => row.status === 'subscribed')).toBe(true);
    expect(eligible.map((row) => row.email)).not.toContain('legacy-pending@example.com');
    expect(axios).not.toHaveBeenCalled();
  });
});

describe('TrailVerse unsubscribe toward Beehiiv', () => {
  beforeEach(() => {
    setBeehiivEnv();
    axios.mockReset();
  });

  afterEach(() => {
    clearBeehiivEnv();
  });

  test('unsubscribe attempts Beehiiv unsubscribe by email', async () => {
    axios.mockResolvedValue({ status: 200, data: { data: { id: 'sub_222', status: 'inactive' } } });
    const row = await createSubscriber({
      email: 'leave@example.com',
      beehiivSubscriberId: 'sub_222',
      beehiivSyncStatus: 'synced',
    });

    const result = await beehiivSync.unsubscribeSubscriber(row);
    expect(result.ok).toBe(true);
    expect(axios).toHaveBeenCalled();
    const config = axios.mock.calls[0][0];
    expect(config.method).toBe('put');
    expect(config.url).toMatch(/subscriptions\/by_email\/leave%40example.com/);
    expect(config.data.unsubscribe).toBe(true);
  });

  test('Beehiiv failure does not undo local unsubscribe', async () => {
    axios.mockRejectedValue({ response: { status: 500 } });
    const row = await createSubscriber({
      email: 'keep-unsub@example.com',
      status: 'unsubscribed',
      unsubscribedAt: new Date(),
      confirmed: false,
      beehiivSubscriberId: 'sub_333',
      beehiivSyncStatus: 'synced',
    });

    await beehiivSync.unsubscribeSubscriber(row);
    const saved = await Subscriber.findById(row._id).lean();
    expect(saved.status).toBe('unsubscribed');
    expect(saved.beehiivSyncStatus).toBe('unsubscribe_failed');
  });
});

describe('beehiiv webhook signature', () => {
  const { verifyBeehiivWebhook } = require('../beehiivWebhook');

  const secret = `whsec_${Buffer.from('test-webhook-secret-bytes').toString('base64')}`;

  function sign(rawBody, timestamp = Math.floor(Date.now() / 1000), id = 'msg_1') {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const digest = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
    return {
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': `v1,${digest}`,
    };
  }

  test('invalid webhook/auth is rejected', () => {
    const rawBody = '{"event_type":"subscription.deleted"}';
    expect(verifyBeehiivWebhook({
      secret,
      headers: { 'svix-id': 'msg_1', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,aaaa' },
      rawBody,
    }).ok).toBe(false);
  });

  test('valid signature is accepted', () => {
    const rawBody = '{"event_type":"subscription.deleted"}';
    const headers = sign(rawBody);
    expect(verifyBeehiivWebhook({ secret, headers, rawBody }).ok).toBe(true);
  });
});
