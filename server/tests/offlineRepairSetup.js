'use strict';
// Installed before imports: no DB, downloads, or provider dispatch. Even a
// swallowed network exception fails this gate at teardown.
const { installOutboundNetworkGuard } = require('../src/eval/bootstrap/outboundNetworkGuard');
const guard = installOutboundNetworkGuard();
afterAll(() => {
  const summary = guard.summary();
  guard.uninstall();
  expect(summary.externalNetworkAttempts).toBe(0);
  expect(summary.approvedClaudeProviderAttempts).toBe(0);
  expect(summary.providerHttpRequests).toBe(0);
});
