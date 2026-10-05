const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const { applicationModels, indexInventory, inspectApplicationIndexes, ensureApplicationIndexes, provisionLocalIndexes } = require('../applicationIndexes');
const connectDB = require('../database');
const models = applicationModels();
const Guest = models.find((model) => model.modelName === 'AnonymousSession');
const Pick = models.find((model) => model.modelName === 'DestinationPick');

beforeEach(async () => { await mongoose.connection.dropDatabase(); });

test('actual local startup provisions all model indexes with autoIndex disabled; exact audit acceptance', async () => {
  const previousUri = process.env.MONGODB_URI;
  const uri = mongoose.connection.getClient().s.url;
  await mongoose.disconnect();
  process.env.MONGODB_URI = uri;
  const listeners = new Set(process.listeners('SIGINT'));
  try {
    await connectDB();
    expect(mongoose.connection.config.autoIndex).toBe(false);
    expect(mongoose.connection.config.autoCreate).toBe(false);
    expect(await inspectApplicationIndexes(models)).toEqual([]);
    expect(indexInventory(models)).toHaveLength(35);
    const guestIndexes = await Guest.collection.indexes();
    expect(guestIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { anonymousId: 1 }, unique: true }),
      expect.objectContaining({ key: { lastActivity: 1 }, expireAfterSeconds: 172800 }),
    ]));
    expect(await Pick.collection.indexes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { sessionId: 1 }, unique: true }),
    ]));
    const sessionData = { ipAddress: '127.0.0.1', userAgent: 'test', browserFingerprint: 'test' };
    const race = await Promise.allSettled(Array.from({ length: 8 }, () => Guest.findOrCreateSession('audit-race', sessionData)));
    expect(race.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await Guest.countDocuments({ anonymousId: 'audit-race' })).toBe(1);
    for (const result of race.filter((result) => result.status === 'rejected')) expect(result.reason.code).toBe(11000);
    await expect(Guest.create({ anonymousId: 'audit-race', ...sessionData })).rejects.toMatchObject({ code: 11000 });
    const pick = { sessionId: 'audit-pick', rawInput: 'Zion', normalizedText: 'zion', canonicalType: 'nps', travelWindow: 'someday' };
    await Pick.create(pick);
    await expect(Pick.create(pick)).rejects.toMatchObject({ code: 11000 });
    const createSpies = models.map((Model) => jest.spyOn(Model.collection, 'createIndex'));
    try {
      await expect(ensureApplicationIndexes({ apply: true, models })).resolves.toMatchObject({ requested: 0 });
      for (const spy of createSpies) expect(spy).not.toHaveBeenCalled();
    } finally { createSpies.forEach((spy) => spy.mockRestore()); }
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    for (const listener of process.listeners('SIGINT')) if (!listeners.has(listener)) process.removeListener('SIGINT', listener);
  }
});

test('verify-only refuses an unprovisioned database without creating any collections', async () => {
  await expect(ensureApplicationIndexes({ models })).rejects.toMatchObject({ code: 'APPLICATION_INDEXES_NOT_READY' });
  expect(await mongoose.connection.db.listCollections().toArray()).toEqual([]);
});

test('actual production connection refuses a fresh DB, then verifies explicit provisioning without index writes', async () => {
  const previousUri = process.env.MONGODB_URI;
  const previousMode = process.env.NODE_ENV;
  const uri = mongoose.connection.getClient().s.url;
  const listeners = new Set(process.listeners('SIGINT'));
  await mongoose.disconnect();
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = 'production';
  try {
    await expect(connectDB()).rejects.toMatchObject({ code: 'APPLICATION_INDEXES_NOT_READY' });
    expect(mongoose.connection.readyState).toBe(0);
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    expect(await mongoose.connection.db.listCollections().toArray()).toEqual([]);
    await ensureApplicationIndexes({ apply: true, models });
    await mongoose.disconnect();
    const createSpies = models.map((Model) => jest.spyOn(Model.collection, 'createIndex'));
    try {
      await connectDB();
      for (const spy of createSpies) expect(spy).not.toHaveBeenCalled();
    } finally { createSpies.forEach((spy) => spy.mockRestore()); }
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    process.env.NODE_ENV = previousMode;
    for (const listener of process.listeners('SIGINT')) if (!listeners.has(listener)) process.removeListener('SIGINT', listener);
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  }
});

test('wrong unique and TTL options fail closed without dropping or modifying existing indexes', async () => {
  await Guest.collection.createIndex({ anonymousId: 1 });
  await Guest.collection.createIndex({ lastActivity: 1 }, { expireAfterSeconds: 60 });
  const before = await Guest.collection.indexes();
  await expect(ensureApplicationIndexes({ models: [Guest] })).rejects.toMatchObject({ code: 'APPLICATION_INDEXES_NOT_READY' });
  await expect(ensureApplicationIndexes({ models: [Guest], apply: true })).rejects.toMatchObject({ code: 'APPLICATION_INDEX_PROVISION_FAILED' });
  expect(await Guest.collection.indexes()).toEqual(before);
});

test('duplicate stored IDs prevent provisioning and remain untouched for explicit repair', async () => {
  await Guest.collection.insertMany([{ anonymousId: 'existing-duplicate' }, { anonymousId: 'existing-duplicate' }]);
  await expect(ensureApplicationIndexes({ models: [Guest], apply: true })).rejects.toMatchObject({
    code: 'APPLICATION_INDEX_PROVISION_FAILED', cause: { code: 11000 },
  });
  expect(await Guest.countDocuments()).toBe(2);
});

test('sparse, partial and TTL constraints are verified, and extra indexes are preserved', async () => {
  const Trip = models.find((model) => model.modelName === 'TripPlan');
  const Review = models.find((model) => model.modelName === 'ParkReview');
  await ensureApplicationIndexes({ models: [Trip, Review, Guest], apply: true });
  await Guest.collection.createIndex({ browserFingerprint: 1 }, { name: 'operator_extra' });
  await ensureApplicationIndexes({ models: [Guest] });
  expect((await Guest.collection.indexes()).some((index) => index.name === 'operator_extra')).toBe(true);
  await Trip.collection.dropIndex('shareId_1');
  await Trip.collection.createIndex({ shareId: 1 }, { unique: true });
  await Review.collection.dropIndex('parkCode_1_userId_1');
  await Review.collection.createIndex({ parkCode: 1, userId: 1 }, { unique: true });
  await Guest.collection.dropIndex('lastActivity_1');
  await Guest.collection.createIndex({ lastActivity: 1 }, { expireAfterSeconds: 60 });
  for (const Model of [Trip, Review, Guest]) {
    await expect(ensureApplicationIndexes({ models: [Model] })).rejects.toMatchObject({ code: 'APPLICATION_INDEXES_NOT_READY' });
  }
});

test('only local non-production targets receive implicit provisioning permission', () => {
  expect(provisionLocalIndexes({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:27017/local' })).toBe(true);
  expect(provisionLocalIndexes({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/local' })).toBe(false);
  expect(provisionLocalIndexes({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://remote.example/app', MONGODB_DANGEROUSLY_ALLOW_REMOTE_HOSTS: 'remote.example' })).toBe(false);
  expect(provisionLocalIndexes({ NODE_ENV: 'development', MONGODB_URI: '' })).toBe(false);
});
