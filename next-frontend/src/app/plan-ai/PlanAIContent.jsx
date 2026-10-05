'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { NotePencil } from '@components/icons';
import PlanAIShell from '@components/plan-ai/PlanAIShell';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import QuickFillModal from '@components/plan-ai/QuickFillModal';
import MyRecommendationsButton from '@components/plan-ai/MyRecommendationsButton';
import usePlanAI from '@hooks/usePlanAI';
import { useAutoTrailieCompletionSound } from '@/hooks/useTrailieCompletionSound';
import { derivePlanAiHeaderMeta } from '@/lib/planAiHeaderMeta';
import { createUntouchedFormData } from '@/lib/formDataProvenance';
import { buildQuickFillSummaryParts } from '@/lib/quickFillSummary';

// P0-4: fallback form state is all defaults — provenance keeps every field
// out of the model context until the traveler touches it.
const defaultFormData = createUntouchedFormData({
  parkCode: '',
  coordinates: null,
  startDate: '',
  endDate: '',
  groupSize: 1,
  budget: '',
  interests: [],
  fitnessLevel: '',
  accommodation: ''
});

const PlanAIContent = ({ tripId }) => {
  const {
    loadingTrip,
    chatFormData,
    setChatFormData,
    selectedParkName,
    setSelectedParkName,
    formData,
    setFormData,
    isPersonalized,
    isNewChat,
    suggestText,
    intentContext,
    refetchUserTrips,
    allParks,
    parksLoading,
    interests,
    toggleInterest,
    handleStartNewChat,
    handlePersonalizedRecommendations,
    uniqueParksCount,
    isAuthenticated,
    fromChatHistory,
    askText,
    entryMode,
    effectiveEntryMode,
    fromCompare,
    guestChatSessionKey,
    guestResumingChat,
    entryContext,
    newChatKey
  } = usePlanAI(tripId);
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  // P0-1 (audit 2026-08-31): pinned at mount. guestChatSessionKey and the
  // park/intent context change DURING a live conversation (first completed
  // guest turn links the anonymous session; stale session-status can unlink
  // it again), and a key derived from them remounted TripPlannerChat and
  // destroyed the transcript. Only explicit resets (newChatKey, tripId) may
  // remount the chat.
  const [pinnedChatScopeKey] = useState(
    () =>
      guestChatSessionKey ||
      (chatFormData || defaultFormData).parkCode ||
      intentContext?.path ||
      suggestText ||
      'generic'
  );
  const [quickFillMessage, setQuickFillMessage] = useState(null);
  const [hasAppliedQuickFill, setHasAppliedQuickFill] = useState(!!tripId || !!fromChatHistory);
  const [initialAskMessage, setInitialAskMessage] = useState(askText || null);
  const [shellMetaOverride, setShellMetaOverride] = useState(null);
  const [clientReady, setClientReady] = useState(false);
  const { playCompletion, prime: primeCompletionSound } = useAutoTrailieCompletionSound();

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (askText && !guestResumingChat) setInitialAskMessage(askText);
  }, [askText, guestResumingChat]);

  const effectiveFormData = chatFormData || defaultFormData;
  const effectiveParkName = selectedParkName || '';
  const effectiveIsNewChat = tripId ? false : isNewChat;

  /** SSR + first client paint — derived from URL/entry, not chat effects (avoids hydration mismatch). */
  const baseShellMeta = useMemo(
    () =>
      derivePlanAiHeaderMeta({
        entryMode: effectiveEntryMode,
        sessionEntryMode: effectiveEntryMode,
        isPersonalized,
        parkName: effectiveParkName,
        suggestText: suggestText || '',
        intentContext: intentContext || null,
        formData: effectiveFormData,
        currentPlan: null,
        hasUserMessages: false,
        resolvedParkName: effectiveParkName,
      }),
    [effectiveEntryMode, isPersonalized, effectiveParkName, suggestText, intentContext, effectiveFormData]
  );

  const shellMeta = shellMetaOverride ?? baseShellMeta;

  if (loadingTrip) {
    return (
      <PlanAIShell
        title={baseShellMeta.title}
        subtitle={baseShellMeta.subtitle}
        showSubHeader={baseShellMeta.showSubHeader !== false}
        loadingMessage="Loading trip data…"
      />
    );
  }

  const handleQuickFillApply = (data) => {
    setFormData(data);
    setQuickFillOpen(false);

    // Update chatFormData so TripPlannerChat picks up the Quick Fill data
    setChatFormData(data);

    // Find the park name for the header and AI context
    const park = allParks?.find(p => p.parkCode === data.parkCode);
    if (park) {
      setSelectedParkName(park.fullName);
    }

    // Build a summary message to auto-send to the AI. P0-4: the message
    // speaks AS the traveler, so it may only state fields they actually
    // touched — an untouched wizard default is not "my trip details".
    const parts = buildQuickFillSummaryParts(data, park?.fullName || null);

    const message = hasAppliedQuickFill
      ? `I've updated my trip preferences:\n${parts.join('\n')}\n\nCan you adjust your suggestions based on these changes?`
      : `Here are my trip details:\n${parts.join('\n')}\n\nCan you suggest an itinerary based on these preferences?`;
    setQuickFillMessage(message);
    setHasAppliedQuickFill(true);
  };

  const headerActions = clientReady && isAuthenticated ? (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {uniqueParksCount >= 3 && (
        <MyRecommendationsButton onClick={handlePersonalizedRecommendations} />
      )}
      <button
        type="button"
        onClick={handleStartNewChat}
        title="Start a new chat"
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-9 sm:gap-2 sm:px-3 sm:text-sm"
        style={{
          backgroundColor: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          '--tw-ring-color': 'var(--accent-green)',
        }}
      >
        <NotePencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span>Chat</span>
      </button>
    </div>
  ) : null;

  return (
    <>
      <PlanAIShell
        title={shellMeta.title}
        subtitle={shellMeta.subtitle}
        showSubHeader={shellMeta.showSubHeader !== false}
        headerActions={headerActions}
      >
        <TripPlannerChat
          key={`chat-${newChatKey || tripId || pinnedChatScopeKey}`}
          formData={effectiveFormData}
          parkName={effectiveParkName}
          existingTripId={tripId}
          isPersonalized={isPersonalized}
          isNewChat={effectiveIsNewChat}
          suggestText={suggestText}
          intentContext={intentContext}
          entryMode={effectiveEntryMode}
          entryContext={entryContext}
          fromCompare={fromCompare}
          fromChatHistory={fromChatHistory}
          refreshTrips={refetchUserTrips}
          onOpenQuickFill={() => setQuickFillOpen(true)}
          quickFillMessage={quickFillMessage}
          onQuickFillSent={() => setQuickFillMessage(null)}
          initialAskMessage={initialAskMessage}
          onInitialAskSent={() => setInitialAskMessage(null)}
          playCompletionSound={playCompletion}
          primeCompletionSound={primeCompletionSound}
          onShellMetaChange={setShellMetaOverride}
        />
      </PlanAIShell>

      <QuickFillModal
        isOpen={quickFillOpen}
        onClose={() => setQuickFillOpen(false)}
        formData={formData}
        setFormData={setFormData}
        allParks={allParks}
        parksLoading={parksLoading}
        interests={interests}
        toggleInterest={toggleInterest}
        onApply={handleQuickFillApply}
      />
    </>
  );
};

export default PlanAIContent;
