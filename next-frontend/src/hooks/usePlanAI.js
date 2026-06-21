'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { resolvePlanAiEntryMode, PLAN_AI_ENTRY, isFromComparePage } from '@/lib/planAiHeaderMeta';
import {
  buildIntentPlanAiContext,
  resolveIntentPathFromSearchParams,
} from '@/lib/intentPlanAi';
import { fetchIntentLandingParksClient } from '@/lib/intentLandingApi';
import { getIntentLandingByPath } from '@/data/intentLandings';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Mountain, Camera, Trees, Tent, Car, Route, Star, Landmark
} from '@components/icons';
import { useAllParksLite } from '@hooks/useParks';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useTrips } from '@hooks/useTrips';
import tripService from '@/services/tripService';
import {
  clearAnonymousBrowseContext,
  clearFormState,
  clearTempChatState,
  getFormState,
  getGuestAnonymousSessionId,
  guestHasResumableAnonymousChat,
  hasActivePlanAiConversation,
  saveFormState
} from '@/services/tripHistoryService';
import api from '@/services/api';
import {
  ANONYMOUS_SESSION_MAX_AGE_MS,
  isAnonymousLimitReached
} from '@/lib/anonymousChatLimits';

const totalSteps = 4;

const emptyChatFormData = () => ({
  parkCode: '',
  coordinates: null,
  startDate: '',
  endDate: '',
  groupSize: 1,
  budget: '',
  interests: [],
  fitnessLevel: '',
  accommodation: ''
});

/** SSR-safe: only use searchParams here — never window/localStorage (hydration mismatch). */
function getInitialRestoringState(tripId, searchParams) {
  if (!tripId && searchParams.get('park') && searchParams.get('name')) {
    return true;
  }
  return false;
}

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
  const { data: allParksData, isLoading: parksLoading, error: parksError } = useAllParksLite(false);
  const allParks = allParksData?.data;
  const { trips: userTrips, loading: tripsLoading, refreshTrips: refetchUserTrips } = useTrips();
  const [showChat, setShowChat] = useState(false);
  const [chatFormData, setChatFormData] = useState(null);
  const [selectedParkName, setSelectedParkName] = useState('');
  const [step, setStep] = useState(1);
  const [isRestoringState, setIsRestoringState] = useState(() =>
    getInitialRestoringState(tripId, searchParams)
  );
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [tripHistory, setTripHistory] = useState([]);
  const [archivedTrips, setArchivedTrips] = useState([]);
  const [uniqueParksCount, setUniqueParksCount] = useState(0);
  const [deletingTripId, setDeletingTripId] = useState(null);
  const [restoringTripId, setRestoringTripId] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [suggestText, setSuggestText] = useState('');
  const [intentContext, setIntentContext] = useState(null);

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

  const isPersonalized = searchParams.has('personalized');
  const isNewChat = searchParams.has('newchat');
  const fromChatHistory = searchParams.get('chat') === 'true';
  const askText = searchParams.get('ask')?.trim() || '';

  const fromCompare = isFromComparePage(searchParams);

  const entryMode = useMemo(
    () =>
      resolvePlanAiEntryMode({
        searchParams,
        tripId,
        fromChatHistory,
      }),
    [searchParams, tripId, fromChatHistory]
  );

  const guestResumingChat = !isAuthenticated && guestHasResumableAnonymousChat();
  const effectiveEntryMode = useMemo(() => {
    if (isNewChat) return PLAN_AI_ENTRY.GENERAL;
    if (entryMode !== PLAN_AI_ENTRY.GENERAL) return entryMode;
    if (guestResumingChat) {
      const saved = getFormState();
      if (saved?.entryMode === PLAN_AI_ENTRY.COMPARE) return PLAN_AI_ENTRY.PARK;
      if (saved?.entryMode) return saved.entryMode;
    }
    return PLAN_AI_ENTRY.GENERAL;
  }, [entryMode, isNewChat, guestResumingChat]);

  const guestChatSessionKey = guestResumingChat ? getGuestAnonymousSessionId() : '';

  const resumeGuestChatContext = useCallback(() => {
    setSuggestText('');
    const savedFormState = getFormState();
    if (savedFormState?.chatFormData) {
      setChatFormData(savedFormState.chatFormData);
      setSelectedParkName(savedFormState.selectedParkName || '');
      if (savedFormState.suggestText) setSuggestText(savedFormState.suggestText);
      if (savedFormState.intentContext) setIntentContext(savedFormState.intentContext);
    } else {
      try {
        const raw = localStorage.getItem('anonymousSession');
        const session = raw ? JSON.parse(raw) : null;
        if (session?.formData) setChatFormData(session.formData);
        if (session?.parkName) setSelectedParkName(session.parkName);
        else setChatFormData(emptyChatFormData());
      } catch {
        setChatFormData(emptyChatFormData());
      }
    }
    setShowChat(true);
    setStep(4);
    setIsRestoringState(false);
  }, []);

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
    const isPersonalized = searchParams.has('personalized');
    const isNewChat = searchParams.has('newchat');

    // Handle personalized recommendations
    if (isPersonalized) {
      setChatFormData(emptyChatFormData());
      setIntentContext(null);
      setShowChat(true);
      setStep(4);
      return;
    }

    // Handle new chat
    if (isNewChat) {
      setChatFormData(emptyChatFormData());
      setIntentContext(null);
      setShowChat(true);
      setStep(4);
      return;
    }

    // Deep link from Trailie demo — open chat and auto-send the sample question
    const ask = searchParams.get('ask')?.trim();
    if (ask) {
      clearTempChatState();
      setChatFormData(emptyChatFormData());
      setSelectedParkName('');
      setSuggestText('');
      setIntentContext(null);
      setShowChat(true);
      setStep(4);
      setIsRestoringState(false);
      return;
    }

    // Handle suggest param (road trip from compare page)
    const suggest = searchParams.get('suggest');
    if (suggest) {
      setSuggestText(suggest);
      setIntentContext(null);
      setChatFormData(emptyChatFormData());
      setSelectedParkName('');
      setShowChat(true);
      setStep(4);
      return;
    }

    // Vibe guide → contextual Trailie (e.g. /parks-for-couples)
    const intentPath = resolveIntentPathFromSearchParams(searchParams);
    if (intentPath) {
      const landing = getIntentLandingByPath(intentPath);
      if (landing) {
        clearTempChatState();
        setSuggestText('');
        setSelectedParkName('');
        setIntentContext(buildIntentPlanAiContext(landing));
        setChatFormData(emptyChatFormData());
        setShowChat(true);
        setStep(4);
        setIsRestoringState(false);
        return;
      }
    }

    if (parkCode && parkName) {
      const selectedPark = allParks?.find(p => p.parkCode === parkCode);
      const coordinates = selectedPark
        ? {
            lat: parseFloat(selectedPark.latitude),
            lon: parseFloat(selectedPark.longitude)
          }
        : null;

      clearTempChatState();
      setSuggestText('');
      setIntentContext(null);
      setSelectedParkName(parkName);

      setFormData(prev => ({
        ...prev,
        parkCode,
        coordinates
      }));

      const defaultFormData = {
        parkCode,
        coordinates,
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
      setIsRestoringState(false);
    } else if (showChatDirectly && tripId) {
      // If chat=true parameter is present and we have a tripId, load trip data from backend and show chat directly
      loadTripFromBackend(tripId);
    } else if (!tripId) {
      // Generic /plan-ai — do not resurrect park-only browse from earlier "Plan with Trailie" clicks
      setSuggestText('');
      setIntentContext(null);
      if (hasActivePlanAiConversation()) {
        const savedFormState = getFormState();
        if (savedFormState?.chatFormData) {
          setChatFormData(savedFormState.chatFormData);
          setSelectedParkName(savedFormState.selectedParkName || '');
          if (savedFormState.suggestText) setSuggestText(savedFormState.suggestText);
          if (savedFormState.intentContext) setIntentContext(savedFormState.intentContext);
        }
      } else if (!isAuthenticated && guestHasResumableAnonymousChat()) {
        resumeGuestChatContext();
        return;
      } else {
        setChatFormData(emptyChatFormData());
        setSelectedParkName('');
        clearFormState();
        clearAnonymousBrowseContext();
      }
      setShowChat(true);
      setStep(4);
      setIsRestoringState(false);
    }
  }, [searchParams, allParks, tripId, showToast, router, loadTripFromBackend, isAuthenticated, resumeGuestChatContext]);

  // Guest resume: restore park context only when the anonymous session has real messages
  useEffect(() => {
    if (isAuthenticated || searchParams.get('park')) return;
    if (!hasActivePlanAiConversation()) return;

    try {
      const raw = localStorage.getItem('anonymousSession');
      if (!raw) return;
      const session = JSON.parse(raw);
      if ((session.messageCount || 0) <= 0) return;
      if (session.parkName) {
        setSelectedParkName(session.parkName);
      }
      if (session.formData && typeof session.formData === 'object') {
        setChatFormData(session.formData);
      }
    } catch {
      // ignore invalid session JSON
    }
  }, [isAuthenticated, searchParams]);

  // Load trip history and check if user is returning
  useEffect(() => {
    // Compute uniqueParksCount — union of all parks the user has engaged with
    if (user && userTrips) {
      const uniqueParks = new Set(
        userTrips.filter(t => t.status !== 'deleted').map(t => t.parkCode).filter(Boolean)
      );
      setUniqueParksCount(uniqueParks.size);
    }

    // Park deep link: park-context effect owns isRestoringState — don't clear early here
    if (tripId || searchParams.get('chat') || searchParams.get('personalized') || searchParams.get('newchat') || searchParams.get('suggest') || searchParams.get('ask')) {
      setIsRestoringState(false);
      return;
    }
    if (searchParams.get('park') && searchParams.get('name')) {
      return;
    }

    const savedFormState = getFormState();

    // Load trip history and check if user is returning
    if (user) {
      // If userTrips is available, process it
      if (userTrips) {
        const activeTrips = userTrips.filter(t => t.status === 'active');
        const archivedTripsList = userTrips.filter(t => t.status === 'archived');

        setTripHistory(activeTrips.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
        setArchivedTrips(archivedTripsList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));

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

      // Active conversation cache (planai-chat-state) is owned by TripPlannerChat.
      setIsRestoringState(false);
    } else {
      // Guests: restore form context only when a real chat exists (not welcome-only park browse)
      if (
        hasActivePlanAiConversation() &&
        savedFormState?.showChat &&
        savedFormState.chatFormData
      ) {
        setShowChat(savedFormState.showChat);
        setChatFormData(savedFormState.chatFormData);
        setSelectedParkName(savedFormState.selectedParkName || '');
      }
      setIsRestoringState(false);
    }
  }, [user, userTrips, tripId, searchParams, router]);

  // Persist form wizard state only for real chats — never park-only browse with no messages
  useEffect(() => {
    if (showChat && chatFormData && hasActivePlanAiConversation()) {
      saveFormState({
        showChat,
        chatFormData,
        selectedParkName,
        entryMode: effectiveEntryMode,
        suggestText: suggestText || '',
        intentContext: intentContext || null,
      });
    } else if (!hasActivePlanAiConversation()) {
      clearFormState();
    }
  }, [showChat, chatFormData, selectedParkName, effectiveEntryMode, suggestText, intentContext]);

  // Refresh live ranked grid when entering from a vibe guide (matches guide page search)
  useEffect(() => {
    if (!intentContext?.path || intentContext.rankedParks?.length) return;

    const landing = getIntentLandingByPath(intentContext.path);
    if (!landing) return;

    let cancelled = false;

    fetchIntentLandingParksClient(landing).then(({ parks }) => {
      if (cancelled || parks.length === 0) return;
      setIntentContext((prev) =>
        prev?.path === landing.path
          ? buildIntentPlanAiContext(landing, { rankedParks: parks })
          : prev
      );
    });

    return () => {
      cancelled = true;
    };
  }, [intentContext?.path, intentContext?.rankedParks?.length]);

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
    // Check if anonymous user has already used their free message quota
    if (isPublicAccess) {
      try {
        const savedSession = localStorage.getItem('anonymousSession');
        if (savedSession) {
          const sessionData = JSON.parse(savedSession);

          const sessionAge = Date.now() - sessionData.timestamp;
          const maxAge = ANONYMOUS_SESSION_MAX_AGE_MS;

          if (sessionAge < maxAge && isAnonymousLimitReached(sessionData)) {
            if (sessionData.anonymousId) {
              try {
                const response = await api.get(`/ai/session-status/${sessionData.anonymousId}`, {}, { skipCache: true });
                const { canSendMore, messageCount } = response.data;

                sessionData.canSendMore = canSendMore;
                sessionData.messageCount = messageCount;
                localStorage.setItem('anonymousSession', JSON.stringify(sessionData));

                if (isAnonymousLimitReached({ canSendMore, messageCount })) {
                  showToast('You have already used your 5 free messages! Please create an account to continue planning.', 'error');
                  return;
                }
              } catch (backendError) {
                console.error('Error validating session with backend:', backendError);
                showToast('You have already used your 5 free messages! Please create an account to continue planning.', 'error');
                return;
              }
            } else {
              showToast('You have already used your 5 free messages! Please create an account to continue planning.', 'error');
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
    clearTempChatState();
    clearFormState();
    setShowChat(false);
    setChatFormData(null);
    setStep(1);

    // Navigate to base /plan-ai URL (removes tripId and query params)
    router.replace('/plan-ai');
  };

  const handleStartNewChat = () => {
    // Start generic AI chat without park context
    setChatFormData({
      ...emptyChatFormData(),
      budget: 'moderate',
      fitnessLevel: 'moderate',
      accommodation: 'camping'
    });
    setSelectedParkName('');
    setShowChat(true);
    // Clear saved session so restoration doesn't override the new chat
    clearTempChatState();
    clearAnonymousBrowseContext();
    // Use unique timestamp to force URL change even if already on ?newchat=true
    router.replace('/plan-ai?newchat=' + Date.now());
  };

  const handlePersonalizedRecommendations = () => {
    // Navigate to chat with personalized flag for personalized welcome
    setChatFormData(emptyChatFormData());
    setShowChat(true);
    router.replace('/plan-ai?personalized=' + Date.now());
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
    deletingTripId, restoringTripId, activeTab,
    formData, isPersonalized, isNewChat, isPublicAccess, suggestText, intentContext, fromChatHistory, askText, entryMode,
    effectiveEntryMode, fromCompare, guestChatSessionKey, guestResumingChat,
    newChatKey: searchParams.get('newchat') || searchParams.get('personalized') || searchParams.get('ask') || '',
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
