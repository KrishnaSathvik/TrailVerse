'use strict';

const mongoose = require('mongoose');
const TripPlan = require('../../models/TripPlan');
const { migrate } = require('../../../scripts/migrate-share-scope-full-conversation');

const userId = new mongoose.Types.ObjectId();

describe('share scope default', () => {
  test('a new trip shares the full conversation unless the owner chooses otherwise', () => {
    expect(new TripPlan({ userId }).shareScope).toBe('full_conversation');
  });
});

describe('migrate-share-scope-full-conversation', () => {
  async function seed() {
    const raw = TripPlan.collection;
    await raw.insertMany([
      { userId, shareId: 'plan-only-1', shareScope: 'plan_only', conversation: [] },
      { userId, shareId: 'no-scope-1', conversation: [] },
      { userId, shareId: 'explained-1', shareScope: 'plan_plus_explanation', conversation: [] },
      { userId, shareId: 'full-1', shareScope: 'full_conversation', conversation: [] },
      { userId, shareScope: 'plan_only', conversation: [] }, // never shared
    ]);
  }

  test('dry run only counts', async () => {
    await seed();
    const out = await migrate({ TripPlan, apply: false, log: () => {} });
    expect(out).toEqual({ matched: 2, modified: 0 });
    expect(await TripPlan.countDocuments({ shareScope: 'full_conversation' })).toBe(1);
  });

  test('--apply moves plan_only / unset shares to full_conversation and leaves explicit choices alone', async () => {
    await seed();
    const out = await migrate({ TripPlan, apply: true, log: () => {} });
    expect(out.modified).toBe(2);
    const byShare = Object.fromEntries((await TripPlan.collection.find({}).toArray()).map((t) => [t.shareId || 'unshared', t.shareScope]));
    expect(byShare).toEqual({
      'plan-only-1': 'full_conversation',
      'no-scope-1': 'full_conversation',
      'explained-1': 'plan_plus_explanation',
      'full-1': 'full_conversation',
      unshared: 'plan_only',
    });
  });
});
