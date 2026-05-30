'use client';

import React, { useState } from 'react';
import { Loader2, Sparkles } from '@components/icons';
import Header from '@components/common/Header';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import QuickFillModal from '@components/plan-ai/QuickFillModal';
import MyRecommendationsButton from '@components/plan-ai/MyRecommendationsButton';
import SignupPromptPanel from '@components/plan-ai/SignupPromptPanel';
import { SIGNUP_PROMPT_REASONS } from '@/lib/planAiSignupPrompts';
import { MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE } from '@/lib/planAiWelcomeCopy';
import usePlanAI from '@hooks/usePlanAI';

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
    showLimitDialog,
    timeUntilReset,
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

  if (isRestoringState || loadingTrip) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>
            {loadingTrip ? 'Loading trip data...' : 'Loading your chat session...'}
          </p>
        </div>
      </div>
    );
  }

  if (showLimitDialog) {
    const storeReturnToChat = () => {
      const saved = localStorage.getItem('anonymousSession');
      let anonymousId;
      try {
        anonymousId = saved ? JSON.parse(saved).anonymousId : undefined;
      } catch {
        anonymousId = undefined;
      }
      localStorage.setItem('returnToChat', JSON.stringify({
        anonymousId,
        parkName: selectedParkName,
        formData: chatFormData || formData,
        messages: [],
        timestamp: Date.now(),
      }));
    };

    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <section className="flex flex-1 items-center justify-center py-16 sm:py-20">
          <div className="max-w-md mx-auto px-4 sm:px-6 w-full">
            <SignupPromptPanel
              reason={SIGNUP_PROMPT_REASONS.MESSAGE_LIMIT}
              parkName={selectedParkName}
              onSignup={() => {
                storeReturnToChat();
                window.location.href = '/signup';
              }}
              onLogin={() => {
                storeReturnToChat();
                window.location.href = '/login';
              }}
              timeUntilReset={timeUntilReset}
            />
          </div>
        </section>
      </div>
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

  return (
    <div className="h-dvh flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        <section className="relative z-30 shrink-0 overflow-visible border-b px-4 py-2 sm:px-6 sm:py-4 lg:px-10 xl:px-12" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-[0.18em] sm:text-xs sm:tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Trailie
              </p>
              <h1 className="mt-1 truncate text-base font-semibold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                {isPersonalized ? 'My Recommendations' : effectiveParkName || 'Plan Your Trip'}
              </h1>
              {isPersonalized && (
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE}
                </p>
              )}
            </div>

            {isAuthenticated && (
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
            )}
          </div>
        </section>

        <div className="relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden">
          <TripPlannerChat
            key={`chat-${newChatKey || tripId || 'default'}`}
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
          />
        </div>
      </main>

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
    </div>
  );
};

export default PlanAIContent;
