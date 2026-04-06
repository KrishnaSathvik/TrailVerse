'use client';

import React, { useState } from 'react';
import { Loader2, Clock, Sparkles, Mountain, Check, LogIn } from '@components/icons';
import Header from '@components/common/Header';
import Footer from '@components/common/Footer';
import Button from '@components/common/Button';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import QuickFillModal from '@components/plan-ai/QuickFillModal';
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
    selectedParkName,
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
    isAuthenticated
  } = usePlanAI(tripId);
  const [quickFillOpen, setQuickFillOpen] = useState(false);

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
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <section className="flex flex-1 items-center justify-center py-16 sm:py-20">
          <div className="max-w-md mx-auto px-4 sm:px-6">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: '0 25px 50px rgba(0, 0, 0, 0.12)',
              }}
            >
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mountain className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    You&apos;ve Used Your 5 Free Messages
                  </h2>
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Create a free account to:
                </p>
                <ul className="space-y-1.5 mb-4">
                  {[
                    'Save this trip permanently',
                    'Unlimited AI trip planning',
                    'Drag-and-drop itinerary builder',
                    'Share trips with travel companions',
                    'Export as PDF',
                    'Save parks, track visits & write reviews',
                    'Access from any device',
                  ].map((prop) => (
                    <li key={prop} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                      {prop}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />

              <div className="px-6 py-4 space-y-3">
                <Button
                  onClick={() => { window.location.href = '/signup'; }}
                  variant="primary"
                  size="md"
                  icon={Sparkles}
                  className="w-full"
                >
                  Create Free Account
                </Button>
                <Button
                  onClick={() => { window.location.href = '/login'; }}
                  variant="secondary"
                  size="md"
                  icon={LogIn}
                  className="w-full"
                >
                  Sign In
                </Button>

                {timeUntilReset && (
                  <div className="pt-1">
                    <div
                      className="px-4 py-3 rounded-xl text-center"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        Or wait for free reset:
                      </p>
                      <p className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>
                        {timeUntilReset}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const effectiveFormData = chatFormData || defaultFormData;
  const effectiveParkName = selectedParkName || '';
  const effectiveIsNewChat = tripId ? false : (isNewChat || !chatFormData?.parkCode);

  const handleQuickFillApply = (data) => {
    setFormData(data);
    setQuickFillOpen(false);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        <section className="relative z-10 overflow-hidden border-b px-4 py-2 sm:px-6 sm:py-4 lg:px-10 xl:px-12" style={{ borderColor: 'var(--border)' }}>
          <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-[0.18em] sm:text-xs sm:tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                Plan AI
              </p>
              <h1 className="mt-1 truncate text-base font-semibold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                {effectiveParkName || 'Trip planner chat'}
              </h1>
            </div>

            {isAuthenticated && (
              <button
                type="button"
                onClick={handleStartNewChat}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:h-10 sm:rounded-xl sm:px-4 sm:text-sm"
                style={{
                  backgroundColor: 'var(--button-filled-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <Sparkles className="h-4 w-4" />
                <span>New Chat</span>
              </button>
            )}
          </div>
        </section>

        <div className="relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden">
          <TripPlannerChat
            formData={effectiveFormData}
            parkName={effectiveParkName}
            existingTripId={tripId}
            isPersonalized={isPersonalized}
            isNewChat={effectiveIsNewChat}
            suggestText={suggestText}
            refreshTrips={refetchUserTrips}
            onOpenQuickFill={() => setQuickFillOpen(true)}
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
