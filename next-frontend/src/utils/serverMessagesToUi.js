export const mapServerMessagesToUi = (serverMessages = []) =>
  serverMessages.map((msg, index) => {
    const canonicalPlan = msg.canonicalPlan || msg.itineraryPlan || null;
    return {
      id: `restored-${index}-${msg.timestamp || Date.now()}`,
      role: msg.role,
      ...(msg.conversationId != null ? { conversationId: msg.conversationId } : {}),
      content: msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      provider: msg.provider || undefined,
      model: msg.model || undefined,
      travelLogistics: msg.travelLogistics || undefined,
      canonicalPlan: canonicalPlan || undefined,
      itineraryPlan: canonicalPlan || undefined,
      hasItinerary: Boolean(msg.hasItinerary || canonicalPlan),
      itineraryHash: msg.itineraryHash || undefined,
      responseId: msg.responseId || undefined,
      responseVersion: msg.responseVersion ?? undefined,
      responseRevision: msg.responseRevision ?? undefined,
      artifactStatus: msg.artifactStatus || undefined,
      responseArtifacts: msg.responseArtifacts || undefined,
      intent: msg.intent || undefined,
      presentation: msg.presentation || undefined,
      refinement: msg.refinement || undefined,
      // WP-TU Phase 3 Task 8B — restore the same additive field intent/
      // presentation already restore here. Absent on any conversation saved
      // before this change; `resolvePlanningParkName`'s existing legacy
      // fallback tier already handles that (parkName/parkNames below).
      activeTripPresentation: msg.activeTripPresentation || undefined,
      // WP-TU Phase 4 Task 10 — same additive field, restored the same way.
      targetTripId: msg.targetTripId || undefined,
      presentationKind: msg.presentationKind || undefined,
      outcomeClass: msg.outcomeClass || undefined,
      lifecycleStatus: msg.lifecycleStatus || undefined,
      parkName: msg.parkName || canonicalPlan?.parkName || undefined,
      parkNames: msg.parkNames || undefined,
      hasLiveData: Boolean(msg.hasLiveData),
      hasWebSearch: Boolean(msg.hasWebSearch),
    };
  });
