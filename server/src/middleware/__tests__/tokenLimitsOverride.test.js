const { dailyTokenLimitFor } = require('../tokenLimits');
const user = { role: 'user', email: 'demo@example.com' };
const env = { NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:27017/trailverse-dev', TRAILIE_DAILY_TOKEN_LIMIT: '500000', TRAILIE_DAILY_TOKEN_LIMIT_EMAIL: user.email };
test('local override applies only to the selected account', () => {
  expect(dailyTokenLimitFor(user, env)).toBe(500000);
  expect(dailyTokenLimitFor({ ...user, email: 'other@example.com' }, env)).toBe(5000);
});
test.each([{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { MONGODB_URI: 'mongodb://remote.example/db' }, { TRAILIE_DAILY_TOKEN_LIMIT: 'bad' }, { TRAILIE_DAILY_TOKEN_LIMIT: '-1' }, { TRAILIE_DAILY_TOKEN_LIMIT_EMAIL: '' }])('fails closed for %p', patch => {
  expect(dailyTokenLimitFor(user, { ...env, ...patch })).toBe(5000);
});
