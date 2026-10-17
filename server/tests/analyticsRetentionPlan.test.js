const { buildPlan, validateIndexes } = require('../scripts/analytics-retention-plan');
const { NON_API_CALL_EVENT_TYPES, ANALYTICS_RETENTION_SECONDS } = require('../src/config/analyticsRetention');
const Analytics = require('../src/models/Analytics');
function indexes() {
  return [
    { name: 'analytics_api_call_ttl', key: { timestamp: 1 }, expireAfterSeconds: 604800, partialFilterExpression: { eventType: 'api_call' } },
    { name: 'analytics_general_ttl', key: { timestamp: 1 }, expireAfterSeconds: 2592000, partialFilterExpression: { eventType: { $in: NON_API_CALL_EVENT_TYPES } } },
  ];
}
test('local model preserves production TTL definitions without automatic index mutation', () => {
  expect(ANALYTICS_RETENTION_SECONDS).toBe(2592000);
  expect(Analytics.schema.options.autoIndex).toBe(false);
  expect(Analytics.schema.indexes().filter(([, options]) => options.expireAfterSeconds != null)
    .map(([, options]) => options.expireAfterSeconds)).toEqual([604800, 2592000]);
});
test('preview only reads analytics and names existing indexes for collMod', async () => {
  const collection = { listIndexes: () => ({ toArray: async () => indexes() }), countDocuments: jest.fn().mockResolvedValue(10) };
  const db = { databaseName: 'trailverse', collection: jest.fn(() => collection), command: jest.fn() };
  const plan = await buildPlan(db, new Date('2026-10-03T02:00:00Z'));
  expect(plan.cutoff).toBe('2026-09-26T02:00:00.000Z');
  expect(plan.affectedRecords).toBe(10);
  expect(db.collection).toHaveBeenCalledWith('analytics');
  expect(db.command).not.toHaveBeenCalled();
  expect(plan.changes).toHaveLength(1);
  expect(plan.unchangedIndexes).toEqual(['analytics_api_call_ttl']);
  expect(plan.changes[0].command).toEqual({ collMod: 'analytics', index: { name: 'analytics_general_ttl', expireAfterSeconds: 604800 } });
});
test('preserves the inspected older production filter and reports uncovered event types', async () => {
  const live = indexes();
  live[1].partialFilterExpression.eventType.$in = NON_API_CALL_EVENT_TYPES.filter(type => type !== 'crowd_calendar_view');
  const collection = { listIndexes: () => ({ toArray: async () => live }), countDocuments: jest.fn().mockResolvedValue(4) };
  const plan = await buildPlan({ databaseName: 'trailverse', collection: () => collection });
  expect(plan.configuredEventTypesNotCovered).toEqual(['crowd_calendar_view']);
  expect(plan.changes[0].partialFilterExpression).toEqual(live[1].partialFilterExpression);
  expect(collection.countDocuments.mock.calls[0][0].$and[0]).toEqual(live[1].partialFilterExpression);
  const unexpected = indexes();
  unexpected[1].partialFilterExpression.eventType.$in = ['page_view'];
  expect(() => validateIndexes(unexpected)).toThrow();
});
test('missing TTL options, altered partial filters, or extra TTLs stop the plan', () => {
  const missing = indexes(); delete missing[0].expireAfterSeconds;
  expect(() => validateIndexes(missing)).toThrow();
  const changed = indexes(); changed[1].partialFilterExpression = { userId: null };
  expect(() => validateIndexes(changed)).toThrow();
  expect(() => validateIndexes([...indexes(), { name: 'unknown', expireAfterSeconds: 100 }])).toThrow();
});
test('rejects any other database', async () => {
  await expect(buildPlan({ databaseName: 'users' })).rejects.toThrow('Only trailverse.analytics');
});

 test('release preserves production analytics filter and blog text weights', () => {
  const ttl = Analytics.schema.indexes().find(([, o]) => o.name === 'analytics_general_ttl')[1];
  expect(ttl.partialFilterExpression.eventType.$in).toEqual(NON_API_CALL_EVENT_TYPES.filter(t => t !== 'crowd_calendar_view'));
  const BlogPost = require('../src/models/BlogPost');
  const text = BlogPost.schema.indexes().find(([key]) => key.title === 'text')[1];
  expect(text.weights).toEqual({ title: 1, excerpt: 1, content: 1 });
});
