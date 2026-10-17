import test from 'node:test';
import assert from 'node:assert/strict';
import { findPreview } from './wait-for-vercel-preview.mjs';
const sha = 'a'.repeat(40);
const deployment = { id: 1, sha, creator: { login: 'vercel[bot]' }, environment: 'Preview', production_environment: false };
const status = { state: 'success', environment_url: 'https://example-preview.vercel.app' };
function lookup(d = deployment, s = status) {
  return findPreview(async path => path.includes('/statuses?') ? [s] : [d], 'owner/repo', sha);
}
test('returns successful exact-commit Vercel preview', async () => assert.equal(await lookup(), status.environment_url));
for (const patch of [{ sha: 'b'.repeat(40) }, { creator: { login: 'other' } }, { environment: 'Production' }, { production_environment: true }]) {
  test(`rejects unrelated deployment ${JSON.stringify(patch)}`, async () => assert.equal(await lookup({ ...deployment, ...patch }), null));
}
for (const patch of [{ state: 'pending' }, { state: 'failure' }, { environment_url: 'http://example.vercel.app' }, { environment_url: 'https://vercel.app.evil.test' }, { environment_url: 'https://user:pass@example.vercel.app' }, { environment_url: undefined }]) {
  test(`rejects unusable status ${JSON.stringify(patch)}`, async () => assert.equal(await lookup(deployment, { ...status, ...patch }), null));
}
test('propagates API failures instead of falling back to production', async () => {
  await assert.rejects(findPreview(async () => { throw new Error('HTTP 403'); }, 'owner/repo', sha), /403/);
});
