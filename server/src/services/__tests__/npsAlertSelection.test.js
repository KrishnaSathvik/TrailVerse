'use strict';
const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');
const { createSimpleTravelTools } = require('../trailieTravelData');
const NOW = new Date('2026-10-14T04:00:00Z');
const titles = ['Watchman Trail closed', 'Highway vehicle restriction', 'Cyanobacteria warning',
  'Angels Landing permit', 'Legal parking', 'Wall Street trail closure', 'Fire restriction'];
const provider = createNpsEvidenceProvider();
const alerts = titles.map((title, i) => ({ id: `alert-${i}`, title, description: `${title}. Official visitor restriction.`, category: 'Caution' }));
const candidates = () => provider.normalize(alerts, { operation: 'alerts', parameters: { parkCode: 'test' } }, { observedAt: NOW.toISOString() });
async function select(rows, topics = ['alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke']) {
  const broker = { dispatchEphemeral: jest.fn(async ({ requirement }) => ({
    status: 'fulfilled', normalizedCandidates: rows.filter(row => row.topic === requirement.topic), providerAttemptCount: 0,
  })) };
  const tools = createSimpleTravelTools({ broker, now: () => NOW, reserveDiscovery: false,
    destinationResolver: async () => ({ entityId: 'nps:park:test', displayName: 'Test Park' }) });
  const result = await tools.execute('read_travel', { destination: 'Test Park', question: 'Current visitor restrictions', topics },
    { requestId: 'alerts', userMessage: 'Current visitor restrictions', snapshot: { planningState: {} } });
  tools.dispose('alerts');
  return result;
}
test('actual selector preserves seven distinct alerts sharing a park URL and removes topic repetitions', async () => {
  const result = await select(candidates());
  expect(result.modelContext.facts.map(f => f.value.title)).toEqual(titles);
  expect(result.modelContext.facts).toHaveLength(7);
  expect(result.evidence.length).toBeGreaterThan(7); // Guard still sees derived topics.
  expect(result.evidenceDelivery.reserveDiscovery).toBe(false);
  expect(result.evidenceDelivery.factBytes).toBeLessThanOrEqual(28000);
});
test('repeated identical alert does not consume another model-facing slot', async () => {
  const rows = candidates();
  const repeated = { ...structuredClone(rows[0]), evidenceId: 'duplicate-import', observation: { observedAt: NOW.toISOString() } };
  const result = await select([...rows, repeated]);
  expect(result.modelContext.facts.filter(f => f.value.title === titles[0])).toHaveLength(1);
});
test('same ID with a changed claim is not silently merged', async () => {
  const original = candidates()[0];
  const changed = { ...structuredClone(original), claim: { ...original.claim, text: 'Different restriction; do not discard it.' } };
  const result = await select([original, changed], ['alerts_closures']);
  expect(result.modelContext.facts).toHaveLength(2);
});
test('canonical alert identity is used when source alert ID is absent', async () => {
  const rows = candidates().map(row => ({ ...row, source: { ...row.source, sourceId: null } }));
  expect((await select(rows)).modelContext.facts.map(f => f.value.title)).toEqual(titles);
});
test('source alert ID preserves distinct alerts without canonical identity', async () => {
  const rows = candidates().map(row => ({ ...row, claim: { ...row.claim, identity: null } }));
  expect((await select(rows)).modelContext.facts.map(f => f.value.title)).toEqual(titles);
});
test('equal wording with different stable alert IDs remains distinct', async () => {
  const first = candidates()[0], second = structuredClone(first);
  second.claim.identity = 'alerts:alerts_closures:another-alert';
  second.source.sourceId = 'another-alert:alerts_closures';
  expect((await select([first, second], ['alerts_closures'])).modelContext.facts).toHaveLength(2);
});
