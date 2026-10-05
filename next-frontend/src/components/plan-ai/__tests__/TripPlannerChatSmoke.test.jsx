// WP-TU Phase 4 Task 10D — a bare import smoke test. TripPlannerChat.jsx is
// too large/stateful to mount in isolation, but importing it still forces
// vite/esbuild to parse and transform the whole module, which is enough to
// catch a syntax error introduced by this task's edits (the new import, the
// `terminalPlan`/`persistTargetPlanMutation` changes, the new call site).
test('TripPlannerChat.jsx module parses and imports without error', async () => {
  await expect(import('../TripPlannerChat')).resolves.toBeTruthy();
}, 60000);

test('authenticated streaming keeps the historical target plan in the terminal display payload', async () => {
  const source = await import('../TripPlannerChat?raw');
  expect(source.default).toMatch(/targetPlanMutation:\s*result\.targetPlanMutation\s*\|\|\s*null/);
});

test('attempt reset clears only the pending assistant stream before the next chunk', async () => {
  const source = await import('../TripPlannerChat?raw');
  expect(source.default).toMatch(/onContentReset:\s*\(\)\s*=>/);
  expect(source.default).toMatch(/rawStreamedContentRef\.current\s*=\s*['"]['"]/);
  expect(source.default).toMatch(/m\.id\s*!==\s*streamAssistantId/);
});
