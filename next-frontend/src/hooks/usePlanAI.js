'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Mountain, Camera, Trees, Tent, Car, Route, Star, Landmark
} from '@components/icons';
import { useAllParks } from '@hooks/useParks';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useTrips } from '@hooks/useTrips';
import tripService from '@/services/tripService';
import api from '@/services/api';

const totalSteps = 4;

const interests = [
  { id: 'hiking', label: 'Hiking', icon: Mountain },
  { id: 'photography', label: 'Photography', icon: Camera },
  { id: 'wildlife', label: 'Wildlife', icon: Trees },
  { id: 'camping', label: 'Camping', icon: Tent },
  { id: 'scenic-drives', label: 'Scenic Drives', icon: Car },
  { id: 'water-activities', label: 'Water Activities', icon: Route },
  { id: 'stargazing', label: 'Stargazing', icon: Star },
  { id: 'history', label: 'History & Culture', icon: Landmark }
];

export default function usePlanAI(tripId) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuth();

  // Determine if this is a public access (not authenticated)
  const isPublicAccess = !isAuthenticated;
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
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState(null);
  const [suggestText, setSuggestText] = useState('');

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

  const isPersonalized = searchParams.get('personalized') === 'true';
  const isNewChat = searchParams.get('newchat') === 'true';
  const fromChatHistory = searchParams.get('chat') === 'true';

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
        router.push('/profile');
      }
    } catch (error) {
      console.error('Error loading trip:', error);
      showToast('Failed to load trip data', 'error');
      router.push('/profile');
    } finally {
      setLoadingTrip(false);
    }
  }, [showToast, router]);

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

    // Handle suggest param (road trip from compare page)
    const suggest = searchParams.get('suggest');
    if (suggest) {
      setSuggestText(suggest);
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
      setSelectedParkName('');
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
  }, [searchParams, allParks, tripId, showToast, router, loadTripFromBackend]);

  // Check if anonymous user has reached message limit (early check)
  useEffect(() => {
    if (!isPublicAccess || tripId || searchParams.get('park') || searchParams.get('chat') || searchParams.get('personalized') || searchParams.get('newchat') || searchParams.get('suggest')) {
      return;
    }

    const checkAnonymousLimit = async () => {
      try {
        const savedSession = localStorage.getItem('anonymousSession');
        if (savedSession) {
          const sessionData = JSON.parse(savedSession);
          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = 48 * 60 * 60 * 1000; // 48 hours

          if (sessionAge < maxAge && sessionData.messageCount >= 3 && !sessionData.canSendMore) {
            // Validate with backend
            if (sessionData.anonymousId) {
              try {
                const response = await api.get(`/ai/session-status/${sessionData.anonymousId}`, {}, { skipCache: true });
                const { canSendMore, messageCount } = response.data;

                sessionData.canSendMore = canSendMore;
                sessionData.messageCount = messageCount;
                localStorage.setItem('anonymousSession', JSON.stringify(sessionData));

                if (!canSendMore && messageCount >= 3) {
                  setShowLimitDialog(true);
                  // Calculate time until reset
                  const timeRemaining = maxAge - sessionAge;
                  if (timeRemaining > 0) {
                    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
                    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                    setTimeUntilReset(`${hours}h ${minutes}m`);
                  }
                }
              } catch (error) {
                console.error('Error validating session:', error);
                // Fallback to localStorage check
                setShowLimitDialog(true);
                const timeRemaining = maxAge - sessionAge;
                if (timeRemaining > 0) {
                  const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
                  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                  setTimeUntilReset(`${hours}h ${minutes}m`);
                }
              }
            } else {
              setShowLimitDialog(true);
              const timeRemaining = maxAge - sessionAge;
              if (timeRemaining > 0) {
                const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
                const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                setTimeUntilReset(`${hours}h ${minutes}m`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking anonymous limit:', error);
      }
    };

    checkAnonymousLimit();

    // Update timer every minute
    const timerInterval = setInterval(() => {
      const savedSession = localStorage.getItem('anonymousSession');
      if (savedSession && showLimitDialog) {
        const sessionData = JSON.parse(savedSession);
        const sessionAge = Date.now() - sessionData.timestamp;
        const maxAge = 48 * 60 * 60 * 1000;
        const timeRemaining = maxAge - sessionAge;

        if (timeRemaining > 0) {
          const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          setTimeUntilReset(`${hours}h ${minutes}m`);
        } else {
          // Time expired, hide dialog
          setShowLimitDialog(false);
          setTimeUntilReset(null);
        }
      }
    }, 60 * 1000);

    return () => clearInterval(timerInterval);
  }, [isPublicAccess, tripId, searchParams, showLimitDialog]);

  // Load trip history and check if user is returning
  useEffect(() => {
    // Skip this check if we're loading a specific trip or have URL parameters
    if (tripId || searchParams.get('park') || searchParams.get('chat') || searchParams.get('personalized') || searchParams.get('newchat') || searchParams.get('suggest')) {
      setIsRestoringState(false);
      return;
    }

    const savedState = localStorage.getItem('planai-chat-state');

    // Load trip history and check if user is returning
    if (user) {
      // If userTrips is available, process it
      if (userTrips) {
        const activeTrips = userTrips.filter(t => t.status === 'active');
        const archivedTripsList = userTrips.filter(t => t.status === 'archived');

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
        // Cleared saved chat state - user will start on main page
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
            // Restored chat state from localStorage
          }
        } catch (error) {
          console.error('Error loading saved chat state:', error);
          localStorage.removeItem('planai-chat-state');
        }
      }
      setIsRestoringState(false);
    }
  }, [user, userTrips, tripId, searchParams, router]);

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

  const toggleInterest = (interestId) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interestId)
        ? prev.interests.filter(id => id !== interestId)
        : [...prev.interests, interestId]
    }));
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

  const handleGenerate = async () => {
    // Check if anonymous user has already used 3 messages
    if (isPublicAccess) {
      try {
        const savedSession = localStorage.getItem('anonymousSession');
        if (savedSession) {
          const sessionData = JSON.parse(savedSession);

          // Check if session is not too old (48 hours to match backend)
          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = 48 * 60 * 60 * 1000; // 48 hours to match backend

          // First check localStorage (fast check)
          if (sessionAge < maxAge && sessionData.messageCount >= 3 && !sessionData.canSendMore) {
            // Validate with backend to ensure accuracy
            if (sessionData.anonymousId) {
              try {
                const response = await api.get(`/ai/session-status/${sessionData.anonymousId}`, {}, { skipCache: true });
                const { canSendMore, messageCount } = response.data;

                // Update localStorage with backend data
                sessionData.canSendMore = canSendMore;
                sessionData.messageCount = messageCount;
                localStorage.setItem('anonymousSession', JSON.stringify(sessionData));

                // If backend confirms limit reached, show error
                if (!canSendMore && messageCount >= 3) {
                  showToast('You have already used your 3 free questions! Please create an account to continue planning.', 'error');
                  return;
                }
              } catch (backendError) {
                console.error('Error validating session with backend:', backendError);
                // If backend check fails, use localStorage check as fallback
                showToast('You have already used your 3 free questions! Please create an account to continue planning.', 'error');
                return;
              }
            } else {
              // No anonymousId but localStorage says limit reached - show error
              showToast('You have already used your 3 free questions! Please create an account to continue planning.', 'error');
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error checking anonymous session:', error);
        // Continue with normal flow if there's an error
      }
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

  const handleBackToForm = () => {
    // Always return to main Plan AI page (unified page)
    localStorage.removeItem('planai-chat-state');
    setShowChat(false);
    setChatFormData(null);
    setStep(1);

    // Navigate to base /plan-ai URL (removes tripId and query params)
    router.replace('/plan-ai');
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
    router.push('/plan-ai?newchat=true');
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
    router.push('/plan-ai?personalized=true');
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
      await tripService.archiveTrip(tripId);

      // Immediately update local state
      const tripToArchive = tripHistory.find(trip => (trip._id || trip.id) === tripId);
      if (tripToArchive) {
        const updatedTrip = { ...tripToArchive, status: 'archived' };
        setTripHistory(prev => prev.filter(trip => (trip._id || trip.id) !== tripId));
        setArchivedTrips(prev => [updatedTrip, ...prev]);

        // Auto-switch to Archive tab
        setActiveTab('archive');
      }

      // Also refresh from backend to ensure consistency
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
      await tripService.unarchiveTrip(tripId);

      // Immediately update local state
      const tripToRestore = archivedTrips.find(trip => (trip._id || trip.id) === tripId);
      if (tripToRestore) {
        const updatedTrip = { ...tripToRestore, status: 'active' };
        setArchivedTrips(prev => prev.filter(trip => (trip._id || trip.id) !== tripId));
        setTripHistory(prev => [updatedTrip, ...prev]);

        // Auto-switch to Active tab
        setActiveTab('active');
      }

      // Also refresh from backend to ensure consistency
      await refetchUserTrips();

      showToast('Trip restored successfully', 'success');
    } catch (error) {
      console.error('Error restoring trip:', error);
      showToast('Failed to restore trip', 'error');
    } finally {
      setRestoringTripId(null);
    }
  };

  return {
    // State
    showChat, chatFormData, selectedParkName, step, isRestoringState, loadingTrip,
    isReturningUser, tripHistory, archivedTrips, uniqueParksCount,
    deletingTripId, restoringTripId, activeTab, showLimitDialog, timeUntilReset,
    formData, isPersonalized, isNewChat, isPublicAccess, suggestText, fromChatHistory,
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
  };
}
