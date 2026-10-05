const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');

let mongod;
let outboundGuard;

// Ordinary regression tests are network-denied even if a test loads .env.
// The guard's own focused suites install their own instances and are therefore
// the only structural exclusions from this shared installation.
beforeAll(() => {
  const testPath = String(expect.getState().testPath || '');
  const ownsGuard = /outboundNetworkGuard\.test\.js$|liveNetworkGuard\.test\.js$/.test(testPath);
  if (process.env.TRAILIE_TEST_PROVIDER_MODE === 'deny_live' && !ownsGuard) {
    outboundGuard = installOutboundNetworkGuard();
    outboundGuard.setPhase('runtime');
  }
});

// Setup before all tests
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

// Cleanup after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Cleanup after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
  if (outboundGuard) outboundGuard.uninstall();
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test_password';
process.env.EMAIL_FROM_NAME = 'Test TrailVerse';
