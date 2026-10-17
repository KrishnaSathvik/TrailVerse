'use strict';
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  // One disposable process per Jest run; each suite connects to a distinct DB.
  // Always mint this URI here rather than inheriting any application database.
  const mongo = await MongoMemoryServer.create();
  global.__trailverseTestMongo = mongo;
  process.env.TRAILVERSE_TEST_MONGO_URI = mongo.getUri();
};
