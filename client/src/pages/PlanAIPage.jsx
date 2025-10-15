import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  Sparkles, MapPin, Calendar, Users, Tent, 
  Utensils, ArrowRight, ArrowLeft, Loader2, ChevronDown,
  MessageCircle, Plus
} from '@components/icons';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import Button from '../components/common/Button';
import TripPlannerChat from '../components/plan-ai/TripPlannerChat';
import TripSummaryCard from '../components/profile/TripSummaryCard';
import { useAllParks } from '../hooks/useParks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTrips } from '../hooks/useTrips';
import tripService from '../services/tripService';
import { tripHistoryService } from '../services/tripHistoryService';

const PlanAIPage = () => {
  const navigate = useNavigate();
  const { tripId } = useParams(); // Get trip ID from URL
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();
  const { data: allParksData, isLoading: parksLoading, error: parksError } = useAllParks();
  const allParks = allParksData?.data;
  const { trips: userTrips, loading: tripsLoading, refreshTrips: refetchUserTrips } = useTrips();
  const [showChat, setShowChat] = useState(false);
  const [chatFormData, setChatFormData] = useState(null);
  const [selectedParkName, setSelectedParkName] = useState('');
  const [step, setStep] = useState(1);
  const [isRestoringState, setIsRestoringState] = useState(true);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [tripHistory, setTripHistory] = useState([]);
  const [archivedTrips, setArchivedTrips] = useState([]);
  const [uniqueParksCount, setUniqueParksCount] = useState(0);
  const [deletingTripId, setDeletingTripId] = useState(null);
  const [restoringTripId, setRestoringTripId] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  // Load trip data - always from database (no more localStorage trips)
  const loadTripFromBackend = useCallback(async (tripId) => {
    setLoadingTrip(true);
    try {
      // Fetch trip from database
      const response = await tripService.getTrip(tripId);
      const trip = response.data || response;
      
      if (trip) {
        setChatFormData(trip.formData);
        setSelectedParkName(trip.parkName || '');
        setShowChat(true);
        setStep(4);
      } else {
        showToast('Trip not found', 'error');
        navigate('/profile');
      }
    } catch (error) {
      console.error('Error loading trip:', error);
      showToast('Failed to load trip data', 'error');
      navigate('/profile');
    } finally {
      setLoadingTrip(false);
    }
  }, [showToast, navigate]);

  // Handle URL parameters for park context and chat mode
  useEffect(() => {
    const parkCode = searchParams.get('park');
    const parkName = searchParams.get('name');
    const showChatDirectly = searchParams.get('chat') === 'true';
    const isPersonalized = searchParams.get('personalized') === 'true';
    const isNewChat = searchParams.get('newchat') === 'true';
    
    // Handle personalized recommendations
    if (isPersonalized) {
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
      
      setChatFormData(defaultFormData);
      setShowChat(true);
      setStep(4);
      return;
    }
    
    // Handle new chat
    if (isNewChat) {
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
      
      setChatFormData(defaultFormData);
      setShowChat(true);
      setStep(4);
      return;
    }
    
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
    } else if (showChatDirectly && tripId) {
      // If chat=true parameter is present and we have a tripId, load trip data from backend and show chat directly
      loadTripFromBackend(tripId);
    }
  }, [searchParams, allParks, tripId, showToast, navigate, loadTripFromBackend]);

  // Load trip history and check if user is returning
  useEffect(() => {
    // Skip this check if we're loading a specific trip or have URL parameters
    if (tripId || searchParams.get('park') || searchParams.get('chat') || searchParams.get('personalized') || searchParams.get('newchat')) {
      setIsRestoringState(false);
      return;
    }

    const savedState = localStorage.getItem('planai-chat-state');
    
    // Load trip history and check if user is returning
    if (user) {
      // If userTrips is available, process it
      if (userTrips) {
        console.log('🔄 PlanAIPage: Raw userTrips from DB:', userTrips);
        console.log('🔄 PlanAIPage: Trip statuses:', userTrips.map(t => ({ id: t._id || t.id, status: t.status, title: t.title || t.parkName })));
        
        const activeTrips = userTrips.filter(t => t.status === 'active');
        const archivedTripsList = userTrips.filter(t => t.status === 'archived');
        
        console.log('🔄 PlanAIPage: Active trips:', activeTrips.length);
        console.log('🔄 PlanAIPage: Archived trips:', archivedTripsList.length);
        
        setTripHistory(activeTrips.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
        setArchivedTrips(archivedTripsList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
        
        // Calculate unique parks for personalized recommendations
        const uniqueParks = new Set(activeTrips.map(trip => trip.parkCode).filter(Boolean));
        setUniqueParksCount(uniqueParks.size);
        
        const hasUsedPlanAI = activeTrips.length > 0;
        
        if (hasUsedPlanAI) {
          setIsReturningUser(true);
        }
      } else {
        // If userTrips is not loaded yet, set empty arrays
        setTripHistory([]);
        setArchivedTrips([]);
        setUniqueParksCount(0);
      }
      
      // DON'T restore chat state on page refresh
      // Users should always land on the main Plan AI page
      // They can continue conversations by clicking "Continue Chat" from history
      if (savedState) {
        // Clear the saved state since we're not restoring it
        localStorage.removeItem('planai-chat-state');
        console.log('🔄 Cleared saved chat state - user will start on main page');
      }
      
      setIsRestoringState(false);
    } else {
      // No user logged in
      if (savedState) {
        try {
          const parsedState = JSON.parse(savedState);
          if (parsedState.showChat && parsedState.chatFormData) {
            setShowChat(parsedState.showChat);
            setChatFormData(parsedState.chatFormData);
            setSelectedParkName(parsedState.selectedParkName || '');
            console.log('🔄 Restored chat state from localStorage');
          }
        } catch (error) {
          console.error('Error loading saved chat state:', error);
          localStorage.removeItem('planai-chat-state');
        }
      }
      setIsRestoringState(false);
    }
  }, [user, userTrips, tripId, searchParams, navigate]);

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

  // Cleanup on unmount - preserve chat state for refresh
  useEffect(() => {
    return () => {
      // Don't clear localStorage on unmount - preserve for page refresh
    };
  }, []);

  // Simple persistence - always preserve chat state on refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Don't clear localStorage on page unload - preserve for refresh
      // Only clear when explicitly navigating away via handleBackToForm
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
    
    // Scroll to top when entering chat
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleBackToForm = () => {
    // Always return to main Plan AI page (unified page)
    localStorage.removeItem('planai-chat-state');
    setShowChat(false);
    setChatFormData(null);
    setStep(1);
    
    // Navigate to base /plan-ai URL (removes tripId and query params)
    navigate('/plan-ai', { replace: true });
  };

  const handleStartNewChat = () => {
    // Start generic AI chat without park context
    const defaultFormData = {
      parkCode: '',
      coordinates: null,
      startDate: '',
      endDate: '',
      groupSize: 1,
      budget: 'moderate',
      interests: [],
      fitnessLevel: 'moderate',
      accommodation: 'camping'
    };
    setChatFormData(defaultFormData);
    setSelectedParkName('');
    setShowChat(true);
    // Add newchat flag to show proper welcome message
    navigate('/plan-ai?newchat=true');
  };

  const handlePersonalizedRecommendations = () => {
    // Navigate to chat with personalized flag for personalized welcome
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
    setChatFormData(defaultFormData);
    setShowChat(true);
    // Add personalized flag
    navigate('/plan-ai?personalized=true');
  };

  const handleDeleteTrip = async (tripId) => {
    if (!window.confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingTripId(tripId);
      await tripService.deleteTrip(tripId);
      
      // Refresh trip history using the hook
      await refetchUserTrips();
      
      showToast('Trip deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting trip:', error);
      showToast('Failed to delete trip', 'error');
    } finally {
      setDeletingTripId(null);
    }
  };

  const handleArchiveTrip = async (tripId) => {
    try {
      console.log('🗄️ Archiving trip:', tripId);
      const response = await tripService.archiveTrip(tripId);
      console.log('🗄️ Archive response:', response);
      
      // Immediately update local state
      const tripToArchive = tripHistory.find(trip => (trip._id || trip.id) === tripId);
      if (tripToArchive) {
        const updatedTrip = { ...tripToArchive, status: 'archived' };
        console.log('🗄️ Moving trip to archived:', updatedTrip);
        setTripHistory(prev => prev.filter(trip => (trip._id || trip.id) !== tripId));
        setArchivedTrips(prev => [updatedTrip, ...prev]);
        
        // Auto-switch to Archive tab
        setActiveTab('archive');
      }
      
      // Also refresh from backend to ensure consistency
      console.log('🗄️ Refreshing trips from backend...');
      await refetchUserTrips();
      
      showToast('Trip archived successfully', 'success');
    } catch (error) {
      console.error('Error archiving trip:', error);
      showToast('Failed to archive trip', 'error');
    }
  };

  const handleRestoreTrip = async (tripId) => {
    setRestoringTripId(tripId);
    try {
      console.log('📦 Restoring trip:', tripId);
      const response = await tripService.unarchiveTrip(tripId);
      console.log('📦 Restore response:', response);
      
      // Immediately update local state
      const tripToRestore = archivedTrips.find(trip => (trip._id || trip.id) === tripId);
      if (tripToRestore) {
        const updatedTrip = { ...tripToRestore, status: 'active' };
        console.log('📦 Moving trip to active:', updatedTrip);
        setArchivedTrips(prev => prev.filter(trip => (trip._id || trip.id) !== tripId));
        setTripHistory(prev => [updatedTrip, ...prev]);
        
        // Auto-switch to Active tab
        setActiveTab('active');
      }
      
      // Also refresh from backend to ensure consistency
      console.log('📦 Refreshing trips from backend...');
      await refetchUserTrips();
      
      showToast('Trip restored successfully', 'success');
    } catch (error) {
      console.error('Error restoring trip:', error);
      showToast('Failed to restore trip', 'error');
    } finally {
      setRestoringTripId(null);
    }
  };

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
    const isPersonalized = searchParams.get('personalized') === 'true';
    const isNewChat = searchParams.get('newchat') === 'true';
    
    return (
      <TripPlannerChat 
        formData={chatFormData}
        parkName={selectedParkName}
        onBack={handleBackToForm}
        existingTripId={tripId} // Pass trip ID
        isPersonalized={isPersonalized}
        isNewChat={isNewChat}
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
      <section className="pb-16 sm:pb-20">
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

      {/* Divider and Quick Actions - Only show if user has at least one conversation */}
      {user && tripHistory.length > 0 && (
        <>
          {/* Divider */}
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
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
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-16 sm:mb-20">
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
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-16 sm:mb-20">
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
              <div className="text-6xl mb-4">🗂️</div>
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

export default PlanAIPage;
