'use client';

import React, { useState } from 'react';
import { Loader2, Clock, Sparkles, CheckCircle, Edit2 } from '@components/icons';
import Header from '@components/common/Header';
import Footer from '@components/common/Footer';
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
    refetchUserTrips,
    allParks,
    parksLoading,
    interests,
    toggleInterest,
    handleStartNewChat
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
        <section className="py-16 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
            <div
              className="rounded-2xl p-6 sm:p-8 lg:p-10 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-xl)'
              }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                  style={{
                    backgroundColor: 'var(--accent-green)/10',
                    color: 'var(--accent-green)'
                  }}
                >
                  <Clock className="h-8 w-8" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  You&apos;ve Used Your 5 Free Questions
                </h2>
                <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  You&apos;ve reached your limit of 5 free questions. Create an account for unlimited access, or wait until your session resets.
                </p>
              </div>

              {timeUntilReset && (
                <div
                  className="mb-8 px-4 py-4 rounded-xl text-center"
                  style={{
                    backgroundColor: 'var(--accent-green)/10',
                    borderWidth: '1px',
                    borderColor: 'var(--accent-green)/20'
                  }}
                >
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Session resets in:
                  </p>
                  <p className="text-3xl font-bold" style={{ color: 'var(--accent-green)' }}>
                    {timeUntilReset}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div
                  className="rounded-xl p-5 sm:p-6"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--accent-green)/10',
                        color: 'var(--accent-green)'
                      }}
                    >
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        Create Account
                      </h3>
                      <p className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>
                        Recommended
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2.5">
                    {[
                      'Ask unlimited questions',
                      'Save your trip plans',
                      'Access conversation history',
                      'Get personalized recommendations'
                    ].map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckCircle
                          className="h-4 w-4 flex-shrink-0 mt-0.5"
                          style={{ color: 'var(--accent-green)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  className="rounded-xl p-5 sm:p-6"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--text-tertiary)/10',
                        color: 'var(--text-tertiary)'
                      }}
                    >
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        Wait for Reset
                      </h3>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Free Option
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2.5">
                    {[
                      'Get 5 fresh questions',
                      'No account required',
                      'Completely free',
                      'Session resets automatically'
                    ].map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckCircle
                          className="h-4 w-4 flex-shrink-0 mt-0.5"
                          style={{ color: 'var(--text-tertiary)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
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
          </div>
        </section>

        <div className="relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden">
          <TripPlannerChat
            formData={effectiveFormData}
            parkName={effectiveParkName}
            existingTripId={tripId}
            isPersonalized={isPersonalized}
            isNewChat={effectiveIsNewChat}
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
