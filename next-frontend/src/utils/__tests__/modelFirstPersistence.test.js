import { runOrderedCrossPlanPersistence } from '../persistCanonicalPlan';

test('server-persisted response never creates a second client write, including target mutations', async () => {
  const autoSaveConversation = vi.fn();
  const persistTargetPlanMutation = vi.fn();
  const result = await runOrderedCrossPlanPersistence({
    data: { persisted: true, tripId: 'saved-trip', targetPlanMutation: { tripId: 'another-trip' } },
    hasUserMessagesToSave: true, autoSaveConversation, persistTargetPlanMutation,
  });
  expect(result).toBe(true);
  expect(autoSaveConversation).not.toHaveBeenCalled();
  expect(persistTargetPlanMutation).not.toHaveBeenCalled();
});

test('legacy terminals retain their existing client persistence behavior', async () => {
  const autoSaveConversation = vi.fn().mockResolvedValue(true);
  await runOrderedCrossPlanPersistence({ data: {}, hasUserMessagesToSave: true, autoSaveConversation });
  expect(autoSaveConversation).toHaveBeenCalledOnce();
});
