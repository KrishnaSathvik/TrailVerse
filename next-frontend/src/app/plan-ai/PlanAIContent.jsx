'use client';

import React, { useEffect, useState } from 'react';
import { NotePencil } from '@components/icons';
import PlanAIShell from '@components/plan-ai/PlanAIShell';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import QuickFillModal from '@components/plan-ai/QuickFillModal';
import MyRecommendationsButton from '@components/plan-ai/MyRecommendationsButton';
import usePlanAI from '@hooks/usePlanAI';
import { useAutoTrailieCompletionSound } from '@/hooks/useTrailieCompletionSound';

const DEFAULT_SHELL_META = {
  showSubHeader: false,
};

const defaultFormData = {
  parkCode: '',
  coordinates: null,
  startDate: '',
  endDate: '',
  groupSize: 1,
  budget: '',
  interests: [],
  fitnessLevel: '',
  accommodation: ''
};

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
    guestChatSessionKey,
    guestResumingChat,
    newChatKey
  } = usePlanAI(tripId);
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [quickFillMessage, setQuickFillMessage] = useState(null);
  const [hasAppliedQuickFill, setHasAppliedQuickFill] = useState(!!tripId || !!fromChatHistory);
  const [initialAskMessage, setInitialAskMessage] = useState(askText || null);
  const [shellMeta, setShellMeta] = useState(DEFAULT_SHELL_META);
  const { playCompletion, prime: primeCompletionSound } = useAutoTrailieCompletionSound();

  useEffect(() => {
    if (askText && !guestResumingChat) setInitialAskMessage(askText);
  }, [askText, guestResumingChat]);

  if (loadingTrip) {
    return (
      <PlanAIShell loadingMessage="Loading trip data…" />
    );
  }

  const effectiveFormData = chatFormData || defaultFormData;
  const effectiveParkName = selectedParkName || '';
  const effectiveIsNewChat = tripId ? false : isNewChat;

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

    // Build a summary message to auto-send to the AI
    const parts = [];
    if (park) parts.push(`**Destination:** ${park.fullName}`);
    if (data.startDate && data.endDate) parts.push(`**Dates:** ${data.startDate} to ${data.endDate}`);
    if (data.groupSize) parts.push(`**Group size:** ${data.groupSize}`);
    if (data.interests?.length) parts.push(`**Interests:** ${data.interests.join(', ')}`);
    if (data.budget) parts.push(`**Budget:** ${data.budget}`);
    if (data.fitnessLevel) parts.push(`**Fitness level:** ${data.fitnessLevel}`);
    if (data.accommodation) parts.push(`**Accommodation:** ${data.accommodation}`);

    const message = hasAppliedQuickFill
      ? `I've updated my trip preferences:\n${parts.join('\n')}\n\nCan you adjust your suggestions based on these changes?`
      : `Here are my trip details:\n${parts.join('\n')}\n\nCan you suggest an itinerary based on these preferences?`;
    setQuickFillMessage(message);
    setHasAppliedQuickFill(true);
  };

  const headerActions = isAuthenticated ? (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {uniqueParksCount >= 3 && (
        <MyRecommendationsButton onClick={handlePersonalizedRecommendations} />
      )}
      <button
        type="button"
        onClick={handleStartNewChat}
        title="Start a new chat"
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold transition hover:opacity-90 sm:h-9 sm:gap-2 sm:px-3.5 sm:text-sm"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent-green) 12%, var(--bg-primary))',
          border: '1px solid color-mix(in srgb, var(--accent-green) 35%, var(--border))',
          color: 'var(--accent-green)',
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
          key={`chat-${newChatKey || tripId || guestChatSessionKey || effectiveFormData.parkCode || suggestText || 'generic'}`}
          formData={effectiveFormData}
          parkName={effectiveParkName}
          existingTripId={tripId}
          isPersonalized={isPersonalized}
          isNewChat={effectiveIsNewChat}
          suggestText={suggestText}
          entryMode={effectiveEntryMode}
          fromChatHistory={fromChatHistory}
          refreshTrips={refetchUserTrips}
          onOpenQuickFill={() => setQuickFillOpen(true)}
          quickFillMessage={quickFillMessage}
          onQuickFillSent={() => setQuickFillMessage(null)}
          initialAskMessage={initialAskMessage}
          onInitialAskSent={() => setInitialAskMessage(null)}
          playCompletionSound={playCompletion}
          primeCompletionSound={primeCompletionSound}
          onShellMetaChange={setShellMeta}
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
