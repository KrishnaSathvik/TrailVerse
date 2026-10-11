import { runOrderedCrossPlanPersistence } from '../persistCanonicalPlan';

// Architecture invariant (docs/trailie-architecture.md Step 3):
// When model-first returns persisted:true, the browser must treat the server
// canonical state as authoritative and must never perform a second trip write
// to “finish” the save. Legacy/recovery may still write when persisted is absent.
test('model-first persisted:true never creates a second client trip write', async () => {
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

test('model-first persisted:true ignores hasUserMessagesToSave (server already committed)', async () => {
  const autoSaveConversation = vi.fn().mockResolvedValue(true);
  const persistTargetPlanMutation = vi.fn();
  await runOrderedCrossPlanPersistence({
    data: { persisted: true },
    hasUserMessagesToSave: true,
    autoSaveConversation,
    persistTargetPlanMutation,
  });
  expect(autoSaveConversation).not.toHaveBeenCalled();
  expect(persistTargetPlanMutation).not.toHaveBeenCalled();
});

test('legacy terminals retain their existing client persistence behavior', async () => {
  const autoSaveConversation = vi.fn().mockResolvedValue(true);
  await runOrderedCrossPlanPersistence({ data: {}, hasUserMessagesToSave: true, autoSaveConversation });
  expect(autoSaveConversation).toHaveBeenCalledOnce();
});
