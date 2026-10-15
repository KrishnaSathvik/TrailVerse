'use strict';
module.exports = async () => {
  await global.__trailverseTestMongo?.stop();
  delete process.env.TRAILVERSE_TEST_MONGO_URI;
};
