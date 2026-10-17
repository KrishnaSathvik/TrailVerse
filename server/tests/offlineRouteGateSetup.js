'use strict';
// Cached local binary only; no downloads and no application environment files.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'offline-route-gate-local-test-secret';
process.env.OPENAI_API_KEY = 'offline-injected-adapter-only';
process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false';
process.env.TRAILIE_EVAL_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27189/trailie_route_gate';
const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');
const guard = installOutboundNetworkGuard();
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
let mongo;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: {
    systemBinary: process.env.TRAILIE_TEST_MONGOD_BINARY || require('path').join(require('os').homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-7.0.14'),
  }, instance: { ip: '127.0.0.1', port: 27189, dbName: 'trailie_route_gate' } });
  await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 2000 });
}, 15000);
afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  const summary = guard.summary();
  guard.uninstall();
  console.log('OFFLINE_ROUTE_NETWORK', JSON.stringify(summary));
  expect(summary.externalNetworkAttempts).toBe(0);
  expect(summary.approvedClaudeProviderAttempts).toBe(0);
  expect(summary.providerHttpRequests).toBe(0);
});
