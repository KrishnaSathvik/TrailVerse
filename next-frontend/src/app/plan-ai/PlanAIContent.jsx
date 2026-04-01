'use client';

import React from 'react';
import {
  Sparkles, MapPin, Calendar, Users, Tent,
  Utensils, ArrowRight, ArrowLeft, Loader2, ChevronDown,
  MessageCircle, Plus, Clock, CheckCircle, LogIn, X,
  Mountain, Camera, Trees, Car, Route, Star, Landmark, FolderSimple
} from '@components/icons';
import Header from '@components/common/Header';
import Footer from '@components/common/Footer';
import Button from '@components/common/Button';
import TripPlannerChat from '@components/plan-ai/TripPlannerChat';
import TripSummaryCard from '@components/profile/TripSummaryCard';
import usePlanAI from '@hooks/usePlanAI';

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

  // Show loading screen while restoring state or loading trip
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

  // If chat is active, show chat interface
  if (showChat && chatFormData) {
    return (
      <TripPlannerChat
        formData={chatFormData}
        parkName={selectedParkName}
        onBack={handleBackToForm}
        existingTripId={tripId} // Pass trip ID
        isPersonalized={isPersonalized}
        isNewChat={isNewChat}
        refreshTrips={refetchUserTrips}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero - Hide when limit reached */}
      {!showLimitDialog && (
        <section className="relative overflow-hidden py-8 sm:py-20">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
          </div>

          <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 text-center">

          <div className="mt-3 sm:mt-6">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                AI Trip Planner
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Plan Your Perfect Trip
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Answer a few questions and let AI create a personalized itinerary
              tailored to your interests and travel style.
            </p>
          </div>
        </div>
      </section>
      )}

      {/* Limit Reached Message - Show instead of form */}
      {showLimitDialog ? (
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
                  You've Used Your 3 Free Questions
                </h2>
                <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  You've reached your limit of 3 free questions. Create an account for unlimited access, or wait until your session resets.
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
      ) : (
      /* Form - Show when limit not reached */
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Step {step} of {totalSteps}
              </span>
              <span className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {Math.round((step / totalSteps) * 100)}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <div
                className="h-full bg-forest-500 transition-all duration-500"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          {/* Form Card */}
          <div className="rounded-3xl p-8 sm:p-12 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            {/* Step 1: Destination */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Where do you want to go?
                  </h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Choose a national park to explore
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Select National Park
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                    <select
                      value={formData.parkCode}
                      onChange={(e) => {
                        const selectedPark = allParks?.find(p => p.parkCode === e.target.value);
                        setFormData({
                          ...formData,
                          parkCode: e.target.value,
                          coordinates: selectedPark ? {
                            lat: parseFloat(selectedPark.latitude),
                            lon: parseFloat(selectedPark.longitude)
                          } : null
                        });
                      }}
                      disabled={parksLoading}
                      className="w-full pl-12 pr-10 py-4 rounded-xl text-base font-medium outline-none transition cursor-pointer appearance-none disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="">
                        {parksLoading ? 'Loading national parks...' : parksError ? 'Error loading parks' : 'Choose a national park...'}
                      </option>
                      {allParks?.filter(park => park.designation === 'National Park').map(park => (
                        <option key={park.parkCode} value={park.parkCode}>
                          {park.fullName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 pointer-events-none"
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Dates */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    When are you traveling?
                  </h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Select your travel dates
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Start Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full pl-12 pr-4 py-4 rounded-xl text-base font-medium outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      End Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                        style={{ color: 'var(--text-tertiary)' }}
                      />
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        min={formData.startDate || new Date().toISOString().split('T')[0]}
                        className="w-full pl-12 pr-4 py-4 rounded-xl text-base font-medium outline-none transition"
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Group Size
                  </label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5"
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                    <input
                      type="number"
                      value={formData.groupSize || ''}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1;
                        setFormData({ ...formData, groupSize: value });
                      }}
                      min="1"
                      max="20"
                      className="w-full pl-12 pr-4 py-4 rounded-xl text-base font-medium outline-none transition"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Interests */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    What are you interested in?
                  </h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Select all activities you&apos;d like to do
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {interests.map((interest) => {
                    const isSelected = formData.interests.includes(interest.id);

                    return (
                      <Button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        variant={isSelected ? 'primary' : 'ghost'}
                        size="md"
                        className="p-4 text-center flex flex-col"
                      >
                        <div className="h-8 w-8 mx-auto mb-2 flex items-center justify-center">
                          <span className="text-3xl">{interest.icon}</span>
                        </div>
                        <div className="text-sm">{interest.label}</div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Preferences */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Final preferences
                  </h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Tell us about your budget and fitness level
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Budget Level
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {['budget', 'moderate', 'luxury'].map((level) => (
                      <Button
                        key={level}
                        onClick={() => setFormData({ ...formData, budget: level })}
                        variant={formData.budget === level ? 'primary' : 'ghost'}
                        size="md"
                        className="p-4 text-center"
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Fitness Level
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {['easy', 'moderate', 'strenuous'].map((level) => (
                      <Button
                        key={level}
                        onClick={() => setFormData({ ...formData, fitnessLevel: level })}
                        variant={formData.fitnessLevel === level ? 'primary' : 'ghost'}
                        size="md"
                        className="p-4 text-center"
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3 uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Accommodation
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['camping', 'lodging'].map((type) => (
                      <Button
                        key={type}
                        onClick={() => setFormData({ ...formData, accommodation: type })}
                        variant={formData.accommodation === type ? 'primary' : 'ghost'}
                        size="md"
                        icon={type === 'camping' ? Tent : Utensils}
                        className="p-4 text-center flex flex-col"
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-center gap-4 mt-8 pt-8 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <Button
                onClick={handleBack}
                disabled={step === 1}
                variant="secondary"
                size="lg"
                icon={ArrowLeft}
                className="min-w-[140px] h-[52px] whitespace-nowrap flex items-center justify-center"
              >
                Back
              </Button>

              <Button
                onClick={handleNext}
                disabled={step === 1 && parksLoading}
                loading={step === 1 && parksLoading}
                variant="secondary"
                size="lg"
                icon={step === totalSteps ? Sparkles : ArrowRight}
                iconPosition={step === totalSteps ? 'left' : 'right'}
                className="min-w-[140px] h-[52px] whitespace-nowrap flex items-center justify-center"
              >
                {step === 1 && parksLoading ? 'Loading...' : step === totalSteps ? 'Generate Plan' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Divider and Quick Actions - Only show if user has at least one conversation */}
      {!showLimitDialog && user && tripHistory.length > 0 && (
        <>
          {/* Divider */}
          <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 mb-16">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 py-2 rounded-full" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>
                  Or skip the form and chat directly
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <section className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 mb-16 sm:mb-20">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Start Planning Instantly
              </h2>
              <p className="text-base sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
                Jump right into a conversation with our AI assistant
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start New Chat */}
              <button
                onClick={handleStartNewChat}
                className="group p-8 rounded-2xl text-left transition-all duration-300 hover:-translate-y-1"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div className="p-4 rounded-xl mb-4 w-fit"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Start New Chat
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Begin a conversation with our AI to plan any national park adventure
                </p>
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--accent-green)' }}>
                  Start Planning
                  <Plus className="h-4 w-4" />
                </div>
              </button>

              {/* Personalized Recommendations - Only show if user has 3+ unique parks */}
              {uniqueParksCount >= 3 && (
                <button
                  onClick={handlePersonalizedRecommendations}
                  className="group p-8 rounded-2xl text-left transition-all duration-300 hover:-translate-y-1"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--shadow)'
                  }}
                >
                  <div className="p-4 rounded-xl mb-4 w-fit"
                    style={{ backgroundColor: 'var(--accent-purple)' }}
                  >
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Get Recommendations
                  </h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    AI recommendations based on your trip history and preferences
                  </p>
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--accent-purple)' }}>
                    Personalize
                    <Sparkles className="h-4 w-4" />
                  </div>
                </button>
              )}

              {/* If less than 3 unique parks, show a placeholder or single column */}
              {uniqueParksCount < 3 && (
                <div className="p-8 rounded-2xl text-center"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    borderStyle: 'dashed'
                  }}
                >
                  <div className="p-4 rounded-xl mb-4 w-fit mx-auto"
                    style={{ backgroundColor: 'var(--surface)' }}
                  >
                    <Sparkles className="h-6 w-6" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                    More Recommendations Coming Soon
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Plan trips to 3+ different parks to unlock personalized recommendations
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Trip History with Tabs */}
      {(tripHistory.length > 0 || archivedTrips.length > 0) && (
        <section className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 mb-16 sm:mb-20">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Your Trip History
            </h2>
            <p className="text-base sm:text-lg" style={{ color: 'var(--text-secondary)' }}>
              All your AI planning sessions (automatically saved)
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-8">
            <div className="flex rounded-lg p-1 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <button
                onClick={() => setActiveTab('active')}
                className={`px-6 py-3 rounded-md font-medium transition-all duration-200 ${
                  activeTab === 'active'
                    ? 'text-white shadow-sm'
                    : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: activeTab === 'active' ? 'var(--accent-green)' : 'transparent',
                  color: activeTab === 'active' ? 'white' : 'var(--text-secondary)'
                }}
              >
                Active ({tripHistory.length})
              </button>
              <button
                onClick={() => setActiveTab('archive')}
                className={`px-6 py-3 rounded-md font-medium transition-all duration-200 ${
                  activeTab === 'archive'
                    ? 'text-white shadow-sm'
                    : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: activeTab === 'archive' ? 'var(--accent-green)' : 'transparent',
                  color: activeTab === 'archive' ? 'white' : 'var(--text-secondary)'
                }}
              >
                Archive ({archivedTrips.length})
              </button>
            </div>
          </div>

          {/* Trip Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activeTab === 'active' ? (
              tripHistory.map((trip) => (
                <TripSummaryCard
                  key={trip._id || trip.id}
                  trip={trip}
                  onArchive={() => handleArchiveTrip(trip._id || trip.id)}
                  onDelete={() => handleDeleteTrip(trip._id || trip.id)}
                  isDeleting={deletingTripId === (trip._id || trip.id)}
                />
              ))
            ) : (
              archivedTrips.map((trip) => (
                <TripSummaryCard
                  key={trip._id || trip.id}
                  trip={trip}
                  onRestore={() => handleRestoreTrip(trip._id || trip.id)}
                  onDelete={() => handleDeleteTrip(trip._id || trip.id)}
                  isDeleting={deletingTripId === (trip._id || trip.id)}
                  isRestoring={restoringTripId === (trip._id || trip.id)}
                />
              ))
            )}
          </div>

          {/* Empty State */}
          {((activeTab === 'active' && tripHistory.length === 0) || (activeTab === 'archive' && archivedTrips.length === 0)) && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4"><FolderSimple className="inline h-16 w-16" style={{ color: 'var(--text-tertiary)' }} /></div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                {activeTab === 'active' ? 'No Active Trips' : 'No Archived Trips'}
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {activeTab === 'active'
                  ? 'Start planning your first trip above!'
                  : 'Archive some trips to see them here.'}
              </p>
            </div>
          )}
        </section>
      )}

      <Footer />
    </div>
  );
};

export default PlanAIContent;
