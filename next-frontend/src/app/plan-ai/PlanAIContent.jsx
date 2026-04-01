'use client';

import React, { useState } from 'react';
import {
  Sparkles, Loader2, Clock, CheckCircle, Menu, X, Edit2
} from '@components/icons';
import Header from '@components/common/Header';
import Footer from '@components/common/Footer';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import TripHistoryDrawer from '@components/plan-ai/TripHistoryDrawer';
import TripContextBar from '@components/plan-ai/TripContextBar';
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
    // State
    showChat, chatFormData, selectedParkName, step, isRestoringState, loadingTrip,
    isReturningUser, tripHistory, archivedTrips, uniqueParksCount,
    deletingTripId, restoringTripId, activeTab, showLimitDialog, timeUntilReset,
    formData, isPersonalized, isNewChat, isPublicAccess,
    allParks, parksLoading, parksError, user, isAuthenticated,

    // Setters
    setShowChat, setChatFormData, setSelectedParkName, setStep, setActiveTab, setFormData,

    // Handlers
    handleNext, handleBack, validateStep, handleGenerate,
    handleBackToForm, handleStartNewChat, handlePersonalizedRecommendations,
    handleDeleteTrip, handleArchiveTrip, handleRestoreTrip,
    toggleInterest, loadTripFromBackend, refetchUserTrips,

    // Constants
    totalSteps, interests
  } = usePlanAI(tripId);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [quickFillOpen, setQuickFillOpen] = useState(false);

  // Loading screen while restoring state or loading trip
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

  // Limit dialog for anonymous users
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
              {/* Header */}
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
                  You&apos;ve Used Your 3 Free Questions
                </h2>
                <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  You&apos;ve reached your limit of 3 free questions. Create an account for unlimited access, or wait until your session resets.
                </p>
              </div>

              {/* Countdown Timer */}
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

              {/* Feature Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Create Account Card */}
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
                    ].map((feature, index) => (
                      <li key={index} className="flex items-start gap-2.5">
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

                {/* Wait Option Card */}
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
                      'Get 3 fresh questions',
                      'No account required',
                      'Completely free',
                      'Session resets automatically'
                    ].map((feature, index) => (
                      <li key={index} className="flex items-start gap-2.5">
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

  // Determine the effective form data and park name for chat
  const effectiveFormData = chatFormData || defaultFormData;
  const effectiveParkName = selectedParkName || '';
  const effectiveIsNewChat = isNewChat || !chatFormData?.parkCode;

  // Handler to select a trip from the drawer
  const handleSelectTrip = (selectedTripId) => {
    setHistoryOpen(false);
    loadTripFromBackend(selectedTripId);
  };

  // Handler for new chat from drawer
  const handleNewChatFromDrawer = () => {
    setHistoryOpen(false);
    handleStartNewChat();
  };

  // Handler for QuickFill apply
  const handleQuickFillApply = (data) => {
    const selectedPark = allParks?.find(p => p.parkCode === data.parkCode);
    const parkName = selectedPark?.fullName || '';
    setChatFormData(data);
    setSelectedParkName(parkName);
    setQuickFillOpen(false);
    setShowChat(true);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Trip History Drawer */}
      {user && (tripHistory.length > 0 || archivedTrips.length > 0) && (
        <TripHistoryDrawer
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          tripHistory={tripHistory}
          archivedTrips={archivedTrips}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onSelectTrip={handleSelectTrip}
          onArchive={handleArchiveTrip}
          onRestore={handleRestoreTrip}
          onDelete={handleDeleteTrip}
          onNewChat={handleNewChatFromDrawer}
          deletingTripId={deletingTripId}
          restoringTripId={restoringTripId}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header bar */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)'
          }}
        >
          {/* History toggle - only show if user has trips */}
          {user && (tripHistory.length > 0 || archivedTrips.length > 0) && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="p-2 rounded-lg transition-colors hover:opacity-80 flex-shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Open trip history"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
            <span className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              Plan AI
            </span>
          </div>

          {/* Quick Fill button */}
          <button
            onClick={() => setQuickFillOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 flex-shrink-0"
            style={{
              backgroundColor: 'var(--surface-hover)',
              color: 'var(--text-secondary)',
              border: '1px solid',
              borderColor: 'var(--border)'
            }}
          >
            <Edit2 className="h-3.5 w-3.5" />
            Quick Fill
          </button>
        </header>

        {/* Trip Context Bar - show when there is active context */}
        <TripContextBar
          parkName={effectiveParkName}
          formData={effectiveFormData}
          onEdit={() => setQuickFillOpen(true)}
        />

        {/* Chat - always visible (chat-first approach) */}
        <TripPlannerChat
          formData={effectiveFormData}
          parkName={effectiveParkName}
          onBack={handleBackToForm}
          existingTripId={tripId}
          isPersonalized={isPersonalized}
          isNewChat={effectiveIsNewChat}
          refreshTrips={refetchUserTrips}
        />
      </div>

      {/* Quick Fill Modal */}
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
