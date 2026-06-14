import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin, Calendar, Users, AlertCircle, X, Clock, Sparkles, CheckCircle, Edit2, Compare,
  Share2,
  Download,
} from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { tripHistoryService } from '../../services/tripHistoryService';
import tripService from '../../services/tripService';
import conversationService from '../../services/conversationService';
import aiService from '../../services/aiService';
import api from '../../services/api';
import feedbackService from '../../services/feedbackService';
import { logAIFeedback, logAIChat, logPlanAiSessionStart, logTripShareCreated } from '../../utils/analytics';
import { truncatePlainText } from '@/utils/stripMarkdown';
import ChatInput from '../ai-chat/ChatInput';
import MessageBubble from '../ai-chat/MessageBubble';
import TypingIndicator from '../ai-chat/TypingIndicator';
import SuggestedPrompts from '../ai-chat/SuggestedPrompts';
import Button from '../common/Button';
import SaveTripModal from './SaveTripModal';
import GuestLimitMessageExtras from './GuestLimitMessageExtras';
import { buildGuestLimitIntro } from '@/lib/guestLimitMessage';
import { getBestAvatar, generateRandomAvatar } from '../../utils/avatarGenerator';
import { ANONYMOUS_MESSAGE_LIMIT } from '@/lib/anonymousChatLimits';
import {
  SIGNUP_PROMPT_REASONS,
  getSignupPrompt,
  getSignupPromptReason,
  getSavePromptReasonFromMessages,
} from '@/lib/planAiSignupPrompts';
import {
  getGenericWelcomeMessage,
  getParkWelcomeMessage,
  getPersonalizedWelcomeMessage,
  getRoadTripWelcomeMessage,
  MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE,
} from '@/lib/planAiWelcomeCopy';
import { stripItineraryJsonForDisplay } from '@/utils/streamDisplayContent';

const ANONYMOUS_SESSION_KEY = 'anonymousSession';
const ANONYMOUS_GUEST_AVATAR_KEY = 'anonymousGuestAvatar';
const ANONYMOUS_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function readStoredAnonymousSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ANONYMOUS_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialAnonymousRestoreStatus(isAuthenticated) {
  if (isAuthenticated) return 'n/a';
  const session = readStoredAnonymousSession();
  if (!session?.anonymousId && !(session?.messageCount > 0)) return 'empty';
  return 'pending';
}

function getInitialAuthRestoreStatus(isAuthenticated) {
  if (!isAuthenticated) return 'n/a';
  const temp = tripHistoryService.getTempChatState();
  if (!temp?.messages?.length && !temp?.currentTripId) return 'empty';
  return 'pending';
}

function readStoredGuestAvatarUrl() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ANONYMOUS_GUEST_AVATAR_KEY);
  } catch {
    return null;
  }
}

/** Stable anonymous avatar URL — persisted because generateRandomAvatar is not deterministic. */
function resolveAnonymousAvatarUrl(anonymousId, existingSession = null) {
  const session = existingSession || readStoredAnonymousSession();
  if (session?.avatarUrl && (!anonymousId || session.anonymousId === anonymousId)) {
    return session.avatarUrl;
  }
  const guestAvatar = readStoredGuestAvatarUrl();
  if (guestAvatar) return guestAvatar;
  const seed = anonymousId || `guest-${crypto.randomUUID()}`;
  return generateRandomAvatar(seed);
}

const TripPlannerChat = ({
  formData,
  onBack,
  parkName,
  existingTripId = null,
  isPersonalized = false,
  isNewChat = false,
  suggestText = '',
  refreshTrips = null,
  onOpenQuickFill = null,
  fromChatHistory = false,
  quickFillMessage = null,
  onQuickFillSent = null,
  initialAskMessage = null,
  onInitialAskSent = null,
  playCompletionSound = null,
  primeCompletionSound = null,
}) => {
  const router = useRouter();
  const { user, isAuthenticated, updateUser } = useAuth();
  const { showToast } = useToast();
  const { subscribe, unsubscribe, subscribeToProfile, subscribeToTrips } = useWebSocket();
  
  // Debug user object to see avatar structure (remove in production)
  // console.log('🔍 TripPlannerChat - User object:', user);
  // console.log('🔍 TripPlannerChat - User avatar:', user?.avatar);
  // console.log('🔍 TripPlannerChat - User profilePicture:', user?.profilePicture);
  // console.log('🔍 TripPlannerChat - User firstName:', user?.firstName);
  // console.log('🔍 TripPlannerChat - User lastName:', user?.lastName);
  // console.log('🔍 TripPlannerChat - User email:', user?.email);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [hasUsedQuickFill, setHasUsedQuickFill] = useState(false);
  const [currentTripId, setCurrentTripId] = useState(existingTripId);
  const [providers, setProviders] = useState([]);
  const abortControllerRef = useRef(null);
  const streamFlushRafRef = useRef(null);
  const rawStreamedContentRef = useRef('');

  const cancelStreamFlush = useCallback(() => {
    if (streamFlushRafRef.current != null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
  }, []);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState('Thinking...');
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [thinkingSources, setThinkingSources] = useState(null);
  const [, setIsRestoredSession] = useState(false);
  const [tripHistory, setTripHistory] = useState([]);
  const [showParkInputModal, setShowParkInputModal] = useState(false);
  const [parkInput, setParkInput] = useState('');
  const [isStartingFresh, setIsStartingFresh] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [anonymousAvatar, setAnonymousAvatar] = useState(() => {
    const session = readStoredAnonymousSession();
    if (session?.avatarUrl) return session.avatarUrl;
    return readStoredGuestAvatarUrl();
  });
  const [isAnonymous, setIsAnonymous] = useState(!isAuthenticated);
  const [anonymousId, setAnonymousId] = useState(null);
  const [messageCount, setMessageCount] = useState(0);
  const [canSendMore, setCanSendMore] = useState(true);
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  /** pending | restored | empty | n/a — gates welcome message until anon history is loaded */
  const [anonymousRestoreStatus, setAnonymousRestoreStatus] = useState(
    () => getInitialAnonymousRestoreStatus(isAuthenticated)
  );
  /** pending | restored | empty | n/a — gates welcome until authed session cache/DB restore */
  const [authRestoreStatus, setAuthRestoreStatus] = useState(
    () => getInitialAuthRestoreStatus(isAuthenticated)
  );
  const [timeUntilReset, setTimeUntilReset] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [shareUrl, setShareUrl] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalReason, setSaveModalReason] = useState(SIGNUP_PROMPT_REASONS.SAVE_ITINERARY);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const messagesRef = useRef(messages);
  const currentTripIdRef = useRef(currentTripId);
  const currentPlanRef = useRef(currentPlan);
  messagesRef.current = messages;
  currentTripIdRef.current = currentTripId;
  currentPlanRef.current = currentPlan;
  const savingInProgressRef = useRef(false);
  const previousExistingTripIdRef = useRef(existingTripId);
  const lastMessageCountRef = useRef(0);
  const userSentMessageRef = useRef(false);
  const personalizedSentRef = useRef(false);
  const personalizedInitRef = useRef(false);
  const initialAskSentRef = useRef(false);
  const sessionStartTrackedRef = useRef(false);
  const parkContextRef = useRef(null);

  const chatStatus = isAnonymous
    ? null
    : saveState === 'saving'
      ? {
          label: 'Saving...',
          description: 'Updating your trip history.',
          tone: 'saving'
        }
      : currentTripId || saveState === 'saved'
        ? {
            label: 'Saved',
            description: 'This conversation is stored in your account.',
            tone: 'saved'
          }
        : null;
  const anonymousMessagesRemaining = Math.max(0, ANONYMOUS_MESSAGE_LIMIT - messageCount);
  const anonymousQuotaLabel =
    isAnonymous && canSendMore && anonymousMessagesRemaining > 0 && anonymousMessagesRemaining < ANONYMOUS_MESSAGE_LIMIT
      ? `${anonymousMessagesRemaining} free ${anonymousMessagesRemaining === 1 ? 'message' : 'messages'} left`
      : null;

  const isWelcomeState =
    messages.length === 1 &&
    !isGenerating &&
    !messages.some((message) => message.role === 'user' && !message.hiddenFromUi) &&
    !messages.some((message) => message.isConversionMessage);

  // Auto-scroll only when USER sends a message (not when AI responds)
  // This lets the user read AI responses from the top without being yanked to the bottom
  useEffect(() => {
    if (userSentMessageRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      userSentMessageRef.current = false;
    }
    // When AI starts generating, scroll to show the typing indicator
    if (isGenerating && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isGenerating]);

  useEffect(() => {
    if (sessionStartTrackedRef.current) return;
    sessionStartTrackedRef.current = true;
    logPlanAiSessionStart({
      userType: isAuthenticated ? 'authenticated' : 'anonymous',
      parkCode: formData?.parkCode || null,
    });
  }, [isAuthenticated, formData?.parkCode]);

  // Helper functions that need to be defined before loadExistingTrip
  const calculateDays = () => {
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const ms = end.setHours(0,0,0,0) - start.setHours(0,0,0,0);
    return Math.max(1, Math.floor(ms / 86400000) + 1);
  };

  const getUserContextMessage = async () => {
    if (!user) return '';
    
    try {
      const context = await tripHistoryService.getAIContext(user.id);
      
      if (context.totalTrips === 0) {
        return 'This is your first trip with Trailie. I can help you shape it from scratch.';
      }

      let contextMsg = `**Based on your ${context.totalTrips} previous ${context.totalTrips === 1 ? 'trip' : 'trips'}:**\n`;
      
      if (context.favoriteParks && context.favoriteParks.length > 0) {
        contextMsg += `- You've enjoyed: ${context.favoriteParks.join(', ')}\n`;
      }
      
      if (context.topInterests && context.topInterests.length > 0) {
        contextMsg += `- Your interests: ${context.topInterests.slice(0, 3).join(', ')}\n`;
      }

      return contextMsg;
    } catch (error) {
      console.error('Error getting user context:', error);
      return '';
    }
  };

  const stripWelcomeBackMessages = (messageList = []) =>
    messageList.filter(
      (msg) => !(msg.role === 'assistant' && /welcome back/i.test(String(msg.content || '')))
    );

  const showWelcomeMessage = useCallback(async () => {
    let content;
    if (isPersonalized) {
      content = getPersonalizedWelcomeMessage(user);
    } else if (suggestText) {
      content = getRoadTripWelcomeMessage(user, suggestText);
    } else if (isNewChat || !parkName) {
      content = getGenericWelcomeMessage(user);
    } else {
      content = getParkWelcomeMessage(user, parkName);
    }

    setMessages([
      {
        id: Date.now(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      },
    ]);
  }, [user, parkName, isPersonalized, isNewChat, suggestText]);

  // Define loadExistingTrip before the useEffect that uses it
  const loadExistingTrip = useCallback(async (tripId) => {
    console.log('🔄 Loading existing trip:', tripId);
    try {
      const tripResponse = await tripService.getTrip(tripId);
      console.log('🔄 Raw API response:', tripResponse);
      const trip = tripResponse.data || tripResponse;
      console.log('🔄 Found trip:', trip);
      console.log('🔄 Trip has conversation array:', Array.isArray(trip.conversation));
      console.log('🔄 Trip conversation:', trip.conversation);
    
      if (trip) {
        setSaveState('saved');
        // Check if trip has conversationId (localStorage trip) or direct messages (backend trip)
        if (trip.conversationId) {
          try {
            console.log('🔄 Loading conversation from backend:', trip.conversationId);
            // Fetch conversation from backend using conversationId
            const conversation = await conversationService.getConversation(trip.conversationId);
            console.log('🔄 Loaded conversation:', conversation);
            const messagesToLoad = stripWelcomeBackMessages(conversation.conversation || []);
            setMessages(messagesToLoad);
          } catch (error) {
            console.error('Error loading conversation:', error);
            // Fallback to empty messages if conversation fetch fails
            setMessages([]);
          }
        } else {
          // Backend trip with direct messages (check both conversation and messages)
          console.log('🔄 Loading messages from trip:', trip.conversation || trip.messages);
          console.log('🔄 Trip conversation length:', (trip.conversation || []).length);
          console.log('🔄 Trip messages length:', (trip.messages || []).length);
          const messagesToLoad = stripWelcomeBackMessages(trip.conversation || trip.messages || []);
          console.log('🔄 Setting messages:', messagesToLoad.length, 'messages');
          console.log('🔄 Messages with feedback:', messagesToLoad.filter(m => m.userFeedback).map(m => ({ id: m.id, feedback: m.userFeedback })));
          setMessages(messagesToLoad);
        }
        
        setCurrentPlan(trip.plan);
        setCurrentTripId(tripId); // Set the current trip ID for this conversation
        console.log('🔄 Set currentTripId to:', tripId);
        console.log('✅ Trip loaded successfully');
        // Trip loading runs silently in background - no toast notification
      }
    } catch (error) {
      console.error('❌ Error loading trip:', error);
      // Don't call showWelcomeMessage here to avoid potential loops
      // The initialization useEffect will handle showing welcome message
    }
  }, []); // Removed showToast from dependencies to prevent infinite loop

  // Check if this is a restored session
  useEffect(() => {
    // Don't restore if we're starting a fresh conversation
    if (isStartingFresh) return;
    
    // Don't restore if we already have an existingTripId from URL (prevents overriding)
    if (existingTripId) {
      console.log('🔄 Skipping session restoration - loading trip from URL:', existingTripId);
      return;
    }
    
    const tempState = tripHistoryService.getTempChatState();

    if (tempState?.currentTripId || tempState?.messages?.length >= 2) {
      setIsRestoredSession(true);
      console.log('🔄 Restored session detected');
    }

    // Load trip history for the user
    if (user) {
      tripService.getUserTrips(user.id).then(response => {
        const trips = response.data || response || [];
        setTripHistory(trips);
      }).catch(error => {
        console.error('Error loading trip history:', error);
        setTripHistory([]);
      });
    }
  }, [user, existingTripId, loadExistingTrip, isStartingFresh]); // Added isStartingFresh dependency

  // Force re-render when user avatar changes
  useEffect(() => {
    // Increment avatar version to force re-render of message bubbles
    setAvatarVersion(prev => prev + 1);
  }, [user?.avatar, user?.profilePicture, user?.profile?.avatar]);

  // Setup WebSocket real-time sync for profile updates and trip updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to profile updates and trip updates
    subscribeToProfile();
    subscribeToTrips();

    // Handle profile updates from other devices/tabs
    const handleProfileUpdated = (data) => {
      console.log('[Real-Time] Profile updated in TripPlannerChat:', data);
      if (data.userId === user._id || data.userId === user.id) {
        // Update user object with new profile data
        if (data.avatar) {
          console.log('🔄 Updating user avatar from real-time update:', data.avatar);
          // Update the user object in AuthContext with the new avatar
          updateUser({ avatar: data.avatar });
        }
        // Force re-render of message bubbles with new avatar
        setAvatarVersion(prev => prev + 1);
        console.log('🔄 Avatar version updated due to real-time profile update');
      }
    };

    // Handle trip updates from other devices/tabs
    const handleTripUpdated = (data) => {
      console.log('[Real-Time] Trip updated in TripPlannerChat:', data);
      if (data.userId === user._id || data.userId === user.id) {
        // If this is the current trip being viewed, refresh the trips list
        if (data.tripId === currentTripId && refreshTrips) {
          console.log('🔄 Refreshing trips list due to real-time trip update');
          refreshTrips();
        }
      }
    };

    // Subscribe to WebSocket events
    subscribe('profileUpdated', handleProfileUpdated);
    subscribe('tripUpdated', handleTripUpdated);

    // Cleanup
    return () => {
      unsubscribe('profileUpdated', handleProfileUpdated);
      unsubscribe('tripUpdated', handleTripUpdated);
    };
  }, [user, subscribe, unsubscribe, subscribeToProfile, subscribeToTrips, currentTripId, refreshTrips]);

  // Update thinking message based on time elapsed and data sources
  useEffect(() => {
    let interval;
    if (isGenerating && thinkingStartTime) {
      interval = setInterval(() => {
        const elapsed = Date.now() - thinkingStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const hasWeb = thinkingSources?.includes('web');
        const hasNps = thinkingSources?.includes('nps');
        const hasWeather = thinkingSources?.includes('weather');
        const hasAnySources = thinkingSources && thinkingSources.length > 0;

        // If we have data source info from the backend, show source-aware messages
        if (hasAnySources && seconds >= 5) {
          if (seconds < 10) {
            if (hasWeb) setThinkingMessage('Analyzing web search results...');
            else if (hasNps) setThinkingMessage('Processing live park data...');
            else setThinkingMessage('Analyzing your request...');
          } else if (seconds < 15) {
            if (hasWeb && hasNps) setThinkingMessage('Combining web results with NPS data...');
            else setThinkingMessage('Researching the best options...');
          } else if (seconds < 20) {
            setThinkingMessage('Creating your personalized plan...');
          } else if (seconds < 30) {
            setThinkingMessage('Adding detailed recommendations...');
          } else if (seconds < 40) {
            setThinkingMessage('Finalizing your travel itinerary...');
          } else {
            setThinkingMessage('Almost done! Generating comprehensive response...');
          }
        } else if (!hasAnySources) {
          // Fallback: no source info yet (before thinking event arrives)
          if (seconds < 5) {
            setThinkingMessage('Thinking...');
          } else if (seconds < 10) {
            setThinkingMessage('Analyzing your request...');
          } else if (seconds < 15) {
            setThinkingMessage('Researching the best options...');
          } else if (seconds < 20) {
            setThinkingMessage('Creating your personalized plan...');
          } else if (seconds < 30) {
            setThinkingMessage('Adding detailed recommendations...');
          } else if (seconds < 40) {
            setThinkingMessage('Finalizing your travel itinerary...');
          } else {
            setThinkingMessage('Almost done! Generating comprehensive response...');
          }
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, thinkingStartTime, thinkingSources]);

  const loadProviders = useCallback(async () => {
    try {
      // Use different endpoint based on authentication status
      const endpoint = isAnonymous ? '/ai/providers-anonymous' : '/ai/providers';
      const response = await api.get(endpoint);
      const data = response.data;

      if (data.providers && data.providers.length > 0) {
        setProviders(data.providers);
      } else {
        showToast('No AI providers configured. Please add API keys.', 'error');
      }
      setProvidersLoaded(true);
    } catch (error) {
      console.error('Error loading providers:', error);
      showToast('Failed to load AI providers', 'error');
      setProvidersLoaded(true);
    }
  }, [isAnonymous]);

  const getCurrentSeason = (month) => {
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Fall';
    return 'Winter';
  };

  const getMonthName = (month) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  };

  // Clear anonymous session when user logs in
  const clearAnonymousSession = useCallback(() => {
    localStorage.removeItem(ANONYMOUS_SESSION_KEY);
    localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
    setAnonymousId(null);
    setAnonymousAvatar(null);
    setMessageCount(0);
    setCanSendMore(true);
    setIsSessionRestored(false);
  }, []);

  // Calculate time until reset
  const calculateTimeUntilReset = useCallback(() => {
    try {
      const sessionData = readStoredAnonymousSession();
      if (sessionData?.timestamp) {
        const sessionAge = Date.now() - sessionData.timestamp;
        const timeRemaining = ANONYMOUS_SESSION_MAX_AGE_MS - sessionAge;

        if (timeRemaining > 0) {
          const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          return `${hours}h ${minutes}m`;
        }
      }
    } catch (error) {
      console.error('Error calculating time until reset:', error);
    }
    return null;
  }, []);

  // Clean up expired sessions
  const cleanupExpiredSessions = useCallback(() => {
    try {
      const sessionData = readStoredAnonymousSession();
      if (!sessionData) return;

      const sessionAge = Date.now() - (sessionData.timestamp || 0);
      if (sessionAge >= ANONYMOUS_SESSION_MAX_AGE_MS) {
        localStorage.removeItem(ANONYMOUS_SESSION_KEY);
        localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
        console.log('🔄 Cleaned up expired anonymous session');
      }
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      localStorage.removeItem(ANONYMOUS_SESSION_KEY);
      localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
    }
  }, []);

  // Save anonymous session data to localStorage
  const saveAnonymousSession = useCallback((sessionData) => {
    if (isAnonymous && sessionData.anonymousId) {
      const existing = readStoredAnonymousSession();
      const sameSession = existing?.anonymousId === sessionData.anonymousId;
      const avatarUrl = resolveAnonymousAvatarUrl(sessionData.anonymousId, existing);

      const sessionToSave = {
        anonymousId: sessionData.anonymousId,
        messageCount: sessionData.messageCount || 0,
        canSendMore: sessionData.canSendMore !== undefined ? sessionData.canSendMore : true,
        avatarUrl,
        parkName,
        formData,
        timestamp: sameSession && existing?.timestamp ? existing.timestamp : Date.now(),
      };
      localStorage.setItem(ANONYMOUS_SESSION_KEY, JSON.stringify(sessionToSave));
      localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
      setAnonymousAvatar(avatarUrl);
    }
  }, [isAnonymous, parkName, formData]);

  // Validate session with backend
  const mapServerMessagesToUi = useCallback((serverMessages = []) => {
    return serverMessages.map((msg, index) => ({
      id: `restored-${index}-${msg.timestamp || Date.now()}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      provider: msg.provider || undefined,
      model: msg.model || undefined,
    }));
  }, []);

  const validateSessionWithBackend = useCallback(async (anonymousId) => {
    if (!anonymousId) return null;

    try {
      const response = await api.get(`/ai/session-status/${anonymousId}`);
      const { canSendMore, messageCount, isConverted, messages: serverMessages } = response.data;

      setCanSendMore(canSendMore);
      setMessageCount(messageCount);

      // Update localStorage with backend data
      const savedSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        sessionData.canSendMore = canSendMore;
        sessionData.messageCount = messageCount;
        localStorage.setItem(ANONYMOUS_SESSION_KEY, JSON.stringify(sessionData));
        if (sessionData.avatarUrl) {
          setAnonymousAvatar(sessionData.avatarUrl);
        }
      }

      console.log('🔄 Session validated with backend:', {
        canSendMore,
        messageCount,
        isConverted,
        restoredMessages: serverMessages?.length || 0,
      });
      return { canSendMore, messageCount, messages: serverMessages || [] };
    } catch (error) {
      console.error('Error validating session with backend:', error);
      return null;
    }
  }, []);

  // Restore anonymous session from localStorage
  const restoreAnonymousSession = useCallback(async () => {
    if (!isAnonymous || isAuthenticated) {
      setAnonymousRestoreStatus('n/a');
      return false;
    }

    try {
      const sessionData = readStoredAnonymousSession();
      if (!sessionData) {
        setAnonymousRestoreStatus('empty');
        return false;
      }

      const sessionAge = Date.now() - (sessionData.timestamp || 0);
      if (sessionAge >= ANONYMOUS_SESSION_MAX_AGE_MS) {
        localStorage.removeItem(ANONYMOUS_SESSION_KEY);
        localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
        setAnonymousAvatar(null);
        console.log('🔄 Anonymous session expired, cleared');
        setAnonymousRestoreStatus('empty');
        return false;
      }

      if (sessionData.anonymousId) {
        setAnonymousId(sessionData.anonymousId);
      }
      setMessageCount(sessionData.messageCount ?? 0);
      setCanSendMore(sessionData.canSendMore ?? true);
      setIsSessionRestored(true);

      if (sessionData.avatarUrl) {
        setAnonymousAvatar(sessionData.avatarUrl);
      } else if (sessionData.anonymousId) {
        const avatarUrl = resolveAnonymousAvatarUrl(sessionData.anonymousId, sessionData);
        sessionData.avatarUrl = avatarUrl;
        localStorage.setItem(ANONYMOUS_SESSION_KEY, JSON.stringify(sessionData));
        setAnonymousAvatar(avatarUrl);
      }

      if (sessionData.anonymousId) {
        const status = await validateSessionWithBackend(sessionData.anonymousId);
        if (status?.messages?.length > 0) {
          setMessages(mapServerMessagesToUi(status.messages));
          setAnonymousRestoreStatus('restored');
          console.log('🔄 Restored anonymous chat history:', status.messages.length, 'messages');
        } else {
          const temp = tripHistoryService.getTempChatState();
          if (temp?.messages?.length >= 2) {
            setMessages(tripHistoryService.normalizeStoredMessages(temp.messages));
            setAnonymousRestoreStatus('restored');
            console.log('🔄 Restored anonymous chat from local cache:', temp.messages.length, 'messages');
          } else {
            setAnonymousRestoreStatus('empty');
          }
        }
      } else {
        setAnonymousRestoreStatus('empty');
      }

      console.log('🔄 Restored anonymous session:', sessionData);
      return true;
    } catch (error) {
      console.error('Error restoring anonymous session:', error);
      localStorage.removeItem(ANONYMOUS_SESSION_KEY);
      localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
      setAnonymousAvatar(null);
      setAnonymousRestoreStatus('empty');
      return false;
    }
  }, [isAnonymous, isAuthenticated, validateSessionWithBackend, mapServerMessagesToUi]);

  const persistSessionToStorage = useCallback((tripId, msgs, plan) => {
    if (!msgs || msgs.length < 2) return;
    tripHistoryService.saveTempChatState({
      currentTripId: tripId || null,
      messages: msgs,
      plan: plan || null,
      provider: 'auto',
    });
  }, []);

  // Restore logged-in session from local cache or DB when returning to /plan-ai
  useEffect(() => {
    if (!isAuthenticated || existingTripId || isNewChat || isPersonalized || isStartingFresh || initialAskMessage) {
      if (isAuthenticated && (existingTripId || isNewChat || isPersonalized || initialAskMessage)) {
        setAuthRestoreStatus('n/a');
      }
      return;
    }

    let cancelled = false;
    setAuthRestoreStatus('pending');

    const restoreAuthSession = async () => {
      const temp = tripHistoryService.getTempChatState();

      if (temp?.messages?.length >= 2) {
        if (cancelled) return;
        setMessages(tripHistoryService.normalizeStoredMessages(temp.messages));
        if (temp.currentTripId) setCurrentTripId(temp.currentTripId);
        if (temp.plan) setCurrentPlan(temp.plan);
        setAuthRestoreStatus('restored');
        return;
      }

      if (temp?.currentTripId) {
        await loadExistingTrip(temp.currentTripId);
        if (!cancelled) setAuthRestoreStatus('restored');
        return;
      }

      if (!cancelled) setAuthRestoreStatus('empty');
    };

    restoreAuthSession().catch((error) => {
      console.error('Error restoring authenticated session:', error);
      if (!cancelled) setAuthRestoreStatus('empty');
    });

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    existingTripId,
    isNewChat,
    isPersonalized,
    isStartingFresh,
    initialAskMessage,
    loadExistingTrip,
  ]);

  // Keep conversation cache in sync for SPA navigation (not only after auto-save)
  useEffect(() => {
    if (isStartingFresh || isNewChat || isPersonalized) return;
    if (messages.length < 2) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      persistSessionToStorage(currentTripId, messages, currentPlan);
    }, 400);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    messages,
    currentTripId,
    currentPlan,
    isStartingFresh,
    isNewChat,
    isPersonalized,
    persistSessionToStorage,
  ]);

  // Flush cache when leaving the page via client navigation
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current || [];
      const hasUserMessages = msgs.some(
        (m) => m.role === 'user' && !m.hiddenFromUi
      );

      persistSessionToStorage(
        currentTripIdRef.current,
        msgs,
        currentPlanRef.current
      );

      // Welcome-only park browse — do not leave stale park context for the next visit
      if (!hasUserMessages && msgs.length <= 1) {
        tripHistoryService.clearFormState();
        tripHistoryService.clearAnonymousBrowseContext();
      }
    };
  }, [persistSessionToStorage]);

  // Re-show limit card in-thread when guest returns after a 6th attempt (not stored server-side)
  useEffect(() => {
    if (!isAnonymous || isAuthenticated || canSendMore) return;
    if (messages.some((m) => m.isConversionMessage)) return;
    if (messageCount <= ANONYMOUS_MESSAGE_LIMIT) return;

    setMessages((prev) => {
      if (prev.some((m) => m.isConversionMessage)) return prev;
      return [
        ...prev,
        {
          id: `guest-limit-${Date.now()}`,
          role: 'assistant',
          content: buildGuestLimitIntro({ timeUntilReset, parkName }),
          timestamp: new Date(),
          provider: 'system',
          model: 'conversion',
          isConversionMessage: true,
        },
      ];
    });
  }, [isAnonymous, isAuthenticated, canSendMore, messageCount, messages, timeUntilReset, parkName]);

  // Clean up expired sessions and restore anonymous session on mount
  useEffect(() => {
    cleanupExpiredSessions();

    if (isAnonymous && !isAuthenticated) {
      if (initialAskMessage) {
        setAnonymousRestoreStatus('empty');
        return;
      }
      // Park deep links (?park=&name=) start fresh — but guest resume links keep stored session
      const storedSession = readStoredAnonymousSession();
      if (parkName && !storedSession?.anonymousId) {
        setAnonymousRestoreStatus('empty');
        return;
      }
      restoreAnonymousSession();
    }
  }, [isAnonymous, isAuthenticated, parkName, initialAskMessage, restoreAnonymousSession, cleanupExpiredSessions]);

  // Draft guest avatar before first API response — same URL after refresh until session links it
  useEffect(() => {
    if (!isAnonymous || isAuthenticated || anonymousAvatar) return;

    let guestUrl = readStoredGuestAvatarUrl();
    if (!guestUrl) {
      guestUrl = generateRandomAvatar(`guest-${crypto.randomUUID()}`);
      localStorage.setItem(ANONYMOUS_GUEST_AVATAR_KEY, guestUrl);
    }
    setAnonymousAvatar(guestUrl);
  }, [isAnonymous, isAuthenticated, anonymousAvatar]);

  // Periodic cleanup of expired sessions (every 5 minutes)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupExpiredSessions();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [cleanupExpiredSessions]);

  // Update countdown timer every minute
  useEffect(() => {
    if (isAnonymous && !canSendMore) {
      const updateTimer = () => {
        const timeRemaining = calculateTimeUntilReset();
        setTimeUntilReset(timeRemaining);
      };
      
      updateTimer(); // Initial update
      const timerInterval = setInterval(updateTimer, 60 * 1000); // Every minute
      
      return () => clearInterval(timerInterval);
    }
  }, [isAnonymous, canSendMore, calculateTimeUntilReset]);

  // Clear anonymous session when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isAnonymous) {
      clearAnonymousSession();
      setIsAnonymous(false);
    }
  }, [isAuthenticated, isAnonymous, clearAnonymousSession]);

  // Load available providers
  useEffect(() => {
    loadProviders();
  }, [loadProviders, isAnonymous]);

  // Reset currentTripId when explicitly starting a new chat
  // (Component stays mounted when using "Start New Chat" or "Personalized Recommendations")
  useEffect(() => {
    const previousTripId = previousExistingTripIdRef.current;
    
    // Reset when explicitly starting new chat (isNewChat or isPersonalized URL flags)
    // These flags indicate user clicked "Start New Chat" or "Get Recommendations"
    if (isNewChat || isPersonalized) {
      console.log('🆕 Starting NEW chat (explicit action) - resetting currentTripId');
      setCurrentTripId(null);
      setCurrentPlan(null);
      setSaveState('idle');
      localStorage.removeItem('planai-chat-state');
    }
    // Update existingTripId if it changed (loading different trip)
    else if (existingTripId && existingTripId !== previousTripId) {
      console.log('🔄 Loading existing trip:', existingTripId);
      setCurrentTripId(existingTripId);
    }
    
    // Update ref for next comparison
    previousExistingTripIdRef.current = existingTripId;
  }, [existingTripId, isNewChat, isPersonalized]);

  // When park / trip context changes with no user messages yet, refresh the welcome (not stale copy)
  useEffect(() => {
    if (isStartingFresh || existingTripId || isNewChat || isPersonalized) return;

    const parkContextKey = [
      formData?.parkCode || '',
      parkName || '',
      suggestText || '',
    ].join('|');

    if (parkContextRef.current === null) {
      parkContextRef.current = parkContextKey;
      return;
    }
    if (parkContextRef.current === parkContextKey) return;
    parkContextRef.current = parkContextKey;

    const hasUserMessages = messages.some(
      (m) => m.role === 'user' && !m.hiddenFromUi
    );
    if (hasUserMessages) return;
    if (!providersLoaded) return;
    if (isAnonymous && !isAuthenticated && anonymousRestoreStatus === 'pending') return;
    if (isAuthenticated && authRestoreStatus === 'pending') return;

    showWelcomeMessage();
  }, [
    formData?.parkCode,
    parkName,
    suggestText,
    messages,
    isStartingFresh,
    existingTripId,
    isNewChat,
    isPersonalized,
    providersLoaded,
    isAnonymous,
    isAuthenticated,
    anonymousRestoreStatus,
    authRestoreStatus,
    showWelcomeMessage,
  ]);

  // Initialize chat after providers are loaded
  useEffect(() => {
    console.log('🔄 Chat initialization useEffect triggered:', {
      isStartingFresh,
      providersLoaded,
      existingTripId,
      isNewChat,
      isPersonalized
    });

    // Don't initialize if we're starting a fresh conversation
    if (isStartingFresh) return;

    // Skip restoration when explicitly starting a new chat or personalized session
    // BUT still load if there's an existingTripId (loading from chat history)
    if ((isNewChat || isPersonalized) && !existingTripId) {
      if (isPersonalized) {
        if (!personalizedInitRef.current) {
          personalizedInitRef.current = true;
          setMessages([]);
        }
      } else {
        personalizedInitRef.current = false;
        showWelcomeMessage();
      }
      return;
    }

    if (providersLoaded) {
      if (existingTripId) {
        console.log('🔄 Loading existing trip from URL:', existingTripId);
        loadExistingTrip(existingTripId);
      } else {
        if (formData?.parkCode && !parkName && !isNewChat && !isPersonalized && !suggestText) {
          return;
        }

        // Wait for anonymous session restore before showing welcome (avoids flash)
        if (isAnonymous && !isAuthenticated && anonymousRestoreStatus === 'pending') {
          return;
        }
        if (isAnonymous && !isAuthenticated && anonymousRestoreStatus === 'restored') {
          return;
        }

        if (isAuthenticated && authRestoreStatus === 'pending') {
          return;
        }
        if (isAuthenticated && authRestoreStatus === 'restored') {
          return;
        }

        // Check if we're restoring a session before showing welcome message
        const tempState = tripHistoryService.getTempChatState();
        if (tempState?.messages?.length >= 2) {
          return;
        }
        if (tempState?.currentTripId) {
          loadExistingTrip(tempState.currentTripId);
          return;
        }

        // Only show welcome message if we're not restoring a session
        showWelcomeMessage();
      }
    }
  }, [
    providersLoaded,
    existingTripId,
    isStartingFresh,
    isNewChat,
    isPersonalized,
    isAnonymous,
    isAuthenticated,
    anonymousRestoreStatus,
    authRestoreStatus,
    parkName,
  ]);

  // Auto-send Quick Fill summary when applied
  useEffect(() => {
    if (quickFillMessage && providersLoaded && providers.length > 0 && !isGenerating) {
      setHasUsedQuickFill(true);
      handleSendMessage(quickFillMessage);
      onQuickFillSent?.();
    }
  }, [quickFillMessage, providersLoaded, providers.length]);

  // Deep link from demo / marketing (?ask=) — welcome first, then send once
  useEffect(() => {
    if (
      !initialAskMessage ||
      initialAskSentRef.current ||
      isPersonalized ||
      isNewChat ||
      existingTripId ||
      providersLoaded === false ||
      providers.length === 0 ||
      isGenerating
    ) {
      return;
    }

    const welcomeReady =
      messages.length >= 1 &&
      messages.some((m) => m.role === 'assistant') &&
      !messages.some((m) => m.role === 'user' && !m.hiddenFromUi);

    if (!welcomeReady) return;

    initialAskSentRef.current = true;
    const timer = setTimeout(() => {
      handleSendMessage(initialAskMessage);
      onInitialAskSent?.();
    }, 600);

    return () => clearTimeout(timer);
  }, [
    initialAskMessage,
    isPersonalized,
    isNewChat,
    existingTripId,
    providersLoaded,
    providers.length,
    isGenerating,
    messages,
    onInitialAskSent,
  ]);

  // Auto-send first message in personalized mode only (never on regular New Chat)
  useEffect(() => {
    if (
      !isPersonalized ||
      isNewChat ||
      providersLoaded === false ||
      providers.length === 0 ||
      isGenerating ||
      messages.length > 0 ||
      personalizedSentRef.current
    ) {
      return;
    }
    personalizedSentRef.current = true;
    const hasTrips = tripHistory.length > 0;
    const autoMessage = hasTrips
      ? 'I opened My Recommendations — help me pick my next park trip based on my history. Ask me exactly ONE short question first (trip length, region, or vibe). Do not list destinations yet.'
      : 'I opened My Recommendations — help me discover parks that fit me. Ask exactly ONE question about my travel style before suggesting places.';
    handleSendMessage(autoMessage, { hiddenFromUi: true });
  }, [isPersonalized, isNewChat, providersLoaded, providers.length, isGenerating, messages.length, tripHistory.length]);

  useEffect(() => {
    if (!isPersonalized) {
      personalizedSentRef.current = false;
      personalizedInitRef.current = false;
    }
  }, [isPersonalized]);

  const handleSendMessage = async (messageText, options = {}) => {
    const { hiddenFromUi = false } = options;
    if (!messageText.trim() || isGenerating) return;

    primeCompletionSound?.();

    console.log('🔄 handleSendMessage called:', {
      messageText: messageText.trim(),
      currentTripId,
      isGenerating
    });

    // Check if providers are available
    if (providers.length === 0) {
      showToast('No AI providers available. Please configure API keys.', 'error');
      return;
    }

    // Abort any existing request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Add user message
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
      hiddenFromUi,
    };

    setMessages(prev => [...prev, userMessage]);
    if (!hiddenFromUi) {
      userSentMessageRef.current = true; // flag for auto-scroll
    }
    setIsGenerating(true);
    setThinkingStartTime(Date.now());
    setThinkingMessage('Thinking...');
    setThinkingSources(null);

    try {
      // Build context for AI
      const userContext = user ? await tripHistoryService.getAIContext(user.id) : null;
      
      const sessionContext = buildClientSessionContext(userContext, isPersonalized);

      const requestMetadata = {
        parkCode: formData.parkCode,
        parkName,
        lat: formData.coordinates?.lat,
        lon: formData.coordinates?.lon,
        formData,
        personalizedRecommendations: isPersonalized,
        aiContext: userContext || null,
      };
      // Build conversation history — include image context so AI can
      // answer follow-up questions about the photos it shared
      const conversationHistory = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => {
          let content = msg.content;
          if (msg.role === 'assistant' && msg.parkImages?.length > 0) {
            const imageDesc = msg.parkImages
              .map((img, i) => `[Photo ${i + 1}: ${img.altText || img.title || 'Park photo'}]`)
              .join(' ');
            content += `\n\n(Photos shown to user: ${imageDesc})`;
          }
          return { role: msg.role, content };
        });

      const msgs = [
        ...conversationHistory,
        { role: 'user', content: messageText.trim() }
      ];

      // Stream responses for guests and logged-in users
      let data;
      let streamStarted = false;
      const streamAssistantId = Date.now() + 1;
      rawStreamedContentRef.current = '';
      cancelStreamFlush();

      const applyAnonymousSessionFromResult = (result) => {
        if (!isAnonymous || !result) return;
        if (result.anonymousId) setAnonymousId(result.anonymousId);
        if (result.messageCount !== undefined) setMessageCount(result.messageCount);
        if (result.canSendMore !== undefined) setCanSendMore(result.canSendMore);
        if (result.anonymousId) {
          saveAnonymousSession({
            anonymousId: result.anonymousId,
            messageCount: result.messageCount,
            canSendMore: result.canSendMore,
          });
        }
      };

      const streamCallbacks = {
        onThinking: (thinkingData) => {
          const { sources, parkName: sourcePark, parkNames: sourceParks } = thinkingData;
          setThinkingSources(sources || []);
          const parks = sourceParks?.length > 0 ? sourceParks.join(', ') : (sourcePark || parkName || 'the park');
          if (sources?.includes('web')) {
            setThinkingMessage(`Searching the web for live info about ${parks}...`);
          } else if (sources?.includes('nps') && sources?.includes('weather')) {
            setThinkingMessage(`Fetching live park data & weather for ${parks}...`);
          } else if (sources?.includes('nps')) {
            setThinkingMessage(`Fetching live park data for ${parks}...`);
          } else if (sources?.includes('weather')) {
            setThinkingMessage(`Checking weather forecast for ${parks}...`);
          } else {
            setThinkingMessage('Preparing your response...');
          }
        },
        onChunk: (chunk) => {
          rawStreamedContentRef.current += chunk;

          const applyStreamContent = () => {
            streamFlushRafRef.current = null;
            const displayContent = stripItineraryJsonForDisplay(rawStreamedContentRef.current);
            if (!streamStarted) {
              streamStarted = true;
              setIsGenerating(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: streamAssistantId,
                  role: 'assistant',
                  content: displayContent,
                  timestamp: new Date(),
                  provider: 'auto',
                  isStreaming: true,
                },
              ]);
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamAssistantId ? { ...m, content: displayContent } : m
                )
              );
            }
          };

          if (streamFlushRafRef.current == null) {
            streamFlushRafRef.current = requestAnimationFrame(applyStreamContent);
          }
        },
        onDone: (result) => {
          cancelStreamFlush();

          const resolvedContent = result.contentUnchanged
            ? stripItineraryJsonForDisplay(rawStreamedContentRef.current)
            : (result.content ?? stripItineraryJsonForDisplay(rawStreamedContentRef.current));

          data = {
            content: resolvedContent,
            contentUnchanged: result.contentUnchanged === true,
            provider: result.provider,
            model: result.model,
            hasLiveData: result.hasLiveData,
            parkName: result.parkName,
            parkNames: result.parkNames || (result.parkName ? [result.parkName] : []),
            hasItinerary: result.hasItinerary || false,
            itineraryData: result.itineraryData || result.itinerary || null,
            parkImages: result.parkImages || [],
            anonymousId: result.anonymousId,
            messageCount: result.messageCount,
            canSendMore: result.canSendMore,
            isConversionMessage: result.isConversionMessage,
          };
          applyAnonymousSessionFromResult(result);

          if (result.isConversionMessage || !streamStarted) {
            return;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamAssistantId
                ? {
                    ...m,
                    ...(result.contentUnchanged ? {} : { content: resolvedContent }),
                    provider: result.provider,
                    model: result.model,
                    isStreaming: false,
                    hasLiveData: result.hasLiveData,
                    parkName: result.parkName,
                    parkNames: result.parkNames || (result.parkName ? [result.parkName] : []),
                    hasItinerary: result.hasItinerary || false,
                    parkImages: result.parkImages || [],
                  }
                : m
            )
          );
        },
        onError: (err) => {
          console.error('Stream error:', err);
        },
      };

      try {
        if (isAnonymous) {
          await aiService.chatAnonymousStream({
            messages: msgs,
            systemPrompt: sessionContext,
            provider: 'auto',
            temperature: 0.4,
            top_p: 0.9,
            max_tokens: 8000,
            signal: controller.signal,
            metadata: requestMetadata,
            anonymousId,
            ...streamCallbacks,
          });
        } else {
          await aiService.chatStream({
            messages: msgs,
            systemPrompt: sessionContext,
            provider: 'auto',
            temperature: 0.4,
            top_p: 0.9,
            max_tokens: 8000,
            conversationId: currentTripId,
            signal: controller.signal,
            metadata: {
              ...requestMetadata,
              userId: user?.id,
            },
            ...streamCallbacks,
          });
        }
      } catch (streamErr) {
        if (streamErr.name === 'AbortError') throw streamErr;
        console.error('Streaming failed, falling back to non-streaming:', streamErr.message);
      }

      if (!data) {
        if (streamStarted) {
          setMessages((prev) => prev.filter((m) => m.id !== streamAssistantId));
        }
        setIsGenerating(true);

        if (isAnonymous) {
          data = await aiService.chatAnonymous({
            messages: msgs,
            systemPrompt: sessionContext,
            provider: 'auto',
            temperature: 0.4,
            top_p: 0.9,
            max_tokens: 8000,
            signal: controller.signal,
            metadata: requestMetadata,
            anonymousId,
          });
          applyAnonymousSessionFromResult(data);
        } else {
          data = await aiService.chat({
            messages: msgs,
            systemPrompt: sessionContext,
            provider: 'auto',
            temperature: 0.4,
            top_p: 0.9,
            max_tokens: 8000,
            conversationId: currentTripId,
            signal: controller.signal,
            metadata: {
              ...requestMetadata,
              userId: user?.id,
            },
          });
        }
      }

      // Check if this is a conversion message
      if (data.isConversionMessage) {
        // Update anonymous session state to show conversion UI
        setCanSendMore(false);
        setMessageCount(data.messageCount || 0);
        
        // Save session data to localStorage
        saveAnonymousSession({
          anonymousId: data.anonymousId,
          messageCount: data.messageCount,
          canSendMore: false
        });
        
        // Add the conversion message to the chat
        const responseTime = Date.now() - thinkingStartTime;
        const assistantMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: buildGuestLimitIntro({ timeUntilReset, parkName }),
          timestamp: new Date(),
          provider: data.provider,
          model: data.model,
          responseTime: responseTime,
          isConversionMessage: true,
        };

        setMessages(prev => [...prev, assistantMessage]);
        setIsGenerating(false);
        setThinkingStartTime(null);
        if (data.content) playCompletionSound?.();
        return; // Don't continue with normal processing
      }

      // Add AI response
      const responseTime = Date.now() - thinkingStartTime;

      // Build the assistant message for saving DIRECTLY (not inside setMessages callback,
      // because React 18 batching may defer the updater function when other updates are pending,
      // which would leave updatedMessagesForSave as null).
      const usedStreaming = streamStarted && !data.isConversionMessage;
      const assistantMessageId = usedStreaming ? streamAssistantId : Date.now() + 1;

      const assistantMessageForSave = {
        id: assistantMessageId,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        provider: data.provider,
        model: data.model,
        responseTime,
        isStreaming: false,
        hasLiveData: data.hasLiveData,
        parkName: data.parkName,
        parkNames: data.parkNames || (data.parkName ? [data.parkName] : []),
        hasItinerary: data.hasItinerary || false,
        parkImages: data.parkImages || []
      };

      // `messages` from closure = pre-send messages; userMessage was defined above
      const updatedMessagesForSave = [...messages, userMessage, assistantMessageForSave];

      // Still update React state for the UI (adds responseTime, clears isStreaming)
      setMessages(prev => {
        if (usedStreaming) {
          return prev.map(msg =>
            msg.id === streamAssistantId
              ? { ...msg, responseTime, isStreaming: false, hasLiveData: data.hasLiveData, parkName: data.parkName, hasItinerary: data.hasItinerary || false, parkImages: data.parkImages || [] }
              : msg
          );
        }

        return [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: data.content,
            timestamp: new Date(),
            provider: data.provider,
            model: data.model,
            responseTime,
            hasLiveData: data.hasLiveData,
            parkName: data.parkName,
            hasItinerary: data.hasItinerary || false,
            parkImages: data.parkImages || []
          }
        ];
      });

      // Check if response contains a complete trip plan and build the plan object
      const looksLikePlan = data.hasItinerary ||
        /(^|\n)\s*(Day\s*\d+[:\-\s]|Itinerary|Schedule|Plan)\b/i.test(data.content);
      let planForSave = currentPlan;
      if (looksLikePlan) {
        // Build plan with structured itinerary data (days) if available from backend
        if (data.itineraryData?.days) {
          planForSave = {
            type: 'itinerary',
            version: 1,
            generatedAt: new Date().toISOString(),
            createdFrom: 'ai',
            parkName,
            parkCode: formData.parkCode || null,
            content: data.content,
            formData,
            ...data.itineraryData
          };
        } else {
          planForSave = { parkName, content: data.content, formData };
        }
        setCurrentPlan(planForSave);
      }

      // Auto-save conversation to history
      if (updatedMessagesForSave.length >= 2) {
        autoSaveConversation(updatedMessagesForSave, planForSave);
      }

      // Track AI chat interaction
      logAIChat(messageText.trim(), responseTime, true);

      setIsGenerating(false);
      setThinkingStartTime(null);
      if (data?.content) playCompletionSound?.();

    } catch (error) {
      // Log detailed error information for debugging
      console.error('AI Chat Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        code: error.code,
        name: error.name,
        provider: 'auto',
        isAnonymous
      });
      
      if (error.name === 'AbortError') {
        cancelStreamFlush();
        return;
      }
      
      // Track failed AI chat interaction
      const failedResponseTime = Date.now() - thinkingStartTime;
      logAIChat(messageText.trim(), failedResponseTime, false);
      
      // Extract error details from response
      const errorDetails = error.response?.data;
      const errorStatus = error.response?.status;
      
      // Check if it's a token limit error
      let errorMessage = 'Failed to get AI response';
      let assistantMessage = 'I couldn\'t reach the AI provider. Please try again.';
      
      if (errorStatus === 429) {
        if (errorDetails?.error === 'Daily token limit exceeded') {
          errorMessage = 'Daily usage limit reached. Please try again tomorrow.';
          assistantMessage = `**Daily Limit Reached**\n\nYou've reached your daily usage limit. Please try again tomorrow.`;
        } else {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          assistantMessage = '⏳ **Rate Limited**\n\nYou\'re making requests too quickly. Please wait a moment and try again.';
        }
      } else if (errorStatus === 400) {
        // API configuration error
        const details = errorDetails?.details || errorDetails?.error || error.message;
        errorMessage = 'AI provider configuration error';
        assistantMessage = `**Configuration Error**\n\n${details}\n\nPlease check your API configuration.`;
      } else if (errorStatus === 401 || errorStatus === 403) {
        // Authentication error - check if it's a session expiration vs AI provider issue
        const errMsg = errorDetails?.error || error.message || '';
        if (errMsg.includes('Not authorized') || errMsg.includes('token') || errMsg.includes('expired') || errMsg.includes('log in')) {
          errorMessage = 'Session expired';
          assistantMessage = `**Session Expired**\n\nYour login session has expired. Please refresh the page and log in again to continue chatting.`;
        } else {
          errorMessage = 'AI provider authentication failed';
          assistantMessage = `**Authentication Error**\n\nUnable to authenticate with the AI provider. Please check API key configuration.`;
        }
      } else if (errorStatus === 500 || errorStatus === 503) {
        // Server/provider error
        const details = errorDetails?.error || errorDetails?.details || 'The AI provider is temporarily unavailable';
        errorMessage = 'AI provider error';
        assistantMessage = `**Provider Error**\n\n${details}\n\nPlease try again in a moment.`;
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        // Timeout error
        errorMessage = 'Request timed out';
        assistantMessage = '⏱️ **Request Timeout**\n\nThe AI provider took too long to respond. Please try again.';
      } else if (!error.response) {
        // Network error
        errorMessage = 'Network error';
        assistantMessage = '**Network Error**\n\nUnable to reach the AI provider. Please check your connection and try again.';
      }
      
      showToast(errorMessage, 'error');
      
      // Keep the user message and show error response
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date()
      }]);
      setIsGenerating(false);
      setThinkingStartTime(null);
    }
  };

  const formatItineraryForPrompt = (plan) => {
    if (!plan?.days?.length) return '';

    let text = '\n\nCURRENT ITINERARY (user-built in Itinerary Builder):';
    for (const day of plan.days) {
      const stopCount = day.stops?.length || 0;
      text += `\n${day.label} (${stopCount} stop${stopCount !== 1 ? 's' : ''}):`;

      if (day.stops?.length) {
        day.stops.forEach((stop, i) => {
          let line = `\n  ${i + 1}. ${stop.name}`;
          if (stop.type) line += ` (${stop.type})`;

          const timeParts = [];
          if (stop.startTime) timeParts.push(stop.startTime);
          if (stop.duration) timeParts.push(`${stop.duration}min`);
          if (timeParts.length) line += ` — ${timeParts.join(', ')}`;

          const trailParts = [];
          if (stop.difficulty) trailParts.push(stop.difficulty);
          if (stop.distanceMiles) trailParts.push(`${stop.distanceMiles}mi`);
          if (stop.elevationGainFeet) trailParts.push(`↑${stop.elevationGainFeet}ft`);
          if (trailParts.length) line += ` | ${trailParts.join(' | ')}`;

          if (stop.note) line += ` — Note: ${stop.note}`;
          text += line;
        });
      } else {
        text += '\n  (no stops yet)';
      }
    }

    text += `\n\nITINERARY INTERACTION RULES:
- When the user asks about their itinerary, reference the structure above.
- If they ask to add, remove, or modify stops, describe the changes in plain language (e.g., "I'd add a lunch stop at Yosemite Lodge between stops 2 and 3 on Day 1"). Do NOT regenerate the entire itinerary unless the user explicitly asks for a full replan.
- The user can make these changes themselves in the Itinerary Builder — your job is to advise, not to produce a replacement plan.
- NEVER mention JSON, code blocks, data formats, or offer to "regenerate the JSON". Speak naturally about the itinerary as a travel plan.`;
    return text;
  };

  /** Session context merged server-side with Trailie persona (not a replacement system prompt). */
  const buildClientSessionContext = (userContext, isPersonalizedMode = false) => {
    const days = calculateDays();

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    const currentSeason = getCurrentSeason(currentMonth);

    let prompt = `You are helping plan ${suggestText ? `a multi-park road trip to ${suggestText}` : parkName ? `a trip to ${parkName}` : 'a US outdoor trip'}.${suggestText ? `

ROAD TRIP CONTEXT:
This user came from the compare page wanting to plan a road trip visiting: ${suggestText}. Focus on that multi-park itinerary when they ask about "the road trip" or planning.` : ''}

CURRENT CONTEXT:
- Today's date: ${currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Current month: ${currentMonth} (${getMonthName(currentMonth)})
- Current season: ${currentSeason}
- Current year: ${currentYear}

TRIP DETAILS:
- ${suggestText ? `Destinations: ${suggestText}` : `Park: ${parkName}`}
- Duration: ${days} days
- Dates: ${formData.startDate} to ${formData.endDate}
- Group: ${formData.groupSize} people
- Budget: ${formData.budget}
- Fitness: ${formData.fitnessLevel}
- Interests: ${(formData.interests || []).join(', ') || 'not specified'}
- Accommodation: ${formData.accommodation}`;

    if (userContext && userContext.totalTrips > 0) {
      prompt += `\n\nUSER HISTORY & PREFERENCES:
- Previous trips: ${userContext.totalTrips}
- Favorite activities: ${userContext.topInterests.join(', ')}
- Preferred budget: ${userContext.preferredBudget}
- Preferred fitness: ${userContext.preferredFitness}`;

      if (userContext.recentParks.length > 0) {
        prompt += `\n- Recently visited: ${userContext.recentParks.map(p => p.name).join(', ')}`;
      }

      if (!isPersonalizedMode) {
        prompt += `\n\nGENERAL CHAT MODE (NOT "My Recommendations"):
- Answer the user's actual question first
- Do NOT open with profile callouts on generic discovery questions
- Do NOT inventory their past parks or quote trip counts
- Only reference this history when directly relevant`;
      }
    }

    if (isPersonalizedMode) {
      prompt += `\n\nMy Recommendations mode is active (server will apply personalization rules).`;
    }

    prompt += formatItineraryForPrompt(currentPlan);

    return prompt;
  };

  const createTripSummary = (messages, savedPlan = null) => {
    // Extract key information from conversation
    const userQuestions = messages.filter(msg => msg.role === 'user').map(msg => msg.content);
    const aiResponses = messages.filter(msg => msg.role === 'assistant');

    const hasStructuredPlan =
      Array.isArray(savedPlan?.days) &&
      savedPlan.days.some((day) => Array.isArray(day.stops) && day.stops.length > 0);

    const planResponse = hasStructuredPlan
      ? aiResponses.find((response) =>
          /(Day\s*\d+[:\-\s]|Itinerary|Schedule|## Day)/i.test(response.content)
        )
      : null;

    // Create summary
    const summary = {
      totalMessages: messages.length,
      userQuestions: userQuestions.slice(0, 3), // First 3 user questions
      hasPlan: hasStructuredPlan,
      planPreview: planResponse
        ? truncatePlainText(planResponse.content, 200)
        : null,
      lastActivity: new Date().toISOString(),
      keyTopics: extractKeyTopics(messages)
    };
    
    return summary;
  };

  const extractKeyTopics = (messages) => {
    const topics = new Set();
    
    // Focus on user messages for more accurate topic extraction
    const userMessages = messages.filter(msg => msg.role === 'user');
    const userContent = userMessages.map(msg => msg.content).join(' ').toLowerCase();
    
    // If no user messages, use all content but be more conservative
    const allContent = userMessages.length > 0 ? userContent : messages.map(msg => msg.content).join(' ').toLowerCase();
    
    // More specific and context-aware topic keywords
    const topicKeywords = {
      'hiking': ['hiking', 'trails', 'hike', 'walking', 'trekking'],
      'photography': ['photo', 'photography', 'pictures', 'camera', 'photograph'],
      'wildlife': ['wildlife', 'animals', 'birds', 'wildlife viewing', 'animal watching'],
      'camping': ['camping', 'campsite', 'tent', 'camp', 'backpacking'],
      'lodging': ['hotel', 'lodge', 'accommodation', 'stay', 'accommodations'],
      'dining': ['food', 'restaurant', 'dining', 'eat', 'meal', 'cuisine'],
      'weather': ['weather', 'temperature', 'climate', 'season', 'forecast'],
      'transportation': ['transport', 'car', 'drive', 'travel', 'transportation'],
      'budget': ['budget', 'cost', 'price', 'expensive', 'cheap', 'affordable'],
      'safety': ['safety', 'dangerous', 'safe', 'precautions', 'security'],
      'farms': ['farm', 'farms', 'pumpkin', 'patch', 'agriculture', 'harvest'],
      'festivals': ['festival', 'event', 'celebration', 'fair', 'market'],
      'local': ['local', 'nearby', 'area', 'region', 'community'],
      'parks': ['park', 'parks', 'national park', 'state park', 'recreation'],
      'cities': ['city', 'downtown', 'urban', 'metropolitan', 'town']
    };
    
    // Only add topics if they appear in user messages or are clearly relevant
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      const keywordCount = keywords.filter(keyword => allContent.includes(keyword)).length;
      // Require at least 2 keyword matches for generic topics, 1 for specific ones
      const threshold = ['farms', 'festivals', 'local', 'parks', 'cities'].includes(topic) ? 1 : 2;
      if (keywordCount >= threshold) {
        topics.add(topic);
      }
    });
    
    // If no specific topics found, try to extract from user questions
    if (topics.size === 0 && userMessages.length > 0) {
      const firstUserMessage = userMessages[0].content.toLowerCase();
      if (firstUserMessage.includes('farm') || firstUserMessage.includes('pumpkin')) {
        topics.add('farms');
      }
      if (firstUserMessage.includes('park') || firstUserMessage.includes('national')) {
        topics.add('parks');
      }
      if (firstUserMessage.includes('city') || firstUserMessage.includes('downtown')) {
        topics.add('cities');
      }
    }
    
    return Array.from(topics).slice(0, 5); // Top 5 topics
  };

  const startFreshConversation = (customMessage = null, parkName = null) => {
    // Set flag to prevent restoration
    setIsStartingFresh(true);
    
    // Clear current conversation state
    setMessages([]);
    setCurrentTripId(null);
    setHasShownWelcome(false);
    setCurrentPlan(null);
    
    // Clear any saved session state
    localStorage.removeItem('planai-chat-state');

    // If custom message provided, show welcome first, then send message
    if (customMessage) {
      // Show welcome message first
      showWelcomeMessage();
      // Then send the custom message after a delay to ensure welcome is rendered
      setTimeout(() => {
        handleSendMessage(customMessage);
      }, 300);
    } else if (parkName) {
      setMessages([
        {
          id: Date.now(),
          role: 'assistant',
          content: getParkWelcomeMessage(user, parkName),
          timestamp: new Date(),
        },
      ]);
    } else {
      setMessages([
        {
          id: Date.now(),
          role: 'assistant',
          content: getGenericWelcomeMessage(user),
          timestamp: new Date(),
        },
      ]);
    }

    // Reset the flag after a short delay to allow restoration for future sessions
    setTimeout(() => {
      setIsStartingFresh(false);
    }, 1000);
  };

  const handleParkChat = () => {
    if (!parkInput.trim()) return;
    
    // Close the park input modal
    setShowParkInputModal(false);
    
    // Start a fresh conversation with park-specific welcome message
    startFreshConversation(null, parkInput.trim());
    
    // Clear the input
    setParkInput('');
  };

  const handleExportPDF = async () => {
    const hasPlanDays = currentPlan?.days && currentPlan.days.length > 0;
    if (!hasPlanDays) {
      showToast('Generate a full trip plan first to export as PDF', 'info');
      return;
    }

    setIsExportingPDF(true);
    try {
      const { exportTripPdf } = await import('@/lib/pdf/exportTripPdf');
      await exportTripPdf({
        title: formData?.tripTitle || parkName || 'Trip Plan',
        parkName: parkName || formData?.parkName || null,
        parkCode: formData?.parkCode || null,
        tripId: currentTripId,
        formData: formData || {},
        plan: currentPlan,
      });
      showToast('Trip plan exported as PDF!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to export PDF. Please try again.', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleSignupFromChat = () => {
    if (isAuthenticated) {
      window.location.href = '/profile';
      return;
    }
    setSaveModalReason(getSignupPromptReason(messages));
    setShowSaveModal(true);
  };

  const handleLoginFromChat = () => {
    if (isAuthenticated) {
      window.location.href = '/profile';
      return;
    }
    setSaveModalReason(getSignupPromptReason(messages));
    setShowSaveModal(true);
  };

  const storeReturnToChat = () => {
    localStorage.setItem('returnToChat', JSON.stringify({
      anonymousId, parkName, formData, messages, timestamp: Date.now(),
    }));
  };

  const handleSignupRedirect = () => {
    storeReturnToChat();
    router.push('/signup');
  };

  const handleShare = async () => {
    if (!currentTripId || currentTripId.startsWith('temp-') || !isAuthenticated) return;

    setIsSharing(true);
    try {
      const res = await api.post(`/trips/${currentTripId}/share`);
      const data = res.data || res;
      if (data.success || data.shareId) {
        const id = data.shareId || data.data?.shareId;
        const url = `${window.location.origin}/plan-ai/shared/${id}`;
        setShareUrl(url);
        setShowShareModal(true);
        logTripShareCreated({
          tripId: currentTripId,
          parkCode: formData?.parkCode || null,
        });
      } else {
        showToast('Failed to generate share link', 'error');
      }
    } catch (err) {
      showToast('Failed to generate share link', 'error');
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard!', 'success');
    } catch {
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('Link copied!', 'success');
    }
  };

  const handleCopyForSocial = async () => {
    const parkLabel = parkName || 'national park';
    const text = `I planned my ${parkLabel} trip with TrailVerse AI 🏔️\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Social caption copied!', 'success');
    } catch {
      showToast('Could not copy', 'error');
    }
  };

  const autoSaveConversation = async (messagesToSave, planOverride = null) => {
    if (!user || !isAuthenticated || !messagesToSave || messagesToSave.length < 2) return;

    const planToSave = planOverride || currentPlan;

    // Prevent duplicate trip creation from concurrent calls
    if (savingInProgressRef.current && (!currentTripId || currentTripId.startsWith('temp-'))) {
      console.log('⏳ Auto-save already in progress for new trip, skipping duplicate');
      return;
    }

    console.log('🔄 Auto-saving conversation:', {
      currentTripId,
      messagesCount: messagesToSave.length,
      isExistingTrip: currentTripId && !currentTripId.startsWith('temp-'),
      hasFeedback: messagesToSave.some(msg => msg.userFeedback)
    });

    // Auto-save ALL conversations to database (no manual save needed)
    try {
      setSaveState('saving');
      savingInProgressRef.current = true;
      const tripSummary = createTripSummary(messagesToSave, planToSave);

      if (currentTripId && !currentTripId.startsWith('temp-')) {
        console.log('🔄 Updating existing trip in database:', currentTripId);
        // Update existing trip in database
        const updateResponse = await tripService.updateTrip(currentTripId, {
          conversation: messagesToSave,
          summary: tripSummary,
          plan: planToSave,
          provider: 'auto',
          status: 'active'
        });
        console.log('✅ Trip updated successfully:', updateResponse);

        // Force refresh of trips list to update message count
        if (refreshTrips) {
          console.log('🔄 Refreshing trips list to update message count');
          refreshTrips();
        }
        persistSessionToStorage(currentTripId, messagesToSave, planToSave);
      } else {
        // Create new trip in database
        console.log('🆕 Creating NEW trip in database:', {
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          messagesCount: messagesToSave.length
        });
        const response = await tripService.createTrip({
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          title: parkName ? `${parkName} Trip Plan` : 'General Planning Session',
          formData: formData || {},
          conversation: messagesToSave,
          summary: tripSummary,
          plan: planToSave,
          provider: 'auto',
          status: 'active'
        });

        // Update currentTripId with the database ID
        const newTripId = response.data?._id || response._id;
        console.log('✅ NEW trip created with ID:', newTripId);
        setCurrentTripId(newTripId);

        if (refreshTrips) {
          console.log('🔄 Refreshing trips list after new chat created');
          refreshTrips();
        }

        persistSessionToStorage(newTripId, messagesToSave, planToSave);
      }
      setSaveState('saved');
    } catch (error) {
      console.error('Error auto-saving conversation:', error);
      persistSessionToStorage(currentTripId, messagesToSave, planToSave);
      setSaveState('idle');
    } finally {
      savingInProgressRef.current = false;
    }
  };

  // DEPRECATED: saveTripHistory and handleSave are no longer used
  // All conversations now auto-save via autoSaveConversation()
  const saveTripHistory = async (messagesToSave) => {
    if (!user) return;

    // Create trip summary
    const tripSummary = createTripSummary(messagesToSave);

    try {
      // Save to database using tripService
      if (currentTripId && !currentTripId.startsWith('temp-')) {
        // Update existing trip
        await tripService.updateTrip(currentTripId, {
          plan: currentPlan,
          provider: 'auto',
          status: 'active'
        });
      } else {
        // Create new trip in database
        const response = await tripService.createTrip({
          userId: user.id,
          parkCode: formData.parkCode || null,
          parkName: parkName || 'General Planning',
          title: parkName ? `${parkName} Trip Plan` : 'General Planning Session',
          formData: formData || {},
          plan: currentPlan,
          provider: 'auto',
          conversation: messagesToSave.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
          })),
          status: 'active'
        });
        const newTrip = response.data || response;
        setCurrentTripId(newTrip._id || newTrip.id);
        
        // Update user preferences
        tripHistoryService.updateUserPreferences(user.id, {
          parkCode: formData.parkCode,
          formData
        });
      }
    } catch (error) {
      console.error('Error saving trip:', error);
      throw error;
    }
  };

  // DEPRECATED: No longer used - auto-save handles everything
  const handleSave = async () => {
    if (!isAuthenticated) {
      showToast('Please sign in to save plans', 'error');
      return;
    }
    
    if (messages.length === 0) {
      showToast('No conversation to save yet', 'error');
      return;
    }
    
    try {
      // Save to database
      await saveTripHistory(messages);
      
      // Clear temp chat state
      tripHistoryService.clearTempChatState();
      
      // Refresh trip history
      const response = await tripService.getUserTrips(user.id);
      const trips = response.data || response || [];
      setTripHistory(trips);
      
      showToast('Trip saved to your profile!', 'success');
    } catch (error) {
      console.error('Error saving trip:', error);
      showToast('Failed to save trip plan', 'error');
    }
  };






  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  // Provider selector modal removed - auto-select first provider for better UX

  // Show error if no providers
  if (providersLoaded && providers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" 
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="max-w-2xl w-full mx-auto px-3 sm:px-4 lg:px-6 xl:px-8">
          <div className="rounded-2xl p-8 backdrop-blur text-center"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
            <h3 className="text-2xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              No AI Providers Available
            </h3>
            <p className="mb-6"
              style={{ color: 'var(--text-secondary)' }}
            >
              Please configure at least one AI API key (Claude or OpenAI) in your server environment variables.
            </p>
            <button
              onClick={onBack}
              className="px-6 py-3 rounded-xl font-semibold transition"
              style={{
                backgroundColor: 'var(--button-filled-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'var(--button-filled-hover)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'var(--button-filled-bg)';
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)' }}
      onPointerDownCapture={() => primeCompletionSound?.()}
    >
      {/* Chat Messages - Responsive width */}
      <div
        ref={chatContainerRef}
        className="relative flex-1 min-h-0 overflow-y-auto chat-messages-container"
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.target;
          setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200);
        }}
      >
          <div className={`mx-auto w-full max-w-5xl px-3 sm:px-6 lg:px-8 ${isWelcomeState ? 'py-2 sm:py-6' : 'py-2 sm:py-8'}`}>
            <div className={isWelcomeState ? 'sm:flex sm:min-h-[min(100%,28rem)] sm:items-center sm:justify-center' : ''}>
            <div className={`space-y-2 sm:space-y-3 ${isWelcomeState ? 'w-full max-w-3xl' : ''}`}>
              {messages.map((message, index) => (
                message.hiddenFromUi ? null : (
                <React.Fragment key={`${message.id || message._id || index}-${user?.id || 'anonymous'}-${avatarVersion}`}>
                <MessageBubble
                  message={
                    message.isConversionMessage
                      ? message.content || buildGuestLimitIntro({ timeUntilReset, parkName })
                      : message.content
                  }
                  isUser={message.role === 'user'}
                  timestamp={message.timestamp}
                  hideActions={
                    message.isConversionMessage ||
                    (isWelcomeState &&
                    message.role === 'assistant' &&
                    index === 0)
                  }
                  afterContent={
                    message.isConversionMessage ? (
                      <GuestLimitMessageExtras onSignup={handleSignupRedirect} />
                    ) : null
                  }
                  compact={
                    isWelcomeState &&
                    message.role === 'assistant' &&
                    index === 0
                  }
                  linkifyParks={
                    !(
                      isWelcomeState &&
                      message.role === 'assistant' &&
                      index === 0
                    ) && !message.isStreaming
                  }
                  isStreaming={Boolean(message.isStreaming)}
                  userAvatar={message.role === 'user' ? (() => {
                    // Anonymous users: use the session-stable random avatar
                    if (!user) {
                      return anonymousAvatar;
                    }

                    // Logged-in users: use their actual avatar from profile
                    const savedAvatar = user.avatar || user.profilePicture || user.profile?.avatar;
                    if (savedAvatar && typeof savedAvatar === 'string' && savedAvatar.trim() !== '') {
                      return savedAvatar;
                    }

                    // Logged-in user without a saved avatar: generate deterministic one from their identity
                    return getBestAvatar({
                      email: user.email,
                      firstName: user.firstName,
                      lastName: user.lastName,
                      name: user.name
                    }, {}, 'travel');
                  })() : null}
                  hasLiveData={message.hasLiveData || false}
                  liveDataParks={message.parkNames || (message.parkName ? [message.parkName] : [])}
                  parkImages={message.parkImages || []}
                  messageData={message.role === 'assistant' ? {
                    messageId: message.id,
                    userMessage: messages[messages.indexOf(message) - 1]?.content || '',
                    aiResponse: message.content,
                    aiProvider: message.provider,
                    aiModel: message.model,
                    responseTime: message.responseTime
                  } : null}
                  onCopy={(content) => {
                    navigator.clipboard.writeText(content);
                    showToast('Copied to clipboard!', 'success');
                  }}
                  onFeedback={async (type, messageData) => {
                    console.log('🚀 === FEEDBACK BUTTON CLICKED ===');
                    console.log('🚀 Type:', type);
                    console.log('🚀 Message ID:', message.id);
                    console.log('🚀 Current Trip ID:', currentTripId);
                    
                    try {
                      console.log('👍 Feedback submitted:', {
                        type,
                        conversationId: currentTripId,
                        messageId: messageData.messageId,
                        hasUserMessage: !!messageData.userMessage,
                        hasAiResponse: !!messageData.aiResponse,
                        provider: messageData.aiProvider
                      });
                      
                      // Update message with feedback in state (to persist the visual state)
                      console.log('📝 Updating message state with feedback...');
                      setMessages(prev => {
                        const updatedMessages = prev.map(msg => 
                          msg.id === message.id 
                            ? { ...msg, userFeedback: type }
                            : msg
                        );
                        
                        console.log('✅ Message state updated, now auto-saving...');
                        
                        // Auto-save the updated conversation with feedback to database
                        if (currentTripId && !currentTripId.startsWith('temp-')) {
                          console.log('💾 Calling autoSaveConversation...');
                          console.log('💾 CurrentTripId:', currentTripId);
                          console.log('💾 Messages to save:', updatedMessages.length);
                          
                          // Clear any pending auto-save to prevent duplicates
                          if (autoSaveTimeoutRef.current) {
                            clearTimeout(autoSaveTimeoutRef.current);
                          }
                          
                          // Debounce auto-save to prevent version conflicts
                          autoSaveTimeoutRef.current = setTimeout(() => {
                            console.log('💾 EXECUTING auto-save NOW...');
                            const messageSummary = updatedMessages.map(m => ({
                              id: m.id,
                              role: m.role,
                              userFeedback: m.userFeedback,
                              hasFeedback: !!m.userFeedback
                            }));
                            console.log('💾 Updated messages being saved:');
                            messageSummary.forEach(m => {
                              console.log(`  - ${m.role} #${m.id}: feedback=${m.userFeedback || 'none'}`);
                            });
                            autoSaveConversation(updatedMessages).catch(err => {
                              console.error('❌ Auto-save failed:', err);
                            });
                            autoSaveTimeoutRef.current = null;
                          }, 300); // 300ms debounce
                        } else {
                          console.warn('⚠️ Skipping auto-save:', { currentTripId });
                        }
                        
                        return updatedMessages;
                      });

                      if (isAnonymous || !isAuthenticated) {
                        console.log('ℹ️ Skipping feedback API submission for anonymous chat');
                        return;
                      }
                      
                      // Only submit feedback to analytics API if we have required data
                      // Note: userMessage can be empty for welcome messages
                      if (!messageData.messageId || !messageData.aiResponse || !messageData.aiProvider) {
                        console.warn('⚠️ Missing required feedback data for analytics:', messageData);
                        showToast('Feedback recorded!', 'success');
                        return;
                      }

                      const feedbackData = feedbackService.prepareFeedbackData({
                        conversationId: currentTripId, // Can be null for unsaved conversations
                        messageId: messageData.messageId,
                        feedback: type,
                        userMessage: messageData.userMessage || 'N/A (welcome message)',
                        aiResponse: messageData.aiResponse,
                        aiProvider: messageData.aiProvider,
                        aiModel: messageData.aiModel,
                        parkCode: formData.parkCode,
                        parkName: parkName,
                        responseTime: messageData.responseTime
                      });

                      console.log('📤 Submitting feedback to API:', {
                        conversationId: feedbackData.conversationId,
                        feedback: feedbackData.feedback,
                        provider: feedbackData.aiProvider
                      });

                      await feedbackService.submitFeedback(feedbackData);
                      logAIFeedback({
                        feedback: type,
                        conversationId: currentTripId,
                      });

                      console.log('✅ Feedback submitted successfully!');
                      
                      // No toast - visual feedback (blue/red button) is enough
                    } catch (error) {
                      console.error('Error submitting feedback:', error);
                      // No toast - visual feedback (blue/red button) is enough
                    }
                  }}
                  initialFeedback={message.userFeedback}
                  onRegenerate={message.role === 'assistant' ? async () => {
                    const msgIndex = messages.indexOf(message);
                    const userMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user');
                    if (userMsg) {
                      showToast('Regenerating...', 'info');
                      setMessages(prev => prev.filter(m => m.id !== message.id));
                      await handleSendMessage(userMsg.content);
                    }
                  } : undefined}
                  onExport={message.role === 'assistant' ? (action, content) => {
                    if (action === 'copy') {
                      navigator.clipboard.writeText(content);
                      showToast('Plan copied to clipboard!', 'success');
                    }
                  } : undefined}
                />
                </React.Fragment>
                )
              ))}

              {isAnonymous &&
               messages.filter(m => m.role === 'user').length >= 1 &&
               !isGenerating &&
               messages[messages.length - 1]?.role === 'assistant' && (() => {
                const userMsgCount = messages.filter((m) => m.role === 'user').length;
                if (userMsgCount !== 1) return null;

                const saveReason = getSignupPromptReason(messages);
                const savePrompt = getSignupPrompt(saveReason, { parkName });
                return (
                <div className="mx-auto max-w-3xl px-3 sm:px-6">
                  <div
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: 'rgba(67, 160, 106, 0.08)',
                      borderWidth: '1px',
                      borderColor: 'rgba(67, 160, 106, 0.25)',
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {savePrompt.inlineTitle}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {savePrompt.inlineSubtitle}
                      </p>
                    </div>
                    <Button
                      onClick={handleSignupFromChat}
                      variant="primary"
                      size="sm"
                      icon={Sparkles}
                    >
                      {savePrompt.inlineCta}
                    </Button>
                  </div>
                </div>
                );
               })()}

              {isGenerating && <TypingIndicator
                text={thinkingMessage}
                sources={thinkingSources}
              />}

              <div ref={messagesEndRef} />
            </div>
            </div>
          </div>
        </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <div className="sticky bottom-24 z-10 flex justify-center pointer-events-none">
          <button
            onClick={() => {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium shadow-lg transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-secondary)',
              border: '1px solid',
              borderColor: 'var(--border)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
            aria-label="Scroll to bottom"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            New messages
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="relative z-20 flex-shrink-0 border-t"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 -6px 18px rgba(15, 23, 42, 0.04)',
            paddingBottom: 'env(safe-area-inset-bottom, 16px)'
          }}
        >
          <div className="mx-auto w-full max-w-5xl px-3 pb-2 pt-1.5 sm:px-6 sm:pb-5 sm:pt-4 lg:px-8">
            <div className="px-1 sm:px-0">
            <div className="mb-1.5 flex flex-col gap-1.5 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:gap-2">
                {chatStatus && (
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap sm:px-3 sm:text-xs"
                    style={{
                      backgroundColor: chatStatus.tone === 'saved'
                        ? 'rgba(34, 197, 94, 0.12)'
                        : chatStatus.tone === 'saving'
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'var(--surface-hover)',
                      color: chatStatus.tone === 'saved'
                        ? '#15803d'
                        : chatStatus.tone === 'saving'
                          ? '#b45309'
                          : 'var(--text-secondary)',
                      border: '1px solid',
                      borderColor: chatStatus.tone === 'saved'
                        ? 'rgba(34, 197, 94, 0.22)'
                        : chatStatus.tone === 'saving'
                          ? 'rgba(245, 158, 11, 0.22)'
                          : 'var(--border)'
                    }}
                  >
                    <span>{chatStatus.label}</span>
                  </div>
                )}
                {anonymousQuotaLabel && (
                  <div
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap sm:px-3 sm:text-xs"
                    style={{
                      backgroundColor: anonymousMessagesRemaining === 1
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                      color: anonymousMessagesRemaining === 1 ? '#b91c1c' : '#b45309',
                      border: '1px solid',
                      borderColor: anonymousMessagesRemaining === 1
                        ? 'rgba(239, 68, 68, 0.2)'
                        : 'rgba(245, 158, 11, 0.2)'
                    }}
                  >
                    {anonymousQuotaLabel}
                  </div>
                )}
                {onOpenQuickFill && (
                  <button
                    type="button"
                    onClick={onOpenQuickFill}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition hover:opacity-90 sm:px-3 sm:text-xs"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    {hasUsedQuickFill ? (
                      <><Edit2 className="h-3.5 w-3.5" />Edit Trip Details</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" />Plan My Trip</>
                    )}
                  </button>
                )}
                {isAuthenticated && currentTripId && !currentTripId.startsWith('temp-') && messages.some(m => m.role === 'assistant') && (
                  <button
                    onClick={handleShare}
                    disabled={isSharing}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition hover:opacity-90 disabled:opacity-50 sm:px-3 sm:text-xs"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)'
                    }}
                    title="Share this trip plan"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {isSharing ? 'Sharing...' : 'Share'}
                  </button>
                )}
                {isAuthenticated && currentTripId && !currentTripId.startsWith('temp-') && currentPlan?.days?.length > 0 && (
                  <>
                    <button
                      onClick={() => router.push(`/plan-ai/${currentTripId}/plan`)}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition hover:opacity-90 sm:px-3 sm:text-xs"
                      style={{
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)'
                      }}
                      title="Open plan workspace"
                    >
                      <span style={{ fontSize: '12px' }}>📋</span>
                      Plan
                    </button>
                    <button
                      onClick={handleExportPDF}
                      disabled={isExportingPDF}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition hover:opacity-90 disabled:opacity-50 sm:px-3 sm:text-xs"
                      style={{
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)'
                      }}
                      title="Export trip as PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {isExportingPDF ? 'Exporting...' : 'PDF'}
                    </button>
                  </>
                )}
              </div>
              {chatStatus?.description && (
                <p className="hidden max-w-md text-xs leading-relaxed sm:block" style={{ color: 'var(--text-tertiary)' }}>
                  {chatStatus.description}
                </p>
              )}
            </div>

            {isWelcomeState && isPersonalized && (
              <p
                className="mb-1.5 text-xs leading-relaxed sm:mb-3 sm:text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE} — or try asking:
              </p>
            )}

            {isWelcomeState && onOpenQuickFill && !isPersonalized && (
              <p
                className="mb-1.5 text-xs leading-relaxed sm:mb-3 sm:text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                Use Plan My Trip to add destination, dates, budget, and interests — or try asking:
              </p>
            )}

            {isWelcomeState && (
              <div className="mb-1.5 sm:mb-3">
                <SuggestedPrompts
                  mobileMax={2}
                  hideTitle={Boolean(onOpenQuickFill || isPersonalized)}
                  prompts={isPersonalized ? [
                    { icon: Sparkles, text: "What should I explore this season based on my interests?", color: "text-green-400" },
                    { icon: MapPin, text: "Suggest a park I haven't visited yet that matches my style", color: "text-blue-400" },
                    { icon: Calendar, text: "Plan a weekend trip based on what I usually enjoy", color: "text-yellow-400" },
                    { icon: Edit2, text: "What's trending near parks I've already visited?", color: "text-purple-400" },
                  ] : [
                    { icon: Sparkles, text: "Plan a 5-day trip to Yellowstone for a family", color: "text-green-400" },
                    { icon: MapPin, text: "Best national parks for stargazing in the Southwest", color: "text-blue-400" },
                    { icon: Calendar, text: "Weekend hiking trip from Denver under $500", color: "text-yellow-400" },
                    { icon: Compare, text: "Compare Zion and Bryce Canyon for beginners", color: "text-purple-400" },
                  ]}
                  onSelect={(text) => handleSendMessage(text)}
                  title={isPersonalized ? 'Suggestions for you' : 'Try asking...'}
                  subtitle={null}
                />
              </div>
            )}

            {/* Chat Input */}
            <ChatInput
              onSend={handleSendMessage}
              disabled={isGenerating || (isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)))}
              placeholder={isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)) ? "Sign in or create an account to save this chat and continue..." : "Ask me about your trip..."}
              initialValue=""
            />
            </div>
          </div>
        </div>


      {/* Park Input Modal */}
      {showParkInputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowParkInputModal(false);
              setParkInput('');
            }}
          />
          
          {/* Modal */}
          <div className="relative w-full max-w-md mx-4 rounded-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: 'rgba(67, 160, 106, 0.12)', color: 'var(--accent-green)' }}
                  >
                    <MapPin className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Chat About Park
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowParkInputModal(false);
                    setParkInput('');
                  }}
                  className="p-2 rounded-lg transition"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-4">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Which park would you like to chat about?
                </p>
                
                <input
                  type="text"
                  value={parkInput}
                  onChange={(e) => setParkInput(e.target.value)}
                  placeholder="Enter park name (e.g., Yellowstone, Yosemite, Grand Canyon...)"
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && parkInput.trim()) {
                      handleParkChat();
                    }
                  }}
                  autoFocus
                />
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowParkInputModal(false);
                      setParkInput('');
                    }}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleParkChat}
                    disabled={!parkInput.trim()}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: parkInput.trim() ? 'var(--accent-green)' : 'var(--surface-hover)',
                      color: parkInput.trim() ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    Start Chat
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Trip Modal */}
      {showShareModal && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowShareModal(false)}
          />
          {/* Modal */}
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: 'rgba(67, 160, 106, 0.12)', color: 'var(--accent-green)' }}
                  >
                    <Share2 className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Share Your Trip Plan
                  </h2>
                </div>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-2 rounded-lg transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* URL display */}
              <div
                className="flex items-center gap-2 p-3 rounded-xl mb-4"
                style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}
              >
                <p
                  className="flex-1 text-sm truncate font-mono"
                  style={{ color: 'var(--text-secondary)', fontSize: '12px' }}
                >
                  {shareUrl}
                </p>
                <button
                  onClick={handleCopyShareUrl}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                >
                  Copy
                </button>
              </div>

              {/* Social copy */}
              <button
                onClick={handleCopyForSocial}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition mb-4"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Copy for Social Media
              </button>

              {/* Info */}
              <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                Anyone with this link can view your trip plan (read-only)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save Trip Modal — replaces redirect to /signup */}
      <SaveTripModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        parkName={parkName}
        anonymousId={anonymousId}
        formData={formData}
        messages={messages}
        reason={saveModalReason}
      />
    </div>
  );
};

export default TripPlannerChat;
