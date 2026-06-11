'use client';

import React, { useState } from 'react';
import { Sparkles } from '@components/icons';
import PlanAIShell from '@components/plan-ai/PlanAIShell';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import QuickFillModal from '@components/plan-ai/QuickFillModal';
import MyRecommendationsButton from '@components/plan-ai/MyRecommendationsButton';
import { MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE } from '@/lib/planAiWelcomeCopy';
import usePlanAI from '@hooks/usePlanAI';
import { useAutoTrailieCompletionSound } from '@/hooks/useTrailieCompletionSound';

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
    isRestoringState,
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
    newChatKey
  } = usePlanAI(tripId);
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [quickFillMessage, setQuickFillMessage] = useState(null);
  const [hasAppliedQuickFill, setHasAppliedQuickFill] = useState(!!tripId || !!fromChatHistory);
  const { playCompletion, prime: primeCompletionSound } = useAutoTrailieCompletionSound();

  if (isRestoringState || loadingTrip) {
    return (
      <PlanAIShell
        loadingMessage={loadingTrip ? 'Loading trip data...' : 'Loading your chat session...'}
      />
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
        title="New Chat"
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold transition sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm"
        style={{
          backgroundColor: 'var(--button-filled-bg)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          boxShadow: 'var(--shadow)'
        }}
      >
        <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">New Chat</span>
        <span className="sm:hidden">New</span>
      </button>
    </div>
  ) : null;

  return (
    <>
      <PlanAIShell
        title={isPersonalized ? 'My Recommendations' : effectiveParkName || 'Plan Your Trip'}
        subtitle={isPersonalized ? MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE : undefined}
        headerActions={headerActions}
      >
        <TripPlannerChat
          key={`chat-${newChatKey || tripId || effectiveFormData.parkCode || suggestText || 'generic'}`}
          formData={effectiveFormData}
          parkName={effectiveParkName}
          existingTripId={tripId}
          isPersonalized={isPersonalized}
          isNewChat={effectiveIsNewChat}
          suggestText={suggestText}
          fromChatHistory={fromChatHistory}
          refreshTrips={refetchUserTrips}
          onOpenQuickFill={() => setQuickFillOpen(true)}
          quickFillMessage={quickFillMessage}
          onQuickFillSent={() => setQuickFillMessage(null)}
          playCompletionSound={playCompletion}
          primeCompletionSound={primeCompletionSound}
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
