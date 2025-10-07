import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  Sparkles, MapPin, Calendar, Users, Tent, 
  Utensils, ArrowRight, ArrowLeft, Loader2, ChevronDown
} from 'lucide-react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import Button from '../components/common/Button';
import TripPlannerChat from '../components/plan-ai/TripPlannerChat';
import { useParks } from '../hooks/useParks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTrips } from '../hooks/useTrips';

const PlanAIPage = () => {
  const navigate = useNavigate();
  const { tripId } = useParams(); // Get trip ID from URL
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { data: allParks, isLoading: parksLoading, error: parksError } = useParks();
  useTrips();
  const [showChat, setShowChat] = useState(false);
  const [chatFormData, setChatFormData] = useState(null);
  const [selectedParkName, setSelectedParkName] = useState('');
  const [step, setStep] = useState(1);
  const [isRestoringState, setIsRestoringState] = useState(true);

  // Handle URL parameters for park context
  useEffect(() => {
    const parkCode = searchParams.get('park');
    const parkName = searchParams.get('name');
    
    if (parkCode && parkName && allParks) {
      const selectedPark = allParks.find(p => p.parkCode === parkCode);
      setSelectedParkName(parkName);
      
      // Pre-fill form data with park info including coordinates
      setFormData(prev => ({
        ...prev,
        parkCode,
        coordinates: selectedPark ? {
          lat: parseFloat(selectedPark.latitude),
          lon: parseFloat(selectedPark.longitude)
        } : null
      }));
      
      // Auto-advance to chat with park context (but don't pre-fill trip details)
      const defaultFormData = {
        parkCode,
        coordinates: selectedPark ? {
          lat: parseFloat(selectedPark.latitude),
          lon: parseFloat(selectedPark.longitude)
        } : null,
        startDate: '', // Let user provide this
        endDate: '', // Let user provide this
        groupSize: 1,
        budget: '',
        interests: [],
        fitnessLevel: '',
        accommodation: ''
      };
      
      setChatFormData(defaultFormData);
      setShowChat(true);
      setStep(4);
    }
  }, [searchParams, allParks]);

  // Load persisted state from localStorage on component mount
  useEffect(() => {
    const savedState = localStorage.getItem('planai-chat-state');
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        // Only restore if we have valid chat state AND we're not coming from a back navigation
        if (parsedState.showChat && parsedState.chatFormData) {
          // Check if this is a fresh page load (not a back navigation)
          // We can detect this by checking if the state was recently cleared
          const lastClearTime = localStorage.getItem('planai-chat-last-clear');
          const now = Date.now();
          const timeSinceClear = lastClearTime ? now - parseInt(lastClearTime) : Infinity;
          
          // Only restore if it's been more than 5 seconds since last clear (fresh page load)
          if (timeSinceClear > 5000) {
            setShowChat(parsedState.showChat);
            setChatFormData(parsedState.chatFormData);
            setSelectedParkName(parsedState.selectedParkName || '');
            // Session restoration runs silently in background - no toast notification
          } else {
            // Recent clear detected, remove the state
            localStorage.removeItem('planai-chat-state');
          }
        }
      } catch (error) {
        console.error('Error loading saved chat state:', error);
        localStorage.removeItem('planai-chat-state');
      }
    }
    setIsRestoringState(false);
  }, []); // Removed showToast from dependencies to prevent infinite loop

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (showChat && chatFormData) {
      const stateToSave = {
        showChat,
        chatFormData,
        selectedParkName
      };
      localStorage.setItem('planai-chat-state', JSON.stringify(stateToSave));
    } else {
      localStorage.removeItem('planai-chat-state');
    }
  }, [showChat, chatFormData, selectedParkName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Only clear if we're not in chat mode (to preserve state on refresh)
      if (!showChat) {
        localStorage.removeItem('planai-chat-state');
      }
    };
  }, [showChat]);

  // Handle page unload to preserve chat state on refresh but clear on navigation away
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Don't clear localStorage on refresh - let the page reload handle it
      // Only clear if user is navigating away from the page
      if (!e.persisted) {
        // This is a navigation away from the page, not a refresh
        localStorage.removeItem('planai-chat-state');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const [formData, setFormData] = useState({
    parkCode: '',
    startDate: '',
    endDate: '',
    groupSize: 2,
    budget: 'moderate',
    interests: [],
    fitnessLevel: 'moderate',
    accommodation: 'camping'
  });

  const totalSteps = 4;

  const interests = [
    { id: 'hiking', label: 'Hiking', icon: '🏔️' },
    { id: 'photography', label: 'Photography', icon: '📸' },
    { id: 'wildlife', label: 'Wildlife', icon: '🦌' },
    { id: 'camping', label: 'Camping', icon: '⛺' },
    { id: 'scenic-drives', label: 'Scenic Drives', icon: '🚗' },
    { id: 'water-activities', label: 'Water Activities', icon: '🚣' },
    { id: 'stargazing', label: 'Stargazing', icon: '⭐' },
    { id: 'history', label: 'History & Culture', icon: '🏛️' }
  ];

  const toggleInterest = (interestId) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interestId)
        ? prev.interests.filter(id => id !== interestId)
        : [...prev.interests, interestId]
    }));
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step < totalSteps) {
        setStep(step + 1);
      } else {
        handleGenerate();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const validateStep = () => {
    switch (step) {
      case 1:
        if (parksLoading) {
          showToast('Please wait while parks are loading', 'info');
          return false;
        }
        if (!formData.parkCode) {
          showToast('Please select a park', 'error');
          return false;
        }
        break;
      case 2:
        if (!formData.startDate || !formData.endDate) {
          showToast('Please select travel dates', 'error');
          return false;
        }
        if (new Date(formData.startDate) >= new Date(formData.endDate)) {
          showToast('End date must be after start date', 'error');
          return false;
        }
        break;
      case 3:
        if (formData.interests.length === 0) {
          showToast('Please select at least one interest', 'error');
          return false;
        }
        break;
      default:
        return true;
    }
    return true;
  };

  const handleGenerate = () => {
    if (!isAuthenticated) {
      showToast('Please sign in to generate trip plans', 'error');
      navigate('/login');
      return;
    }

    const selectedPark = allParks?.find(p => p.parkCode === formData.parkCode);
    setSelectedParkName(selectedPark?.fullName || 'Unknown Park');
    setChatFormData(formData);
    setShowChat(true);
  };

  const handleBackToForm = () => {
    // Clear localStorage first to prevent restoration
    localStorage.removeItem('planai-chat-state');
    // Set timestamp to prevent restoration on page refresh
    localStorage.setItem('planai-chat-last-clear', Date.now().toString());
    setShowChat(false);
    setChatFormData(null);
    setStep(1);
  };

  // Show loading screen while restoring state
  if (isRestoringState) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading your chat session...</p>
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
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

          <div className="mt-6">
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
            <p className="text-lg sm:text-xl max-w-2xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Answer a few questions and let AI create a personalized itinerary 
              tailored to your interests and travel style.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
                    Select Park
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
                        {parksLoading ? 'Loading parks...' : parksError ? 'Error loading parks' : 'Choose a park...'}
                      </option>
                      {allParks?.map(park => (
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
                        variant={isSelected ? 'primary' : 'secondary'}
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
                        variant={formData.budget === level ? 'primary' : 'secondary'}
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
                        variant={formData.fitnessLevel === level ? 'primary' : 'secondary'}
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
                        variant={formData.accommodation === type ? 'primary' : 'secondary'}
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
            <div className="flex items-center justify-between mt-8 pt-8 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <Button
                onClick={handleBack}
                disabled={step === 1}
                variant="secondary"
                size="lg"
                icon={ArrowLeft}
              >
                Back
              </Button>

              <Button
                onClick={handleNext}
                disabled={step === 1 && parksLoading}
                loading={step === 1 && parksLoading}
                variant="primary"
                size="lg"
                icon={step === totalSteps ? Sparkles : ArrowRight}
                iconPosition={step === totalSteps ? 'left' : 'right'}
              >
                {step === 1 && parksLoading ? 'Loading...' : step === totalSteps ? 'Generate Plan' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PlanAIPage;
