'use client';

import React, { useState } from 'react';
import {
  X, MapPin, Calendar, Users, ChevronDown,
  ArrowRight, ArrowLeft, Sparkles, Tent, Utensils
} from '@components/icons';
import Button from '@components/common/Button';

const QuickFillModal = ({
  isOpen,
  onClose,
  formData,
  setFormData,
  allParks,
  parksLoading,
  interests,
  toggleInterest,
  onApply
}) => {
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleApply();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleApply = () => {
    onApply(formData);
    setStep(1);
  };

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 sm:p-8"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Step {step} of {totalSteps}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {Math.round((step / totalSteps) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-hover)' }}>
            <div
              className="h-full bg-forest-500 transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Park selector */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
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
                    {parksLoading ? 'Loading national parks...' : 'Choose a national park...'}
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

        {/* Step 2: Dates & Group Size */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
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
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
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

        {/* Step 4: Budget, Fitness, Accommodation */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
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

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            {step > 1 && (
              <Button
                onClick={handleBack}
                variant="secondary"
                size="md"
                icon={ArrowLeft}
              >
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Apply & Chat - available on every step */}
            <Button
              onClick={handleApply}
              variant="primary"
              size="md"
              icon={Sparkles}
            >
              Apply &amp; Chat
            </Button>

            {step < totalSteps && (
              <Button
                onClick={handleNext}
                variant="secondary"
                size="md"
                icon={ArrowRight}
                iconPosition="right"
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickFillModal;
