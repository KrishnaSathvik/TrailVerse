import TrailieDraftPreview from '@/components/itinerary/TrailieDraftPreview';
import { draftPreviewEnabled, reduceDraftPreview } from '@/lib/trailieDraftPreview';
import { answerStreamEnabled, reduceAnswerStream } from '@/lib/trailieAnswerStream';
import ProvisionalAnswer from '@/components/ai-chat/ProvisionalAnswer';
import { applyTerminalOwnership } from '@/utils/terminalOwnership';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin, Calendar, CalendarDays, Users, AlertCircle, X, Clock, CheckCircle, Edit2,
  Share2,
  Download,
  RefreshCw,
} from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { tripHistoryService, conversationHasUserMessages, sanitizeMessagesForPersistence } from '../../services/tripHistoryService';
import tripService from '../../services/tripService';
import conversationService from '../../services/conversationService';
import aiService from '../../services/aiService';
import api from '../../services/api';
import feedbackService from '../../services/feedbackService';
import { logAIChat, logPlanAiSessionStart, logTrailieMessageSubmitted } from '../../utils/analytics';
import { truncatePlainText } from '@/utils/stripMarkdown';
import ChatInput from '../ai-chat/ChatInput';
import MessageBubble from '../ai-chat/MessageBubble';
import TypingIndicator from '../ai-chat/TypingIndicator';
import SuggestedPrompts from '../ai-chat/SuggestedPrompts';
import Button from '../common/Button';
import SaveTripModal from './SaveTripModal';
import GuestAccountCard from './GuestAccountCard';
import { tripSurfacePath } from '@/lib/tripSurfacePath';
import { formatIntentGuideContextForPrompt } from '@/lib/intentPlanAi';
import { buildGuestLimitIntro } from '@/lib/guestLimitMessage';
import { TRAILIE_DEMO_PROMPTS, TRAILIE_PERSONALIZED_PROMPTS } from '@/lib/trailieDemoPrompts';
import {
  installTrailieDemoObserver,
  recordTrailieDemoSubmission,
  recordTrailieDemoTripId,
} from '@/lib/trailieDemoObserver';
import { getBestAvatar, generateRandomAvatar } from '../../utils/avatarGenerator';
import { ANONYMOUS_MESSAGE_LIMIT } from '@/lib/anonymousChatLimits';
import {
  GUEST_TURN_REFUSAL_CODES,
  clearGuestPendingTurn,
  createGuestClientTurnId,
  markGuestTurnFailed,
  recordGuestPendingTurn,
  selectCompletedGuestHistory,
} from '@/lib/guestTurnLifecycle';
import {
  SIGNUP_PROMPT_REASONS,
} from '@/lib/planAiSignupPrompts';
import {
  MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE,
  resolvePlanAiWelcomeMessage,
} from '@/lib/planAiWelcomeCopy';
import { derivePlanAiHeaderMeta, PLAN_AI_ENTRY, resolvePlanningParkName } from '@/lib/planAiHeaderMeta';
import { applyMessageConstraintOverrides } from '@/lib/messageConstraintOverrides';
import { stripItineraryJsonForDisplay } from '@/utils/streamDisplayContent';
import { selectPlanToPersist, selectTerminalPlanForDisplay, buildTargetPlanMutationSave, runOrderedCrossPlanPersistence, shouldSaveConversationForTurn } from '@/utils/persistCanonicalPlan';
import { resolveSaveState, resolveChatStatus } from '@/utils/saveStateFromPersistence';
import { isPersistenceAccepted } from '@/utils/persistenceDecision';
import { resolveThinkingStageCopy } from '@/utils/thinkingStageCopy';
import {
  classifyTrailieTurnOutcome,
  resolveTrailieTurnDisplayContent,
  wasGuestTurnConsumedByServer,
  isUncertainConnectionLossError,
  canRetryTrailieTurn,
  excludeTransientFailuresFromHistory,
  resolveTrailieRetryPlan,
  UNCERTAIN_CONNECTION_LOSS_MESSAGE,
  TRAILIE_TURN_OUTCOME,
} from '@/utils/trailieTurnOutcome';
import { buildResponseSavePayload } from '@/utils/responseSavePayload';
import { resolveItineraryOnlyTerminalPersistence } from '@/utils/itineraryOnlyTerminalPersistence';
// Stage 14.3 — early frozen-itinerary delivery. All race handling lives in the
// coordinator + reducer, never inline here.
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import {
  upsertItineraryTurn,
  updateProseTurn,
  applyPendingLabel,
} from '@/utils/earlyRevisionMessages';
// Stage 14.5 — ONE interpretation of a stored response, shared with the share
// payload builder and the export path.
import {
  VIEWER_CONTEXT,
  deriveTrailieStoredPresentation,
} from '@/utils/trailieStoredPresentation';
import { getTrailieCapabilities } from '@/lib/trailieCapabilities';
import { RECOVERY_MESSAGE } from '@/utils/proseRecoveryClient';
import EarlyItineraryCard from './EarlyItineraryCard';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { tripRevision } from '@/lib/trailieRichPresentation';
import {
  attachCanonicalPlanToConversation,
  toLiveTrailieResponseModel,
} from '@/lib/trailieResponseModel';
import { createUiWelcomeMessage, MESSAGE_KIND, selectCanonicalConversation } from '@/lib/messageOwnership';
import { resolveTripDestination } from '@/lib/tripDestination';
import { mapServerMessagesToUi } from '@/utils/serverMessagesToUi';
import { applySessionStatusToStoredSession } from '@/lib/guestSessionStatusWrite';
import { deviceOnlyMessages, guestCacheScope, localRecoveryHistory, canRestoreHistoryPrefix, historyFingerprint, preserveRecoverySet, acknowledgeRecoverySet, shouldOfferRecovery, conversationSendBlocked } from '@/lib/conversationContinuity';
import ConversationRecoveryNotice from './ConversationRecoveryNotice';
import { selectTravelerOwnedFormData } from '@/lib/formDataProvenance';
import { shouldRestoreAnonymousPlanAiSession, shouldRestorePlanAiSession, withEntryFormData, withPersonalization } from '@/lib/planAiEntryContext';
import {
  ensureGuestSessionIdentity,
  GUEST_SESSION_STORAGE_KEY,
  isValidGuestSessionId,
} from '@/lib/guestSessionIdentity';


const ANONYMOUS_SESSION_KEY = GUEST_SESSION_STORAGE_KEY;
const ANONYMOUS_GUEST_AVATAR_KEY = 'anonymousGuestAvatar';
const ANONYMOUS_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const EMPTY_PARK_LIST = [];
const STREAM_IDLE_MS = 4000;

function liveFlagsFromSources(sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) {
    return { hasLiveData: false, hasWebSearch: false };
  }
  return {
    hasWebSearch: list.includes('web'),
    hasLiveData: list.some((s) => s === 'nps' || s === 'weather' || s === 'web'),
  };
}

function readStoredAnonymousSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ANONYMOUS_SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return isValidGuestSessionId(session?.anonymousId) ? session : null;
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
  intentContext = null,
  entryMode = 'general',
  entryContext = null,
  fromCompare = false,
  refreshTrips = null,
  onOpenQuickFill = null,
  fromChatHistory = false,
  quickFillMessage = null,
  onQuickFillSent = null,
  initialAskMessage = null,
  onInitialAskSent = null,
  playCompletionSound = null,
  primeCompletionSound = null,
  onShellMetaChange = null,
}) => {
  const router = useRouter();
  const guestConversationId = entryContext?.guestConversationId || null;
  const { user, isAuthenticated, updateUser } = useAuth();
  const { showToast } = useToast();
  const { subscribe, unsubscribe, subscribeToProfile, subscribeToTrips } = useWebSocket();
  // Establish the guest bearer secret synchronously, before a submit handler
  // can dispatch the first request. Authenticated identity is untouched.
  const [anonymousId, setAnonymousId] = useState(
    () => (
      !isAuthenticated && typeof window !== 'undefined'
        ? ensureGuestSessionIdentity().anonymousId
        : null
    )
  );
  
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
  const urlTripRestoreKeyRef = useRef(null);
  const [draftPreview, setDraftPreview] = useState(null);
  const [provisionalAnswer, setProvisionalAnswer] = useState(null);
  const [previewOutcome, setPreviewOutcome] = useState(null);
  useEffect(() => () => { const active = abortControllerRef.current; abortControllerRef.current = null; active?.abort(); }, []);
  const streamFlushRafRef = useRef(null);
  const rawStreamedContentRef = useRef('');
  const streamIdleTimerRef = useRef(null);
  const activeStreamSourcesRef = useRef(null);
  // Has the server reported a REAL lifecycle stage on this turn yet? Once it
  // has, stages own the progress copy and an evidence event may only update the
  // source list. Before it has, the older source-derived copy still serves
  // routes that emit sources without stages.
  const sawServerStageRef = useRef(false);
  const activeTripContextRef = useRef(
    typeof window !== 'undefined' ? readStoredAnonymousSession()?.activeTripContext || null : null
  );

  const cancelStreamFlush = useCallback(() => {
    if (streamFlushRafRef.current != null) {
      cancelAnimationFrame(streamFlushRafRef.current);
      streamFlushRafRef.current = null;
    }
  }, []);

  const clearStreamIdleTimer = useCallback(() => {
    if (streamIdleTimerRef.current != null) {
      clearTimeout(streamIdleTimerRef.current);
      streamIdleTimerRef.current = null;
    }
  }, []);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  // Phase 6A — neutral pre-first-stage default only. The moment a real
  // server stage arrives, resolveThinkingStageCopy (thinkingStageCopy.js)
  // takes over unchanged; this string is never shown once that happens.
  const [thinkingMessage, setThinkingMessage] = useState('Working on that…');
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [thinkingSources, setThinkingSources] = useState(null);
  const [, setIsRestoredSession] = useState(false);
  const [tripHistory, setTripHistory] = useState([]);
  const [showParkInputModal, setShowParkInputModal] = useState(false);
  const [parkInput, setParkInput] = useState('');
  const [isStartingFresh, setIsStartingFresh] = useState(false);
  const [anonymousAvatar, setAnonymousAvatar] = useState(() => {
    const session = readStoredAnonymousSession();
    if (session?.avatarUrl) return session.avatarUrl;
    return readStoredGuestAvatarUrl();
  });
  const [isAnonymous, setIsAnonymous] = useState(!isAuthenticated);
  const applyActiveTripContextFromResult = useCallback((result) => {
    if (!result?.activeTripContext) return;
    activeTripContextRef.current = result.activeTripContext;

    if (!isAnonymous) return;
    const existing = readStoredAnonymousSession();
    if (!existing?.anonymousId) return;
    if (result.anonymousId && existing.anonymousId !== result.anonymousId) return;

    localStorage.setItem(
      ANONYMOUS_SESSION_KEY,
      JSON.stringify({
        ...existing,
        activeTripContext: result.activeTripContext,
      })
    );
  }, [isAnonymous]);

  const [historyRecovery, setHistoryRecovery] = useState(null);
  const [continuityNotice, setContinuityNotice] = useState('');
  const [historySyncBusy, setHistorySyncBusy] = useState(false);
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
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [shareUrl, setShareUrl] = useState(null);
  /** Sticky entry mode for shell header — survives generic URL after deep link navigation */
  const [sessionEntryMode, setSessionEntryMode] = useState(entryMode);
  const [sessionSuggestText, setSessionSuggestText] = useState(suggestText || '');
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalReason, setSaveModalReason] = useState(SIGNUP_PROMPT_REASONS.SAVE_ITINERARY);
  const [saveModalMode, setSaveModalMode] = useState('signup');
  const [saveModalSurface, setSaveModalSurface] = useState(null);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const draftPreviewRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const messagesRef = useRef(messages);
  const currentTripIdRef = useRef(currentTripId);
  const currentPlanRef = useRef(currentPlan);
  const planningStateRef = useRef(null);
  const guestCacheOwnerRef = useRef(null);
  guestCacheOwnerRef.current = { guestSessionId: anonymousId, guestConversationId };
  const entryContextRef = useRef(entryContext);
  useEffect(() => {
    entryContextRef.current = entryContext;
  }, [entryContext]);
  messagesRef.current = messages;
  currentTripIdRef.current = currentTripId;
  currentPlanRef.current = currentPlan;
  // P0-1 (audit 2026-08-31): read via refs inside showWelcomeMessage so the
  // invariant check always sees live state, not a stale closure.
  const isGeneratingRef = useRef(isGenerating);
  isGeneratingRef.current = isGenerating;
  // P0-1: anonymous session boot is one-shot per mount. Recurring dependency
  // changes (parkName resolving, entryContext updates) must never re-enter
  // restore once the guest thread has booted.
  const anonymousBootRanRef = useRef(false);
  const authBootRanRef = useRef(false);
  const savingInProgressRef = useRef(false);
  // Local-only demo/acceptance observability. No-op in production builds.
  useEffect(() => {
    installTrailieDemoObserver();
  }, []);
  // Stage 14.3 — the active early-delivery coordinator for the in-flight turn.
  const earlyCoordinatorRef = useRef(null);
  // Stage 14.5 — explicit prose recovery, owner-only and never automatic.
  const [recoveringResponseId, setRecoveringResponseId] = useState(null);
  const [recoveryNotice, setRecoveryNotice] = useState(null);
  const recoveryCapability = getTrailieCapabilities().trailieProseRecoveryEnabled;
  const previousExistingTripIdRef = useRef(existingTripId);
  const lastMessageCountRef = useRef(0);
  const userSentMessageRef = useRef(false);
  const personalizedSentRef = useRef(false);
  const personalizedInitRef = useRef(false);
  const initialAskSentRef = useRef(false);
  const [composerDraft, setComposerDraft] = useState(null);
  const entryDraftAppliedRef = useRef(false);
  const sessionStartTrackedRef = useRef(false);
  const parkContextRef = useRef(null);
  const pendingParkImagesRef = useRef([]);
  const isNearBottomRef = useRef(true);
  const messagesLengthWhenAtBottomRef = useRef(0);

  const SCROLL_NEAR_BOTTOM_PX = 80;

  // The page itself scrolls (no nested chat scroller), so track the document.
  const handleChatScroll = useCallback(() => {
    const { scrollTop, scrollHeight, clientHeight } = document.scrollingElement || document.documentElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom <= SCROLL_NEAR_BOTTOM_PX;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      messagesLengthWhenAtBottomRef.current = messagesRef.current.length;
      setShowScrollToLatest(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleChatScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleChatScroll);
  }, [handleChatScroll]);

  const scrollChatToBottom = useCallback(() => {
    const el = document.scrollingElement || document.documentElement;
    window.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    isNearBottomRef.current = true;
    messagesLengthWhenAtBottomRef.current = messagesRef.current.length;
    setShowScrollToLatest(false);
  }, []);

  // Presentation follows canonical persistence and the current provisional turn.
  const chatStatus = resolveChatStatus({ isAnonymous, saveState,
    hasPersistedPlan: Boolean(currentTripId && currentPlan?.days?.length && saveState === 'saved'),
    draftPreview, previewOutcome, isPlanning: draftPreviewEnabled() && isGenerating,
  });
  const anonymousMessagesRemaining = Math.max(0, ANONYMOUS_MESSAGE_LIMIT - messageCount);
  const getWelcomePlaceholderContent = useCallback(
    () =>
      resolvePlanAiWelcomeMessage({
        entryMode,
        user,
        parkName,
        suggestText,
        intentContext,
        isPersonalized,
        isNewChat,
        fromCompare,
      }),
    [entryMode, user, parkName, suggestText, intentContext, isPersonalized, isNewChat, fromCompare]
  );

  const canShowWelcomePlaceholder =
    providersLoaded &&
    !existingTripId &&
    !isPersonalized &&
    messages.length === 0 &&
    !isGenerating &&
    !isStartingFresh &&
    anonymousRestoreStatus !== 'pending' &&
    authRestoreStatus !== 'pending';

  const displayMessages = canShowWelcomePlaceholder
    ? [
        {
          id: 'welcome-placeholder',
          role: 'assistant',
          content: getWelcomePlaceholderContent(),
          timestamp: null,
        },
      ]
    : messages;

  // Quota presentation follows an existing visible artifact, never conversation keywords.
  const guestTrip = displayMessages.reduce((latest, message, index) => {
    const plan = message.canonicalPlan || message.itineraryPlan;
    if (message.hiddenFromUi || message.isConversionMessage || !plan?.days?.length) return latest;
    const stored = deriveTrailieStoredPresentation({
      response: message, canonicalPlan: plan, viewerContext: VIEWER_CONTEXT.OWNER,
    });
    return stored.showItinerary ? { plan, index } : latest;
  }, null);

  const isWelcomeState =
    !messages.some((message) => message.role === 'user' && !message.hiddenFromUi) &&
    !isGenerating &&
    !messages.some((message) => message.isConversionMessage) &&
    displayMessages.length === 1 &&
    displayMessages[0].role === 'assistant';

  const showComposerToolbar =
    !isWelcomeState && messages.some((m) => m.role === 'user' && !m.hiddenFromUi);


  const hasUserMessages = messages.some((m) => m.role === 'user' && !m.hiddenFromUi);

  // Stage 14.3 — on unmount, stop applying lifecycle updates to React state.
  // Persistence already in flight is deliberately left to settle: the saved trip
  // stays recoverable even though this component is gone.
  useEffect(() => () => earlyCoordinatorRef.current?.dispose(), []);

  useEffect(() => {
    if (isNewChat) {
      setSessionEntryMode(PLAN_AI_ENTRY.GENERAL);
      setSessionSuggestText('');
      return;
    }
    if (entryMode !== PLAN_AI_ENTRY.GENERAL) {
      setSessionEntryMode(
        entryMode === PLAN_AI_ENTRY.COMPARE ? PLAN_AI_ENTRY.PARK : entryMode
      );
    }
  }, [entryMode, isNewChat]);

  useEffect(() => {
    if (suggestText?.trim()) {
      setSessionSuggestText(suggestText);
    }
  }, [suggestText]);

  const resolvedParkName = useMemo(
    () => resolvePlanningParkName({ parkName, messages }),
    [parkName, messages]
  );

  const headerSuggestText = sessionSuggestText || suggestText;

  useEffect(() => {
    if (!onShellMetaChange) return;
    onShellMetaChange(
      derivePlanAiHeaderMeta({
        entryMode,
        sessionEntryMode,
        isPersonalized,
        parkName,
        suggestText: headerSuggestText,
        intentContext,
        formData,
        currentPlan,
        hasUserMessages,
        resolvedParkName,
      })
    );
  }, [
    onShellMetaChange,
    entryMode,
    sessionEntryMode,
    isPersonalized,
    parkName,
    headerSuggestText,
    intentContext,
    formData,
    currentPlan,
    hasUserMessages,
    resolvedParkName,
  ]);

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


  // Only offer jump-to-latest when new content arrives below — not when reading older messages
  useEffect(() => {
    if (isNearBottomRef.current) return;
    if (isGenerating || messages.length > messagesLengthWhenAtBottomRef.current) {
      setShowScrollToLatest(true);
    }
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

  /**
   * Stage 14.8H.1 §5 — restore drops UI chrome from canonical history.
   *
   * Two mechanisms, in order of trustworthiness: the declared ownership marker
   * for anything written after this stage, and a conservative STRUCTURAL rule
   * for trips already carrying the Stage 14.8H defect — a leading assistant
   * message with no response identity, positioned before the first user turn.
   * Neither inspects message text.
   *
   * The legacy content regex this replaces (`/welcome back/i`) both missed
   * personalised copy and could delete a real answer that happened to use the
   * phrase. Stored records are not rewritten; this is a read-side exclusion.
   */
  const stripWelcomeBackMessages = (messageList = []) =>
    selectCanonicalConversation(messageList, { includeLegacyRecognition: true });

  const showWelcomeMessage = useCallback(async () => {
    // P0-1 invariant (audit 2026-08-31): welcome chrome may only seed a thread
    // that has no conversation. Once a user turn exists, or while a response
    // is being generated, NO caller — init effects, restore, session-status
    // refresh — may replace the transcript with the welcome message.
    if (isGeneratingRef.current) return;
    if (conversationHasUserMessages(messagesRef.current)) return;

    const content = resolvePlanAiWelcomeMessage({
      entryMode,
      user,
      parkName,
      suggestText,
      intentContext,
      isPersonalized,
      isNewChat,
      fromCompare,
    });

    // Stage 14.8H.1 — declared UI chrome. Stage 14.8H persisted this copy as a
    // second assistant turn because it entered message state indistinguishable
    // from a real response; the marker is what keeps it out of every canonical
    // write and out of restored history.
    setMessages([
      createUiWelcomeMessage({
        id: Date.now(),
        content,
        timestamp: new Date(),
      }),
    ]);
  }, [entryMode, user, parkName, isPersonalized, isNewChat, suggestText, intentContext, fromCompare]);

  // Define loadExistingTrip before the useEffect that uses it
  const loadExistingTrip = useCallback(async (tripId) => {
    setAuthRestoreStatus('pending');
    console.log('🔄 Loading existing trip:', tripId);
    try {
      const tripResponse = await tripService.getTrip(tripId, { skipCache: true });
      console.log('🔄 Raw API response:', tripResponse);
      const trip = tripResponse.data || tripResponse;
      console.log('🔄 Found trip:', trip);
      console.log('🔄 Trip has conversation array:', Array.isArray(trip.conversation));
      console.log('🔄 Trip conversation:', trip.conversation);
    
      if (!trip) throw new Error('Conversation unavailable');
      if (trip) {
        setSaveState('saved');
        // Check if trip has conversationId (localStorage trip) or direct messages (backend trip)
        if (trip.conversationId) {
          try {
            console.log('🔄 Loading conversation from backend:', trip.conversationId);
            // Fetch conversation from backend using conversationId
            const conversation = await conversationService.getConversation(trip.conversationId, { skipCache: true });
            console.log('🔄 Loaded conversation:', conversation);
            const messagesToLoad = attachCanonicalPlanToConversation(
              stripWelcomeBackMessages(conversation.conversation || []),
              trip.plan,
            );
            setMessages(messagesToLoad);
          } catch (error) {
            console.error('Error loading conversation:', error);
            // A failed fetch must never masquerade as an empty conversation.
            throw error;
          }
        } else {
          // Backend trip with direct messages (check both conversation and messages)
          console.log('🔄 Loading messages from trip:', trip.conversation || trip.messages);
          console.log('🔄 Trip conversation length:', (trip.conversation || []).length);
          console.log('🔄 Trip messages length:', (trip.messages || []).length);
          const messagesToLoad = attachCanonicalPlanToConversation(
            stripWelcomeBackMessages(trip.conversation || trip.messages || []),
            trip.plan,
          );
          console.log('🔄 Setting messages:', messagesToLoad.length, 'messages');
          console.log('🔄 Messages with feedback:', messagesToLoad.filter(m => m.userFeedback).map(m => ({ id: m.id, feedback: m.userFeedback })));
          setMessages(messagesToLoad);
        }
        
        setCurrentPlan(trip.plan);
        setCurrentTripId(tripId); // Set the current trip ID for this conversation
        console.log('🔄 Set currentTripId to:', tripId);
        console.log('✅ Trip loaded successfully');
        setAuthRestoreStatus('restored');
        return true;
        // Trip loading runs silently in background - no toast notification
      }
    } catch (error) {
      console.error('❌ Error loading trip:', error);
      setAuthRestoreStatus('error');
      setContinuityNotice('Could not load your saved conversation. Reload to retry.');
      return false;
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

    if (tempState?.currentTripId || conversationHasUserMessages(tempState?.messages)) {
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

  // ── FABRICATED PROGRESS: DELETED (2026-08-27) ─────────────────────────────
  //
  // A 1 Hz `setInterval` used to live here and rewrite `thinkingMessage` from
  // elapsed wall-clock seconds: "Combining trip details..." at 10 s, "Building a
  // realistic plan..." at 15 s, "Checking the plan for timing and tradeoffs..."
  // at 20 s — none of it tied to anything the server was doing. Because it ran
  // every second it also OVERWROTE the real stage the server had sent, within a
  // second of it arriving, so the honest signal never survived past ~5 s.
  //
  // Progress copy now changes only when the server reaches a new lifecycle
  // stage. Nothing may advance it because time passed. If a stage lasts twenty
  // seconds its copy stays on screen for twenty seconds — which is the truth.

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

      // Server retention is authoritative. Keep the valid bearer so startup
      // can reconnect, or explicitly reconcile its cache after a server 404.

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
        parkName: (sessionData.messageCount || 0) > 0 ? parkName : '',
        formData: (sessionData.messageCount || 0) > 0 ? formData : null,
        activeTripContext:
          sessionData.activeTripContext ??
          activeTripContextRef.current ??
          existing?.activeTripContext ??
          null,
        timestamp: sameSession && existing?.timestamp ? existing.timestamp : Date.now(),
      };
      localStorage.setItem(ANONYMOUS_SESSION_KEY, JSON.stringify(sessionToSave));
      localStorage.removeItem(ANONYMOUS_GUEST_AVATAR_KEY);
      setAnonymousAvatar(avatarUrl);
    }
  }, [isAnonymous, parkName, formData]);

  // Validate session with backend
  const validateSessionWithBackend = useCallback(async (anonymousId) => {
    if (!anonymousId) return null;

    try {
      // P0-1 (audit 2026-08-31): quota and restore decisions must never run on
      // cached data — a stale session-status (messageCount 0) unlinked live
      // sessions. Always read fresh.
      const response = await api.get(`/ai/session-status/${anonymousId}${guestConversationId ? `?conversationId=${encodeURIComponent(guestConversationId)}` : ''}`, { skipCache: true });
      const { canSendMore, messageCount, isConverted, messages: serverMessages, authoritativeMessages, historyHash, planningState, hasPendingTurn } = response.data;

      setCanSendMore(canSendMore);
      setMessageCount(messageCount);

      // Update localStorage with backend data — forward-only. A read that
      // would lower messageCount (out-of-order response) is never written.
      const savedSession = localStorage.getItem(ANONYMOUS_SESSION_KEY);
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const nextSession = applySessionStatusToStoredSession(sessionData, { canSendMore, messageCount });
        if (nextSession) {
          localStorage.setItem(ANONYMOUS_SESSION_KEY, JSON.stringify(nextSession));
        }
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
      return { canSendMore, messageCount, messages: authoritativeMessages || serverMessages || [], historyHash, planningState: planningState || null, hasPendingTurn: Boolean(hasPendingTurn) };
    } catch (error) {
      // A guest id is created in the browser before the first message, so the
      // server has no row yet. That 404 is a fresh start, not a failed request.
      if (error?.response?.status === 404) {
        return { missing: true, canSendMore: true, messageCount: 0, messages: [], historyHash: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', planningState: null };
      }
      console.error('Error validating session with backend:', error);
      return null;
    }
  }, [guestConversationId]);

  // Restore anonymous session from localStorage
  const restoreAnonymousSession = useCallback(async () => {
    setAnonymousRestoreStatus('pending');
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


      if (sessionData.anonymousId) {
        setAnonymousId(sessionData.anonymousId);
      }
      setMessageCount(sessionData.messageCount ?? 0);
      setCanSendMore(sessionData.canSendMore ?? true);
      setIsSessionRestored(true);
      if (!guestConversationId && sessionData.activeTripContext) {
        activeTripContextRef.current = sessionData.activeTripContext;
      }

      if (sessionData.avatarUrl) {
        setAnonymousAvatar(sessionData.avatarUrl);
      } else if (sessionData.anonymousId) {
        const avatarUrl = resolveAnonymousAvatarUrl(sessionData.anonymousId, sessionData);
        sessionData.avatarUrl = avatarUrl;
        localStorage.setItem(ANONYMOUS_SESSION_KEY, JSON.stringify(sessionData));
        setAnonymousAvatar(avatarUrl);
      }

      // Browser cache is never an independent model-history source.
      const temp = guestConversationId ? null : tripHistoryService.getTempChatState();
      const status = await validateSessionWithBackend(sessionData.anonymousId);
      if (!status) {
        setContinuityNotice('Could not reconnect this conversation. Retry before sending another message.');
        setAnonymousRestoreStatus('error');
        return false;
      }
      const authoritative = status.messages || [];
      const archiveKey = `trailie-history-recovery:${sessionData.anonymousId}`;
      const archived = guestConversationId ? null : localStorage.getItem(archiveKey);
      const parsedArchive = archived ? JSON.parse(archived) : null;
      const archive = parsedArchive ? (Array.isArray(parsedArchive) ? { messages: parsedArchive } : parsedArchive) : null;
      const owner = { anonymousId: sessionData.anonymousId, conversationId: guestConversationId };
      const archiveMatches = guestCacheScope(archive, owner) === 'matching_or_legacy';
      const source = archiveMatches ? archive : temp;
      const scope = guestCacheScope(source, owner);
      const cache = scope === 'matching_or_legacy' ? localRecoveryHistory(source?.messages) : [];
      const missing = deviceOnlyMessages(cache, authoritative);
      for (const candidate of [archive, temp]) {
        if (candidate && !['empty', 'matching_or_legacy'].includes(guestCacheScope(candidate, owner))) {
          // Preserve a proven different chat before the current cache is refreshed.
          const suffix = encodeURIComponent(`${candidate.guestSessionId || 'legacy'}:${candidate.guestConversationId || candidate.currentTripId || 'default'}`);
          localStorage.setItem(`${archiveKey}:other-chat:${suffix}`, JSON.stringify(candidate));
        }
      }
      if (process.env.NODE_ENV !== 'production') {
        // Diagnostics contain counts/hashes/identities, never conversation text.
        void historyFingerprint(cache).then(cachedHistoryHash => console.info('[Trailie conversation reconciliation]', {
          anonymousId: sessionData.anonymousId, conversationId: guestConversationId,
          cacheScope: scope, source: archiveMatches ? 'recovery_backup' : 'chat_cache',
          rawCachedCount: source?.messages?.length || 0, cachedCount: cache.length,
          serverCount: authoritative.length, cachedHistoryHash, serverHistoryHash: status.historyHash,
          deviceOnlyCount: missing.length, deviceOnlyIndexes: missing.map(m => cache.indexOf(m)),
        })).catch(() => {});
      }
      setMessages(mapServerMessagesToUi(authoritative));
      planningStateRef.current = status.planningState || null;
      const lastPlan = [...authoritative].reverse().find(m=>m.canonicalPlan)?.canonicalPlan || null;
      setCurrentPlan(lastPlan);
      setMessageCount(status.messageCount); setCanSendMore(status.canSendMore);
      if (missing.length) {
        localStorage.setItem(archiveKey, JSON.stringify({ guestSessionId: sessionData.anonymousId, guestConversationId, messages: cache }));
        const archiveId = await historyFingerprint(missing) || JSON.stringify(missing.map(m => ({ role: m.role, content: m.content })));
        const acknowledged = preserveRecoverySet(localStorage, archiveKey, archiveId, cache);
        setHistoryRecovery(shouldOfferRecovery(missing, acknowledged)
          ? { messages: cache, deviceOnlyMessages: missing, canRestore: canRestoreHistoryPrefix(cache, authoritative), expectedHistoryHash: status.historyHash, archiveKey, archiveId, blocking: false }
          : null);
        setContinuityNotice(null);
      } else {
        setHistoryRecovery(null);
        setContinuityNotice(null);
      }
      // Archive first, then make the active device mirror match the server,
      // including an empty saved chat. Local extras never enter model history.
      tripHistoryService.saveTempChatState({ currentTripId: null, guestSessionId: sessionData.anonymousId, guestConversationId, messages: mapServerMessagesToUi(authoritative), plan: lastPlan, provider: 'auto' });
      setAnonymousRestoreStatus(status.hasPendingTurn ? 'error' : authoritative.length ? 'restored' : 'empty');
      if (status.hasPendingTurn) setContinuityNotice('Your last message is still being checked. Reconnect before sending another.');
      console.log('🔄 Restored anonymous session:', sessionData);
      return true;
    } catch (error) {
      console.error('Error restoring anonymous session:', error);
      setContinuityNotice('Could not reconnect this conversation. Retry before sending another message.');
      setAnonymousRestoreStatus('error');
      return false;
    }
  }, [isAnonymous, isAuthenticated, validateSessionWithBackend, guestConversationId]);

  const persistSessionToStorage = useCallback((tripId, msgs, plan) => {
    // Stage 14.8A.2 §9 — for a guest, `AnonymousSession` localStorage mirrors
    // SERVER-COMPLETED history only. A pending optimistic turn, a failed turn,
    // a streaming placeholder, and an empty assistant bubble are all dropped, so
    // a refresh can never resurrect a failed attempt as a completed one. The
    // mirror carries no allowance decision — remaining allowance always comes
    // back from the server — so it can never become an independent quota source.
    const persistable = isAnonymous ? selectCompletedGuestHistory(msgs) : msgs;
    if (!conversationHasUserMessages(persistable)) return;
    tripHistoryService.saveTempChatState({
      currentTripId: tripId || null,
      ...(isAnonymous ? guestCacheOwnerRef.current : {}),
      messages: persistable,
      plan: plan || null,
      provider: 'auto',
      activeTripContext: activeTripContextRef.current || null,
    });
  }, [isAnonymous]);

  // Restore logged-in session from local cache or DB when returning to /plan-ai
  useEffect(() => {
    const shouldRestore = shouldRestorePlanAiSession({
      isAuthenticated, existingTripId, isNewChat, isPersonalized, isStartingFresh, initialAskMessage, entryContext,
    });
    if (!shouldRestore) {
      if (isAuthenticated && !existingTripId && (isNewChat || isPersonalized || initialAskMessage)) {
        setAuthRestoreStatus('n/a');
      }
      return;
    }

    // P0-1: one-shot boot — entryContext (a dependency) changes during a live
    // conversation, and re-entering restore then replaced the transcript.
    if (authBootRanRef.current) return;
    authBootRanRef.current = true;

    let cancelled = false;
    setAuthRestoreStatus('pending');

    const restoreAuthSession = async () => {
      const temp = guestConversationId ? null : tripHistoryService.getTempChatState();

      if (temp?.currentTripId) {
        const loaded = await loadExistingTrip(temp.currentTripId);
        if (!cancelled) setAuthRestoreStatus(loaded ? 'restored' : 'error');
        if (!loaded) setContinuityNotice('Could not load your saved conversation. Reload to retry.');
        return;
      }
      if (temp?.messages && conversationHasUserMessages(temp.messages)) {
        localStorage.setItem('trailie-unlinked-history', JSON.stringify(temp));
        setMessages([]); setCurrentPlan(null);
        setContinuityNotice('We couldn’t reconnect an earlier chat. Its messages are backed up on this device. Your next message will start a new conversation.');
      }
      if (!cancelled) setAuthRestoreStatus('empty');
    };

    restoreAuthSession().catch((error) => {
      console.error('Error restoring authenticated session:', error);
      if (!cancelled) setAuthRestoreStatus('error');
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
    entryContext,
    loadExistingTrip,
    guestConversationId,
  ]);

  // Keep conversation cache in sync for SPA navigation (not only after auto-save)
  useEffect(() => {
    if (isStartingFresh || isNewChat || isPersonalized) return;
    if (!conversationHasUserMessages(messages)) return;

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
      const hasUserMessages = conversationHasUserMessages(msgs);

      if (hasUserMessages) {
        persistSessionToStorage(
          currentTripIdRef.current,
          msgs,
          currentPlanRef.current
        );
      }

      // Welcome-only browse — do not leave stale context for the next visit
      if (!hasUserMessages) {
        tripHistoryService.clearTempChatState();
        tripHistoryService.clearFormState();
        tripHistoryService.clearAnonymousBrowseContext();
      }
    };
  }, [persistSessionToStorage]);

  // Re-show limit card in-thread when guest returns with the allowance spent.
  // Stage 14.8A.2 §4 — `messageCount` is the server's COMPLETED turn count, so
  // the card belongs at exactly five completed turns, not at a sixth attempt.
  useEffect(() => {
    if (!isAnonymous || isAuthenticated || canSendMore) return;
    if (messages.some((m) => m.isConversionMessage)) return;
    if (messageCount < ANONYMOUS_MESSAGE_LIMIT) return;

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
      // P0-1: one-shot boot. This effect's dependencies (parkName,
      // entryContext, restore callback identity) change during a live
      // conversation; re-entering restore then replaced the transcript.
      // Conversation initialization runs once per mount — recurring
      // dependency changes are not boot events.
      if (anonymousBootRanRef.current) return;
      anonymousBootRanRef.current = true;

      if (guestConversationId) {
        restoreAnonymousSession();
        return;
      }
      if (initialAskMessage) {
        setAnonymousRestoreStatus('empty');
        return;
      }
      const storedSession = readStoredAnonymousSession();
      const shouldResumeGuest = shouldRestoreAnonymousPlanAiSession({
        entryContext,
        hasCompletedSession: Boolean(storedSession?.anonymousId && (storedSession.messageCount || 0) > 0),
      });
      if (shouldResumeGuest) {
        restoreAnonymousSession();
        return;
      }
      if (parkName) {
        setAnonymousRestoreStatus('empty');
        return;
      }
      restoreAnonymousSession();
    }
  }, [isAnonymous, isAuthenticated, parkName, initialAskMessage, entryContext, restoreAnonymousSession, cleanupExpiredSessions, guestConversationId]);

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
    if (isAuthenticated && isAnonymous && !localStorage.getItem('returnToChat')) {
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
    if ((draftPreviewEnabled() || answerStreamEnabled()) && (isNewChat || isPersonalized || existingTripId !== previousTripId)) {
      abortControllerRef.current?.abort();
      setProvisionalAnswer(null);
      setDraftPreview(null);
      setPreviewOutcome(null);
    }
    
    // Reset when explicitly starting new chat (isNewChat or isPersonalized URL flags)
    // These flags indicate user clicked "Start New Chat" or "Get Recommendations"
    if (isNewChat || isPersonalized) {
      console.log('🆕 Starting NEW chat (explicit action) - resetting currentTripId');
      setCurrentTripId(null);
      setCurrentPlan(null);
      setDraftPreview(null);
      setPreviewOutcome(null);
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
      entryMode,
      formData?.parkCode || '',
      parkName || '',
      suggestText || '',
      intentContext?.path || '',
      intentContext?.rankedParks?.length || 0,
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
    entryMode,
    formData?.parkCode,
    parkName,
    suggestText,
    intentContext,
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
        // Restoration changes authRestoreStatus, which is a dependency of
        // this effect. Do not restart the same load on pending/restored/error.
        const ownerId = user?._id || user?.id;
        if (!isAuthenticated || !ownerId) return;
        const restoreKey = `${ownerId}:${existingTripId}`;
        if (urlTripRestoreKeyRef.current === restoreKey) return;
        urlTripRestoreKeyRef.current = restoreKey;
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
        const tempState = guestConversationId ? null : tripHistoryService.getTempChatState();
        if (tempState?.messages && conversationHasUserMessages(tempState.messages)) {
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
    suggestText,
    formData?.parkCode,
    showWelcomeMessage,
    loadExistingTrip,
    guestConversationId,
    user?._id,
    user?.id,
  ]);

  // Safety net: never leave the thread blank when welcome should show
  useEffect(() => {
    if (messages.length > 0 || isGenerating || isStartingFresh || existingTripId || isPersonalized) return;
    if (!providersLoaded) return;
    if (isAnonymous && anonymousRestoreStatus === 'pending') return;
    if (isAuthenticated && authRestoreStatus === 'pending') return;
    if (isAnonymous && anonymousRestoreStatus === 'restored') return;
    if (isAuthenticated && authRestoreStatus === 'restored') return;
    const tempState = tripHistoryService.getTempChatState();
    if (conversationHasUserMessages(tempState?.messages) || tempState?.currentTripId) return;
    if (formData?.parkCode && !parkName && !isNewChat && !suggestText) return;
    showWelcomeMessage();
  }, [
    messages.length,
    isGenerating,
    isStartingFresh,
    existingTripId,
    isPersonalized,
    providersLoaded,
    isAnonymous,
    isAuthenticated,
    anonymousRestoreStatus,
    authRestoreStatus,
    parkName,
    suggestText,
    isNewChat,
    formData?.parkCode,
    showWelcomeMessage,
  ]);

  useEffect(() => {
    if (quickFillMessage) {
      setHasUsedQuickFill(true);
      setComposerDraft({ text: quickFillMessage });
      onQuickFillSent?.();
    }
  }, [quickFillMessage, onQuickFillSent]);

  useEffect(() => {
    if (
      !initialAskMessage ||
      (isAnonymous && guestConversationId && !['restored', 'empty'].includes(anonymousRestoreStatus)) ||
      initialAskSentRef.current ||
      existingTripId ||
      isGenerating
    ) {
      return;
    }

    initialAskSentRef.current = true;
    entryDraftAppliedRef.current = true;
    setComposerDraft({ text: initialAskMessage, preserveExisting: true });
    onInitialAskSent?.();
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
    anonymousRestoreStatus,
    guestConversationId,
    isAnonymous,
  ]);

  useEffect(() => {
    if (entryDraftAppliedRef.current || initialAskMessage || existingTripId || fromChatHistory || isPersonalized || isNewChat || entryContext?.source === 'guest_resume' || messages.some(message => message.role === 'user')) return;
    const text = suggestText
      ? `Help me plan a trip to ${suggestText}.`
      : parkName ? `Help me plan a trip to ${parkName}.`
        : intentContext?.searchQuery ? `Help me plan a trip: ${intentContext.searchQuery}.` : '';
    if (!text) return;
    entryDraftAppliedRef.current = true;
    setComposerDraft({ text, preserveExisting: true });
  }, [initialAskMessage, existingTripId, fromChatHistory, isPersonalized, isNewChat, entryContext, messages, suggestText, parkName, intentContext]);

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
      ? 'Help me pick my next park trip based on my history.'
      : 'Help me discover parks that fit my travel style.';
    setComposerDraft({ text: autoMessage, preserveExisting: true });
  }, [isPersonalized, isNewChat, providersLoaded, providers.length, isGenerating, messages.length, tripHistory.length]);

  useEffect(() => {
    if (!isPersonalized) {
      personalizedSentRef.current = false;
      personalizedInitRef.current = false;
    }
  }, [isPersonalized]);

  const handleSendMessage = async (messageText, options = {}) => {
    const { hiddenFromUi = false, dayByDayPlanIntake = false, intakeParkName = null, intakeParkNames = null } = options;
    if (!messageText.trim() || conversationSendBlocked({generating:isGenerating,recovering:historySyncBusy,recoveryPending:historyRecovery,restoreStatus:isAnonymous?anonymousRestoreStatus:authRestoreStatus})) return;
    logTrailieMessageSubmitted({
      messageLength: messageText.trim().length,
      turnIndex: messages.filter((message) => message.role === 'user' && !message.hiddenFromUi).length + 1,
    });

    primeCompletionSound?.();
    pendingParkImagesRef.current = [];

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

    // Local-only acceptance record. Opened after the provider guard so a turn is
    // only recorded when a request is actually about to be made.
    recordTrailieDemoSubmission({
      prompt: messageText.trim(),
      authenticated: isAuthenticated,
      tripId: currentTripIdRef.current || currentTripId || null,
    });

    // Abort any existing request
    abortControllerRef.current?.abort();
    // Stage 14.3 — the previous turn's coordinator must stop touching state.
    earlyCoordinatorRef.current?.dispose();
    earlyCoordinatorRef.current = null;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setProvisionalAnswer(null);
    setDraftPreview(null);
    setPreviewOutcome(null);
    controller.signal.addEventListener('abort', () => {
      if (abortControllerRef.current === controller) {
        setProvisionalAnswer(null);
        setDraftPreview(state => reduceDraftPreview(state, { type: 'draft_closed' }));
        if (draftPreviewEnabled()) setPreviewOutcome('uncertain');
      }
    }, { once: true });

    // Stage 14.8A.2 §5/§9 — one stable id per submission. The server uses it to
    // de-duplicate a retry or a second tab; the browser uses it to find and
    // clear this exact optimistic turn if the request fails.
    const clientTurnId = createGuestClientTurnId();

    // Add user message
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
      hiddenFromUi,
      clientTurnId,
      // Optimistic only: not history, not quota, and never mirrored until the
      // server reports a completed logical turn.
      ...(isAnonymous ? { isPending: true } : {}),
      ...(dayByDayPlanIntake ? { dayByDayPlanIntake: true } : {}),
    };

    if (isAnonymous) {
      recordGuestPendingTurn({ anonymousId, clientTurnId });
    }

    /**
     * Stage 14.8A.2 §9 — resolve the optimistic guest turn exactly once.
     *
     *   'completed' → clear the pending flag so the turn joins mirrored history
     *   'failed'    → visibly mark it failed, drop it from the mirror, free the
     *                 composer; a refresh can never show it as completed
     *
     * Either way the pending marker is removed, so no permanent spinner and no
     * stuck reservation can survive on the browser side.
     */
    const settleGuestOptimisticTurn = (status) => {
      if (!isAnonymous) return;
      clearGuestPendingTurn();
      setMessages((prev) =>
        status === 'failed'
          ? markGuestTurnFailed(prev, { clientTurnId })
          : prev.map((m) => (m.clientTurnId === clientTurnId ? { ...m, isPending: false } : m))
      );
    };

    setMessages(prev => [...prev, userMessage]);
    if (!hiddenFromUi) {
      userSentMessageRef.current = true; // flag for auto-scroll
    }
    setIsGenerating(true);
    setThinkingStartTime(Date.now());
    setThinkingMessage('Working on that…');
    setThinkingSources(null);
    activeStreamSourcesRef.current = null;
    sawServerStageRef.current = false;

    try {
      // Build context for AI
      const userContext = user ? await tripHistoryService.getAIContext(user.id) : null;
      
      const sessionContext = buildClientSessionContext(userContext, isPersonalized, messageText.trim());
      const activeCtx = activeTripContextRef.current;
      // P0-4: the entry context and request metadata may carry only
      // traveler-owned form values — never UI defaults.
      const travelerOwnedFormData = selectTravelerOwnedFormData(formData);
      let canonicalEntryContext = withEntryFormData(
        entryContext || { version: 1, source: existingTripId ? 'saved_trip' : 'direct', requestedDestinations: [], comparisonTargets: [] },
        travelerOwnedFormData,
        quickFillMessage && messageText.trim() === quickFillMessage.trim() ? 'quick_fill' : null
      );
      if (isPersonalized) canonicalEntryContext = withPersonalization(canonicalEntryContext, userContext);
      canonicalEntryContext = { ...canonicalEntryContext, activeTripContext: activeCtx || undefined };
      entryContextRef.current = canonicalEntryContext;

      const requestMetadata = {
        guestConversationId,
        tripId: currentTripIdRef.current && !currentTripIdRef.current.startsWith('temp-')
          ? currentTripIdRef.current : null,
        parkCode: formData.parkCode || activeCtx?.primaryDestination?.parkCode || null,
        parkName: parkName || activeCtx?.primaryDestination?.name || null,
        lat: formData.coordinates?.lat ?? activeCtx?.primaryDestination?.lat ?? undefined,
        lon: formData.coordinates?.lon ?? activeCtx?.primaryDestination?.lon ?? undefined,
        formData: travelerOwnedFormData,
        activeTripContext: activeCtx,
        entryContext: canonicalEntryContext,
        personalizedRecommendations: isPersonalized,
        aiContext: userContext || null,
        // Stage 8 — echo the currently-stored plan version so the server can
        // stamp a monotonic responseVersion and the persistence guard can reject
        // stale writes.
        priorResponseVersion: currentPlanRef.current?.responseVersion || 0,
        // IANA zone so Trailie reads "today" and relative dates on the traveler's
        // calendar; the server validates it and falls back when missing.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        ...(planningStateRef.current ? { planningState: planningStateRef.current } : {}),
        ...(dayByDayPlanIntake ? { dayByDayPlanIntake: true } : {}),
        ...(intakeParkName ? { intakeParkName, parkName: intakeParkName } : {}),
        ...(intakeParkNames?.length ? { intakeParkNames } : {}),
        ...(intentContext?.path
          ? {
              intentGuide: {
                path: intentContext.path,
                title: intentContext.title,
                searchQuery: intentContext.searchQuery,
                featuredParkCodes: intentContext.featuredParkCodes || [],
              },
            }
          : {}),
      };
      // Build conversation history — include image context so AI can
      // answer follow-up questions about the photos it shared
      //
      // Phase 6C — a transient RETRYABLE_FAILURE bubble ("I couldn't finish
      // that one.") is never real prior context: it is calm placeholder
      // copy, not something the model said, and a retry deliberately
      // removes it from `messages` for exactly this reason. Excluded here
      // too as a second, independent guard in case it is ever still present
      // (e.g. a different turn's failure earlier in the conversation).
      const conversationHistory = excludeTransientFailuresFromHistory(
        messages.filter(msg => msg.role !== 'system')
      )
        .map(msg => {
          let content = msg.content;
          if (msg.role === 'assistant' && msg.parkImages?.length > 0) {
            const imageDesc = msg.parkImages
              .map((img, i) => `[Photo ${i + 1}: ${img.altText || img.title || 'Park photo'}]`)
              .join(' ');
            content += `\n\n(Photos shown to user: ${imageDesc})`;
          }
          return {
            role: msg.role,
            content,
            ...(msg.intent ? { intent: msg.intent } : {}),
          };
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
      clearStreamIdleTimer();

      // ── Stage 14.3 — early frozen-itinerary delivery ────────────────────────
      // Authenticated streaming only, and only when typed events actually
      // arrive. Every other path (anonymous, non-streaming, legacy, flag off)
      // keeps the unchanged terminal `done` workflow below.
      const baseConversation = [...messages, userMessage];
      let persistedConversation = baseConversation;
      let legacyOwnsTerminal = false;
      let earlyCoordinator = null;

      /** The ONE canonical write used by every revision. Create or update. */
      const writeCanonicalRevision = async ({ conversation, plan, expectedPreviousRevision }) => {
        const persisted = sanitizeMessagesForPersistence(conversation);
        const summary = createTripSummary(persisted, plan);
        const tripId = currentTripIdRef.current;

        if (tripId && !tripId.startsWith('temp-')) {
          const res = await tripService.updateTrip(
            tripId,
            buildResponseSavePayload({
              conversation: persisted,
              summary,
              plan,
              expectedPreviousRevision,
            })
          );
          const pp = res?.planPersistence;
          // Stage 14.7F4B §1 — the OUTCOME decides, never the HTTP status. A
          // bounded 200 carrying `stale`/`conflict` is a failed write.
          if (!isPersistenceAccepted({ httpStatus: 200, planPersistence: pp })) {
            // Stale/conflict is NOT a successful save. Reconcile to the server's
            // stored identity; never auto-retry the same rejected write.
            if (pp?.storedIdentity) {
              setCurrentPlan((prev) => (prev ? { ...prev, ...pp.storedIdentity } : prev));
            }
            setSaveState(resolveSaveState({ planPersistence: pp }));
            return { ok: false, outcome: pp?.outcome || 'REJECTED' };
          }
          persistSessionToStorage(tripId, persisted, plan);
          setSaveState('saved');
          refreshTrips?.();
          return { ok: true, tripId };
        }

        // Stage 14.8H.1 §6 — the validated frozen plan owns the destination.
        // Stage 14.8H created a trip labelled `General Planning / null` while the
        // plan it was persisting in the same request said `Zion / zion`, because
        // this call read component state instead of the plan.
        const destination = resolveTripDestination({
          plan,
          contextParkName: parkName,
          contextParkCode: formData.parkCode,
        });

        const res = await tripService.createTrip({
          parkName: destination.parkName,
          parkCode: destination.parkCode,
          title: destination.title,
          formData: formData || {},
          conversation: persisted,
          summary,
          plan,
          provider: 'auto',
          status: 'active',
        });
        const newTripId = res.data?._id || res._id;
        // Set the ref immediately so a revision 2 racing behind this create can
        // never fall back to the local temp id and make a second trip.
        currentTripIdRef.current = newTripId;
        recordTrailieDemoTripId(newTripId);
        persistSessionToStorage(newTripId, persisted, plan);
        setSaveState('saved');
        refreshTrips?.();
        return { ok: true, tripId: newTripId };
      };

      if (!isAnonymous && isAuthenticated) {
        earlyCoordinator = createEarlyRevisionCoordinator({
          initialTripId: currentTripIdRef.current,

          persistRevision1: async (effect) => {
            persistedConversation = upsertItineraryTurn(baseConversation, effect);
            return writeCanonicalRevision({
              conversation: persistedConversation,
              plan: effect.canonicalPlan,
            });
          },

          persistRevision2: async (effect) => {
            persistedConversation = updateProseTurn(persistedConversation, effect);
            return writeCanonicalRevision({
              conversation: persistedConversation,
              plan: effect.canonicalPlan,
              expectedPreviousRevision: effect.expectedPreviousRevision,
            });
          },

          // Revision 1 never landed (or revision 2 is uncertain): `done` is a
          // complete, self-sufficient direct-terminal response.
          //
          // ITINERARY_ONLY success (`itinerary_only_complete`): revision 1 is
          // already durable. `response_finalized` may carry display-only text
          // without revision-1 identity stamps — rebuilding a same-version PUT
          // from that payload conflicts (`same_version_different_hash`) and
          // blocks clearing "Preparing trip notes…". Presentation settlement
          // must NO-OP persistence (Probe A Fix Pass #3B).
          persistTerminal: async (effect) => {
            const settled = resolveItineraryOnlyTerminalPersistence({
              reason: effect.reason,
              tripId: currentTripIdRef.current,
            });
            if (!settled.shouldWrite && effect.terminalDecision.ownership === 'itinerary_only') return settled.result;

            const done = effect.done || {};
            persistedConversation = applyTerminalOwnership(baseConversation, effect.terminalDecision);
            return writeCanonicalRevision({
              conversation: persistedConversation,
              plan: done.canonicalPlan,
            });
          },

          // Never entered the early lifecycle ⇒ the pre-Stage-14 path below runs
          // exactly as it does today, with exactly one terminal write.
          legacyTerminal: () => {
            legacyOwnsTerminal = true;
          },

          view: {
            setTripId: (tripId) => setCurrentTripId(tripId),
            revealItinerary: (effect) => {
              setCurrentPlan(effect.canonicalPlan);
              setMessages((prev) => upsertItineraryTurn(prev, effect));
              setIsGenerating(false);
              setThinkingStartTime(null);
            },
            revealProse: (effect) => {
              setCurrentPlan(effect.canonicalPlan);
              setMessages((prev) => updateProseTurn(prev, effect));
            },
            revealTerminal: (effect) => {
              const done = effect.done || {};
              if (done.canonicalPlan) setCurrentPlan(done.canonicalPlan);
              setMessages((prev) => applyTerminalOwnership(prev, effect.terminalDecision));
              setIsGenerating(false);
              setThinkingStartTime(null);
            },
            setPendingLabel: ({ responseId, label }) =>
              setMessages((prev) => applyPendingLabel(prev, { responseId, label })),
            onContractError: ({ code }) =>
              console.warn('[Trailie] early-delivery contract error:', code),
            onComplete: () => {
              setIsGenerating(false);
              setThinkingStartTime(null);
            },
          },
        });
        earlyCoordinatorRef.current = earlyCoordinator;
      }

      // Stage 14.3A — observation is NOT activation. `response_started` fires for
      // every turn, including ones that never produce an itinerary, so it must
      // change nothing here. Only a valid `itinerary_ready` (or a malformed one,
      // which fails closed) hands ownership to the coordinator.
      const earlyOwnsTurn = () => earlyCoordinator?.ownsTerminalPersistence() === true;
      const renderLegacyChunk = () =>
        earlyCoordinator ? earlyCoordinator.shouldRenderLegacyChunk() : true;
      const finalizeLegacyStream = () =>
        earlyCoordinator ? earlyCoordinator.shouldFinalizeLegacyStream() : true;

      const applyAnonymousSessionFromResult = (result) => {
        if (!isAnonymous || !result) return;
        if (result.anonymousId) setAnonymousId(result.anonymousId);
        if (result.messageCount !== undefined) setMessageCount(result.messageCount);
        if (result.canSendMore !== undefined) setCanSendMore(result.canSendMore);
        applyActiveTripContextFromResult(result);
        if (result.anonymousId) {
          saveAnonymousSession({
            anonymousId: result.anonymousId,
            messageCount: result.messageCount,
            canSendMore: result.canSendMore,
            activeTripContext: result.activeTripContext,
          });
        }
      };

      const markStreamFinalizing = () => {
        cancelStreamFlush();
        clearStreamIdleTimer();

        // Stage 14.3A — suppressed only once a valid `itinerary_ready` activated
        // early mode (or a malformed one faulted it). A structured-failure or
        // prose-only turn still finalizes its streamed prose exactly as today.
        if (!finalizeLegacyStream()) return;

        const displayContent = stripItineraryJsonForDisplay(rawStreamedContentRef.current);
        if (!displayContent.trim()) return;

        setIsGenerating(true);
        // Phase 6C — "Finishing your response..." implied completion was
        // imminent even when this fires purely because the stream went
        // quiet for STREAM_IDLE_MS (a guess, not a real signal — see
        // markStreamFinalizing's own doc). Truthful in both call contexts
        // (a genuine stream end, or the idle guess): still working, not
        // "about to hand you the answer".
        setThinkingMessage('Still working on that…');
        setThinkingSources(null);

        if (!streamStarted) {
          streamStarted = true;
          setMessages((prev) => [
            ...prev,
            {
              id: streamAssistantId,
              role: 'assistant',
              content: displayContent,
              timestamp: new Date(),
              provider: 'auto',
              isStreaming: false,
              isFinalizing: true,
              parkImages: pendingParkImagesRef.current || [],
            },
          ]);
          return;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamAssistantId
              ? {
                  ...m,
                  content: displayContent,
                  isStreaming: false,
                  isFinalizing: true,
                  parkImages: pendingParkImagesRef.current || m.parkImages || [],
                }
              : m
          )
        );
      };

      const scheduleStreamIdleCheck = () => {
        clearStreamIdleTimer();
        streamIdleTimerRef.current = window.setTimeout(() => {
          const target = messagesRef.current.find((m) => m.id === streamAssistantId);
          if (target?.isStreaming) {
            markStreamFinalizing();
          }
        }, STREAM_IDLE_MS);
      };

      const streamCallbacks = {
        onAnswerEvent: answerStreamEnabled() ? event => {
          if (abortControllerRef.current === controller && !controller.signal.aborted)
            setProvisionalAnswer(state => reduceAnswerStream(state, event));
        } : undefined,
        onDraftEvent: draftPreviewEnabled() ? event => {
          if (abortControllerRef.current === controller && !controller.signal.aborted)
            setDraftPreview(state => reduceDraftPreview(state, event));
        } : undefined,
        // Stage 14.3 — typed early events. Presence of these events (not any
        // client-side flag) is what activates the persist-before-reveal path.
        onEarlyEvent: (event) => {
          earlyCoordinator?.handleEvent(event);
        },
        // WP10F-2/3 — first-class presentation updates. The client normalizer
        // feeds this from BOTH dialects (legacy `thinking` display split out, and
        // the v2 `display_context` event), so mid-stream park imagery updates the
        // same pendingParkImagesRef without ever touching thinking sources/copy.
        onDisplayContext: (display) => {
          if (display?.parkImages?.length) {
            pendingParkImagesRef.current = display.parkImages;
          }
        },
        // REAL STAGES ARE AUTHORITATIVE.
        //
        // A stage is a state the server actually reached. Once one arrives it
        // owns the progress copy until the server reaches the next one — no
        // timer, and no evidence event, may overwrite it. Evidence still updates
        // the source list, because that is what evidence is.
        //
        // The source-derived copy below is kept only as the pre-stage fallback,
        // for turns and routes that report sources without ever reporting a
        // stage. Once `sawServerStageRef` is set it can no longer fire.
        onThinking: (thinkingData) => {
          const {
            sources,
            parkImages: thinkingImages,
            stage,
            refinementTarget,
          } = thinkingData;
          if (thinkingImages?.length) {
            pendingParkImagesRef.current = thinkingImages;
          }
          if (stage) {
            // An unknown stage is still a real transition; it just has no copy.
            // Leave the current message in place rather than falling back to a
            // less specific one — never move backwards.
            sawServerStageRef.current = true;
            const stageCopy = resolveThinkingStageCopy(stage, refinementTarget);
            if (stageCopy) setThinkingMessage(stageCopy);
            if (sources) {
              activeStreamSourcesRef.current = sources;
              setThinkingSources(sources);
            }
            return;
          }
          const src = sources || [];
          activeStreamSourcesRef.current = src;
          setThinkingSources(src);
          if (sawServerStageRef.current) return;
          if (!src.length) {
            setThinkingMessage('Thinking through your question…');
          } else if (src?.includes('web')) {
            setThinkingMessage('Searching live info...');
          } else if (src?.includes('nps') && src?.includes('weather')) {
            setThinkingMessage('Checking park info...');
          } else if (src?.includes('nps')) {
            setThinkingMessage('Checking park info...');
          } else if (src?.includes('weather')) {
            setThinkingMessage('Checking weather...');
          } else {
            setThinkingMessage('Combining trip details...');
          }
        },
        onChunk: (chunk) => {
          rawStreamedContentRef.current += chunk;

          const applyStreamContent = () => {
            streamFlushRafRef.current = null;
            if (!renderLegacyChunk()) return; // see markStreamFinalizing
            const displayContent = stripItineraryJsonForDisplay(rawStreamedContentRef.current);
            if (!displayContent.trim()) return;

            if (!streamStarted) {
              streamStarted = true;
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
                  m.id === streamAssistantId
                    ? { ...m, content: displayContent }
                    : m
                )
              );
            }
          };

          if (streamFlushRafRef.current == null) {
            streamFlushRafRef.current = requestAnimationFrame(applyStreamContent);
          }
          scheduleStreamIdleCheck();
        },
        // Phase 8D.4 — an internal generation attempt was rejected. Remove
        // only this turn's provisional assistant prose before the next attempt
        // streams; the user bubble, prior turns, itinerary lifecycle, active
        // trip state, and internal repair diagnostics all remain untouched.
        onContentReset: () => {
          cancelStreamFlush();
          clearStreamIdleTimer();
          rawStreamedContentRef.current = '';
          if (!streamStarted) return;
          streamStarted = false;
          setMessages((prev) => prev.filter((m) => m.id !== streamAssistantId));
        },
        onStreamEnd: () => {
          markStreamFinalizing();
        },
        onDone: (result) => {
          if (controller.signal.aborted || abortControllerRef.current !== controller) return;
          setProvisionalAnswer(null);
          if (draftPreviewEnabled() && abortControllerRef.current === controller && !controller.signal.aborted) {
            if (result.persisted === true && result.canonicalPlan?.days?.length) {
              setCurrentPlan(result.canonicalPlan);
              setDraftPreview(null);
              setPreviewOutcome(null);
            } else setDraftPreview(state => reduceDraftPreview(state, { type: 'draft_closed' }));
          }
          clearStreamIdleTimer();
          cancelStreamFlush();

          // Phase 8D.4.1 — terminal response content belongs to the accepted
          // attempt and is authoritative even when the transport marks it as
          // unchanged. The local buffer is only a fallback for legacy terminals
          // that genuinely omit content.
          if (result.artifactStatus?.status === 'save_failed') {
            console.warn('Trailie trip save failed', { responseId: result.responseId, code: result.artifactStatus.code, phase: 'trip_save' });
          }
          const resolvedContent = typeof result.content === 'string'
            ? result.content
            : stripItineraryJsonForDisplay(rawStreamedContentRef.current);

          data = {
            persisted: result.persisted === true,
            tripId: result.tripId || null,
            content: resolvedContent,
            contentUnchanged: result.contentUnchanged === true,
            // Stage 8 — canonical response identity + the plan to persist verbatim.
            canonicalPlan: result.canonicalPlan || null,
            travelLogistics: result.travelLogistics || null,
            artifactStatus: result.artifactStatus || null,
            responseArtifacts: result.responseArtifacts || null,
            intent: result.intent || null,
            presentation: result.presentation || null,
            planningState: result.planningState || null,
            responseId: result.responseId || null,
            responseVersion: result.responseVersion || null,
            responseRevision: result.responseRevision || null,
            contentHash: result.contentHash || null,
            itineraryHash: result.itineraryHash || null,
            provider: result.provider,
            model: result.model,
            hasLiveData: result.hasLiveData,
            hasWebSearch: result.hasWebSearch,
            parkName: result.parkName,
            parkNames: result.parkNames || (result.parkName ? [result.parkName] : []),
            hasItinerary: result.hasItinerary || false,
            itineraryData: result.itineraryData || result.itinerary || null,
            parkImages: result.parkImages || [],
            anonymousId: result.anonymousId,
            messageCount: result.messageCount,
            canSendMore: result.canSendMore,
            isConversionMessage: result.isConversionMessage,
            activeTripContext: result.activeTripContext,
            // WP-TU Phase 3 Task 8 — the authoritative active-trip destination
            // for THIS turn (Task 7B). Threaded the same way parkName/
            // activeTripContext already are, so the header can read it off
            // the persisted message instead of the sticky selectedParkName.
            activeTripPresentation: result.activeTripPresentation || null,
            // WP-TU Phase 4 Task 10 — same additive-field pattern as
            // activeTripPresentation (Task 7B) immediately above.
            targetTripId: result.targetTripId || null,
            // Historical-plan refinements use this only to mount the target's
            // revised itinerary in the current assistant turn. Active-plan
            // persistence continues to read canonicalPlan exclusively.
            targetPlanMutation: result.targetPlanMutation || null,
            // Phase 6A — was silently dropped here before: the non-stream
            // path already carries this field straight through, but this
            // reconstruction is what the streaming path's `data` becomes, so
            // classifyTrailieTurnOutcome had nothing to read on that path
            // without this. Display classification only — no behavior here.
            trailieV2: result.trailieV2 || null,
          };
          applyAnonymousSessionFromResult(result);

          // Stage 14.3 — `done` is terminal reconciliation, not a second
          // response. When the turn entered the early lifecycle the coordinator
          // decides whether it needs a write at all; when it did not, the
          // coordinator hands straight back to the unchanged path below.
          // Force `type: 'done'` AFTER spreading the transport payload — v2
          // terminals arrive as `response_finalized` and would otherwise
          // overwrite the lifecycle type, dropping terminal reveal.
          if (earlyCoordinator) {
            earlyCoordinator.handleEvent({
              ...result,
              type: 'done',
              canonicalPlan:
                result.canonicalPlan
                || result.itineraryData
                || result.itinerary
                || null,
            });
            if (!legacyOwnsTerminal) return;
          }

          if (result.isConversionMessage || !streamStarted) {
            return;
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamAssistantId
                ? {
                    ...m,
                    content: resolvedContent,
                    // Stage 8.1 — stamp the canonical response identity onto the
                    // assistant message so it is persisted/guarded as one unit
                    // with the plan (never conversation v3 beside plan v4).
                    responseId: result.responseId || null,
                    responseVersion: result.responseVersion || null,
                    responseRevision: result.responseRevision || null,
                    contentHash: result.contentHash || null,
                    itineraryHash: result.itineraryHash || null,
                    provider: result.provider,
                    model: result.model,
                    isStreaming: false,
                    isFinalizing: false,
                    hasLiveData: result.hasLiveData,
                    hasWebSearch: result.hasWebSearch,
                    parkName: result.parkName,
                    parkNames: result.parkNames || (result.parkName ? [result.parkName] : []),
                    hasItinerary: result.hasItinerary || false,
                    // Legacy dialect (and v2 terminal fallback): mount the card
                    // from the terminal plan when early itinerary_ready never
                    // revealed one.
                    ...(
                      (result.canonicalPlan || result.itineraryData || result.itinerary)?.days?.length
                        ? {
                            itineraryPlan:
                              result.canonicalPlan
                              || result.itineraryData
                              || result.itinerary,
                            canonicalPlan:
                              result.canonicalPlan
                              || result.itineraryData
                              || result.itinerary,
                          }
                        : {}
                    ),
                    ...(result.travelLogistics ? { travelLogistics: result.travelLogistics } : {}),
                    ...(result.artifactStatus ? { artifactStatus: result.artifactStatus } : {}),
                    ...(result.responseArtifacts ? { responseArtifacts: result.responseArtifacts } : {}),
                    ...(result.intent ? { intent: result.intent } : {}),
                    ...(result.presentation ? { presentation: result.presentation } : {}),
                    activeTripPresentation: result.activeTripPresentation || null,
                    // WP-TU Phase 4 Task 10 — same additive-field pattern as
                    // activeTripPresentation (Task 7B) immediately above.
                    targetTripId: result.targetTripId || null,
                    parkImages: result.parkImages || [],
                  }
                : m
            )
          );
        },
        onError: (err) => {
          // The terminal catch owns reporting; do not log this SSE event twice.
          clearStreamIdleTimer();
          markStreamFinalizing();
        },
        onClose: ({ sawStreamEnd, sawDone }) => {
          clearStreamIdleTimer();
          // The socket closed with no terminal `done`. A durable revision 1 stays
          // visible and recoverable; nothing partial is shown.
          if (!sawDone) earlyCoordinator?.handleEvent({ type: 'stream_aborted' });
          if (!sawStreamEnd && rawStreamedContentRef.current.trim()) {
            markStreamFinalizing();
          }
          if (!sawDone && !data && !earlyOwnsTurn() && rawStreamedContentRef.current.trim()) {
            data = {
              content: stripItineraryJsonForDisplay(rawStreamedContentRef.current),
              contentUnchanged: true,
              provider: 'auto',
              parkImages: pendingParkImagesRef.current || [],
            };
          }
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
            clientTurnId,
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
        if (streamErr.name === 'AbortError' || streamErr.noAutomaticRetry || draftPreviewEnabled()) throw streamErr;
        console.error('Streaming failed, falling back to non-streaming:', streamErr.message);
      } finally {
        clearStreamIdleTimer();
        cancelStreamFlush();
      }

      // Stage 14.3 §8 — for a turn that entered the typed-event lifecycle, ALL
      // persistence decisions belong to the coordinator. The legacy terminal
      // path and autoSaveConversation must not also run, or the turn would be
      // written twice and the assistant message appended twice.
      if (earlyCoordinator) {
        await earlyCoordinator.drain();
        if (earlyOwnsTurn()) {
          logAIChat(messageText.trim(), Date.now() - thinkingStartTime, true, { hasItinerary: Boolean(data?.plan?.days?.length) });
          setIsGenerating(false);
          setThinkingStartTime(null);
          setThinkingSources(null);
          activeStreamSourcesRef.current = null;
          playCompletionSound?.();
          return data;
        }
      }

      if (!data) {
        if (streamStarted) {
          const fallbackContent = stripItineraryJsonForDisplay(rawStreamedContentRef.current);
          if (fallbackContent.trim()) {
            data = {
              content: fallbackContent,
              contentUnchanged: true,
              provider: 'auto',
              parkImages: pendingParkImagesRef.current || [],
            };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamAssistantId
                  ? { ...m, content: fallbackContent, isStreaming: false, isFinalizing: false }
                  : m
              )
            );
          } else {
            setMessages((prev) => prev.filter((m) => m.id !== streamAssistantId));
          }
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
            clientTurnId,
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

        // The sixth attempt was blocked before admission — it is not a
        // completed turn and must not be mirrored as one.
        settleGuestOptimisticTurn('failed');
        setMessages(prev => [...prev, assistantMessage]);
        setIsGenerating(false);
        setThinkingStartTime(null);
        if (data.content) playCompletionSound?.();
        return; // Don't continue with normal processing
      }

      // Add AI response
      const responseTime = Date.now() - thinkingStartTime;

      applyActiveTripContextFromResult(data);

      // Phase 6A — display classification only. Does not gate persistence,
      // history mirroring, or quota accounting below (all unchanged, exactly
      // as before) — used only to stash `outcomeClass` on the rendered
      // message and to withhold the completion sound for a genuine failure,
      // so a retryable failure at least stops celebrating itself.
      const outcomeClass = classifyTrailieTurnOutcome(data);
      // Phase 6A.1 — what actually gets RENDERED this turn. `assistantMessageForSave`
      // below (persistence) deliberately keeps the original `data.content` —
      // this only changes what appears in the live chat state.
      const displayContent = resolveTrailieTurnDisplayContent({ content: data.content, outcomeClass });

      // Build the assistant message for saving DIRECTLY
      const usedStreaming = streamStarted && !data.isConversionMessage;
      const assistantMessageId = usedStreaming ? streamAssistantId : Date.now() + 1;

      // WP-TU Phase 4 Task 10D — display-only fallback (extracted to
      // `selectTerminalPlanForDisplay` for direct unit testing). This is READ
      // ONLY: it feeds the in-chat bubble below, never `setCurrentPlan` (the
      // active trip's own plan panel state), which continues to read
      // `data.canonicalPlan` via `selectPlanToPersist`, completely unchanged.
      const terminalPlan = selectTerminalPlanForDisplay({ data });

      if (data.planningState) {
        planningStateRef.current = data.planningState;
      }

      const assistantMessageForSave = {
        id: assistantMessageId,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        // Stage 8.1 — canonical response identity travels WITH the persisted
        // assistant message so the server accepts/rejects it atomically with the
        // plan (never conversation v3 beside plan v4).
        responseId: data.responseId || null,
        responseVersion: data.responseVersion || null,
        responseRevision: data.responseRevision || null,
        contentHash: data.contentHash || null,
        itineraryHash: data.itineraryHash || null,
        provider: data.provider,
        model: data.model,
        responseTime,
        isStreaming: false,
        hasLiveData: data.hasLiveData,
        hasWebSearch: data.hasWebSearch,
        parkName: data.parkName,
        parkNames: data.parkNames || (data.parkName ? [data.parkName] : []),
        hasItinerary: data.hasItinerary || false,
        ...(terminalPlan?.days?.length ? { itineraryPlan: terminalPlan, canonicalPlan: terminalPlan } : {}),
        ...(data.travelLogistics ? { travelLogistics: data.travelLogistics } : {}),
        ...(data.artifactStatus ? { artifactStatus: data.artifactStatus } : {}),
        ...(data.responseArtifacts ? { responseArtifacts: data.responseArtifacts } : {}),
        ...(data.intent ? { intent: data.intent } : {}),
        ...(data.presentation ? { presentation: data.presentation } : {}),
        activeTripPresentation: data.activeTripPresentation || null,
        // WP-TU Phase 4 Task 10 — same additive-field pattern as
        // activeTripPresentation (Task 7B) immediately above.
        targetTripId: data.targetTripId || null,
        parkImages: data.parkImages || [],
        // Phase 6A — display-only classification, stashed for future use;
        // never rendered as a raw string anywhere (see trailieTurnOutcome.js).
        outcomeClass,
      };

      // `messages` from closure = pre-send messages; userMessage was defined above
      const updatedMessagesForSave = [...messages, userMessage, assistantMessageForSave];

      // Still update React state for the UI (adds responseTime, clears isStreaming)
      setMessages(prev => {
        if (usedStreaming) {
          return prev.map(msg =>
            msg.id === streamAssistantId
              ? {
                  ...msg,
                  responseTime,
                  isStreaming: false,
                  isFinalizing: false,
                  // Phase 8D.4.1 — terminal content is the accepted attempt's
                  // authority. Reconcile exactly instead of trusting any
                  // provisional browser accumulator left by streamed deltas.
                  content: displayContent,
                  hasLiveData: data.hasLiveData,
                  hasWebSearch: data.hasWebSearch,
                  parkName: data.parkName,
                  parkNames: data.parkNames || (data.parkName ? [data.parkName] : []),
                  hasItinerary: data.hasItinerary || false,
                  ...(terminalPlan?.days?.length && !msg.itineraryPlan
                    ? { itineraryPlan: terminalPlan, canonicalPlan: terminalPlan }
                    : {}),
                  ...(data.travelLogistics ? { travelLogistics: data.travelLogistics } : {}),
                  ...(data.artifactStatus ? { artifactStatus: data.artifactStatus } : {}),
        ...(data.responseArtifacts ? { responseArtifacts: data.responseArtifacts } : {}),
                  ...(data.intent ? { intent: data.intent } : {}),
                  ...(data.presentation ? { presentation: data.presentation } : {}),
                  activeTripPresentation: data.activeTripPresentation || null,
                  // WP-TU Phase 4 Task 10 — same additive-field pattern as
                  // activeTripPresentation (Task 7B) immediately above.
                  targetTripId: data.targetTripId || null,
                  parkImages: data.parkImages || [],
                  // Phase 6A — display-only classification, stashed for
                  // future use; never rendered as a raw string (see
                  // trailieTurnOutcome.js).
                  outcomeClass,
                }
              : msg
          );
        }

        return [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            // Phase 6A.1 — a genuine failure renders calm generic copy here;
            // everything else renders data.content exactly as before.
            content: displayContent,
            timestamp: new Date(),
            provider: data.provider,
            model: data.model,
            responseTime,
            hasLiveData: data.hasLiveData,
            hasWebSearch: data.hasWebSearch,
            parkName: data.parkName,
            parkNames: data.parkNames || (data.parkName ? [data.parkName] : []),
            hasItinerary: data.hasItinerary || false,
            ...(terminalPlan?.days?.length ? { itineraryPlan: terminalPlan, canonicalPlan: terminalPlan } : {}),
            ...(data.travelLogistics ? { travelLogistics: data.travelLogistics } : {}),
            ...(data.artifactStatus ? { artifactStatus: data.artifactStatus } : {}),
        ...(data.responseArtifacts ? { responseArtifacts: data.responseArtifacts } : {}),
            ...(data.intent ? { intent: data.intent } : {}),
            ...(data.presentation ? { presentation: data.presentation } : {}),
            activeTripPresentation: data.activeTripPresentation || null,
            // WP-TU Phase 4 Task 10 — same additive-field pattern as
            // activeTripPresentation (Task 7B) immediately above.
            targetTripId: data.targetTripId || null,
            parkImages: data.parkImages || [],
            // Phase 6A — display-only classification, stashed for future
            // use; never rendered as a raw string (see trailieTurnOutcome.js).
            outcomeClass,
          }
        ];
      });

      // Stage 8 — the server owns canonical response creation. Persist the
      // server-built canonicalPlan VERBATIM; never rebuild it from streamed
      // content or itineraryData on the client (that caused F-PERSIST-1 drift).
      const planForSave = selectPlanToPersist({ data, currentPlan });
      if (planForSave && planForSave !== currentPlan) {
        setCurrentPlan(planForSave);
      }

      // Auto-save conversation to history after at least one user message + AI
      // reply — and, when this turn also produced a cross-plan (historical)
      // mutation, persist that to ITS OWN trip afterward.
      //
      // WP-TU Phase 4 Task 10E — ORDERING IS ENFORCED, not assumed: the
      // target-plan (Redwood) save's ownership proof is a real, durably-
      // persisted assistant message the active-trip save just wrote — the
      // assistant message carries `responseId: data.responseId` and
      // `targetTripId: data.targetTripId` (Task 10, unchanged). Firing both
      // saves as an unordered race would let the target save's provenance
      // check run before that message durably exists server-side, which is
      // not a real guarantee even when it happens to pass. Extracted to
      // `runOrderedCrossPlanPersistence` (persistCanonicalPlan.js) so this
      // ordering is directly unit-testable, not just an inline happy path.
      // Phase 6C.1 — the smallest persistence seam: a server-resolved
      // RETRYABLE_FAILURE exchange must be transient, never durably written
      // into TripPlan.conversation (the Phase 6C precheck finding this
      // phase closes). `autoSaveConversation` bundles the conversation
      // array AND the canonical plan into one atomic response-coupled
      // write (see its own doc), so withholding it here for exactly this
      // one outcome class also leaves the canonical plan byte-identical and
      // its responseVersion unadvanced, and (since `persistTargetPlanMutation`
      // below only fires when this save reports success) skips any
      // cross-plan mutation too — no extra seam needed. Extracted to
      // `shouldSaveConversationForTurn` (persistCanonicalPlan.js) so this
      // exact decision is directly unit-testable with a forced
      // `status: 'failed'` payload, not just an inline condition inside the
      // untestable-in-isolation component.
      const hasUserMessagesToSave = shouldSaveConversationForTurn({
        outcomeClass,
        hasUserMessages: conversationHasUserMessages(updatedMessagesForSave),
      });
      await runOrderedCrossPlanPersistence({
        data,
        hasUserMessagesToSave,
        autoSaveConversation: () => autoSaveConversation(updatedMessagesForSave, planForSave),
        persistTargetPlanMutation,
        currentTripId,
      });
      if (data.persisted === true && data.tripId) {
        currentTripIdRef.current = data.tripId;
        setCurrentTripId(data.tripId);
        persistSessionToStorage(data.tripId, updatedMessagesForSave, planForSave);
        setSaveState('saved');
        refreshTrips?.();
      }

      // Track AI chat interaction
      logAIChat(messageText.trim(), responseTime, true, { hasItinerary: Boolean(data?.plan?.days?.length) });

      // Phase 6A.1 — the server's own guest ledger (anonymousTurnLedger.js's
      // failGuestTurn, called from routes/ai.js for EVERY
      // `trailieV2.status !== 'complete'`) never writes ANY non-complete
      // turn into AnonymousSession.messages and never consumes quota for
      // it — including plan_target_unresolved, which Part 1's
      // classifyTrailieTurnOutcome still correctly DISPLAYS as an ordinary
      // conversation_outcome message. Display and ledger truth are
      // different questions on purpose (see wasGuestTurnConsumedByServer's
      // own doc) — the guest-only localStorage mirror must follow the
      // ledger, or a refresh could resurrect a turn the server itself never
      // recorded. Reuses the EXISTING 'failed' path (guestTurnFailed —
      // already excluded by the existing mirror filter) rather than adding
      // a new mechanism.
      settleGuestOptimisticTurn(wasGuestTurnConsumedByServer(data) ? 'completed' : 'failed');

      setIsGenerating(false);
      setThinkingStartTime(null);
      setThinkingSources(null);
      activeStreamSourcesRef.current = null;
      // Phase 6A — a genuine generation failure must not play the same
      // positive-reinforcement cue as a real success. Everything else on
      // this turn (persistence, quota, history) is unchanged.
      if (data?.content && outcomeClass !== TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE) playCompletionSound?.();
      return data;

    } catch (error) {
      if (draftPreviewEnabled() && abortControllerRef.current === controller) {
        setPreviewOutcome(error.serverResolvedFailure && error.code === 'mutation_rejected' ? 'rejected' : 'uncertain');
      }
      // Log detailed error information for debugging
      console.error('Trailie request failed', {
        responseId: error.responseId || null,
        phase: error.phase || 'reply',
        message: error.serverResolvedFailure ? undefined : error.message,
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
        settleGuestOptimisticTurn('failed');
        setIsGenerating(false);
        return;
      }

      // Stage 14.8A.2 §9 — bounded failure handling. The optimistic turn is
      // marked failed and dropped from the mirror, and the composer is freed.
      // The server consumed no allowance for it, so a retry is admissible.
      settleGuestOptimisticTurn('failed');
      
      // Track failed AI chat interaction
      const failedResponseTime = Date.now() - thinkingStartTime;
      logAIChat(messageText.trim(), failedResponseTime, false);
      
      // Extract error details from response
      const errorDetails = error.response?.data;
      const errorStatus = error.response?.status;
      
      // Check if it's a token limit error
      let errorMessage = 'Could not get a reply';
      let assistantMessage = 'I couldn\'t get that just now. Please try again.';
      // Phase 6C — only set for a genuine client-only connection loss (see
      // isUncertainConnectionLossError). Carried onto the inserted message
      // so the render layer knows this is uncertain_outcome, not a
      // server-resolved failure — no Retry action is ever attached to it.
      let messageOutcomeClass = null;

      if (errorStatus === 429) {
        if (errorDetails?.error === 'Daily token limit exceeded') {
          errorMessage = 'Daily usage limit reached. Please try again tomorrow.';
          assistantMessage = `**Daily Limit Reached**\n\nYou've reached your daily usage limit. Please try again tomorrow.`;
        } else {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          assistantMessage = '⏳ **Rate Limited**\n\nYou\'re making requests too quickly. Please wait a moment and try again.';
        }
      } else if (errorStatus === 400) {
        errorMessage = 'Could not complete that';
        assistantMessage = 'I couldn\'t complete that. Please try again.';
      } else if (errorStatus === 401 || errorStatus === 403) {
        const errMsg = errorDetails?.error || error.message || '';
        if (errMsg.includes('Not authorized') || errMsg.includes('token') || errMsg.includes('expired') || errMsg.includes('log in')) {
          errorMessage = 'Session expired';
          assistantMessage = `**Session Expired**\n\nYour login session has expired. Please refresh the page and log in again to continue chatting.`;
        } else {
          errorMessage = 'Could not complete that';
          assistantMessage = 'I couldn\'t complete that. Please try again.';
        }
      } else if (errorStatus === 500 || errorStatus === 503) {
        errorMessage = 'Something went wrong';
        assistantMessage = 'Something went wrong on my side. Please try again in a moment.';
      } else if (error.serverResolvedFailure) {
        errorMessage = 'Could not get a reply';
        assistantMessage = error.message;
      } else if (isUncertainConnectionLossError(error)) {
        // Phase 6C — a genuine client-only connection loss (no response at
        // all, including a client-side timeout). Per the lost-response
        // race (Phase 6B.1) the server may have already resolved this turn
        // fine after the browser stopped listening, so this is honestly
        // uncertain_outcome, never a claim that it failed — and never
        // offered a Retry action (see canRetryTrailieTurn).
        errorMessage = 'Connection interrupted';
        assistantMessage = UNCERTAIN_CONNECTION_LOSS_MESSAGE;
        messageOutcomeClass = TRAILIE_TURN_OUTCOME.UNCERTAIN_OUTCOME;
      }

      // Stage 14.8A.2 §11 — bounded guest refusal codes take precedence over the
      // generic copy above: these consumed no allowance and are retryable.
      const guestRefusalCode = errorDetails?.error;
      if (guestRefusalCode === GUEST_TURN_REFUSAL_CODES.IN_PROGRESS) {
        errorMessage = 'Still working on your last message';
        assistantMessage = '**One at a time**\n\nYour previous message is still being answered. It will appear here in a moment.';
      } else if (
        guestRefusalCode === GUEST_TURN_REFUSAL_CODES.FAILED ||
        guestRefusalCode === GUEST_TURN_REFUSAL_CODES.ABANDONED
      ) {
        errorMessage = 'That message did not go through';
        assistantMessage = "**Didn't go through**\n\nThat message wasn't completed, so it didn't use one of your free messages. Please try again.";
      }
      
      showToast(errorMessage, 'error');
      
      // Keep the user message and show error response
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date(),
        ...(messageOutcomeClass ? { outcomeClass: messageOutcomeClass } : {}),
      }]);
      setIsGenerating(false);
      setThinkingStartTime(null);
    }
  };

  /**
   * Phase 6C / 6C.1 — the ONE explicit retry action, now for both guest and
   * authenticated known failures. `resolveTrailieRetryPlan`
   * (trailieTurnOutcome.js) owns the actual decision — server-resolved
   * `retryable_failure` only — so it is directly unit-testable with no
   * React involved; this is just the thin effect wrapper.
   *
   * - No duplicate visible user bubble: the ORIGINAL user message stays
   *   exactly where it is; the fresh attempt's own user message is added
   *   with `hiddenFromUi: true` (the same existing mechanism the itinerary
   *   day-by-day intake flow already uses) purely for its own bookkeeping
   *   (a fresh clientTurnId/isPending tracking for a guest) — never
   *   rendered twice.
   * - The transient failure bubble is removed from `messages` before
   *   resending, so it can never be sent as history to the new attempt
   *   (conversationHistory / excludeTransientFailuresFromHistory also
   *   independently filters it as a second guard).
   * - `handleSendMessage` itself already no-ops while `isGenerating`. Every
   *   call mints a fresh guest `clientTurnId` unconditionally, and the
   *   server independently mints its own fresh `responseId` for every
   *   request-response cycle regardless of auth state — retry gets a
   *   genuinely fresh attempt identity on both paths for free, with no new
   *   idempotency/ledger machinery.
   * - Phase 6C.1 closed the authenticated persistence gap this action used
   *   to be withheld for (see `hasUserMessagesToSave` above, and
   *   `canRetryTrailieTurn`'s doc) — a technical failure never reaches
   *   `autoSaveConversation` for either audience, so retrying never
   *   compounds an already-durably-saved failed exchange.
   */
  const handleRetryFailedTurn = (failedMessageId) => {
    if (isGenerating) return;
    const plan = resolveTrailieRetryPlan({
      messages: messagesRef.current || [],
      failedMessageId,
    });
    if (!plan) return;

    setMessages((prev) => prev.filter((m) => m.id !== plan.removeMessageId));
    handleSendMessage(plan.resendText, { hiddenFromUi: true });
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
  const buildClientSessionContext = (userContext, isPersonalizedMode = false, latestUserMessage = '') => {
    // P0-4: only traveler-owned form values may be presented as trip details.
    // UI defaults (groupSize, budget tier, accommodation) are not statements;
    // constraints parsed from the message itself are, and are layered on top.
    const effectiveForm = applyMessageConstraintOverrides(
      selectTravelerOwnedFormData(formData) || {},
      latestUserMessage
    );
    const days = (() => {
      if (effectiveForm.startDate && effectiveForm.endDate) {
        const start = new Date(effectiveForm.startDate);
        const end = new Date(effectiveForm.endDate);
        const ms = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
        return Math.max(1, Math.floor(ms / 86400000) + 1);
      }
      return effectiveForm.numDays || effectiveForm.days || null;
    })();

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    const currentSeason = getCurrentSeason(currentMonth);

    const fromCompareContext = fromCompare && parkName;
    const fromIntentContext = intentContext?.path;
    const tripFocus = suggestText
      ? `a multi-park road trip to ${suggestText}`
      : parkName
        ? `a trip to ${parkName}`
        : fromIntentContext
          ? `a trip based on the "${intentContext.title}" guide`
          : 'a US outdoor trip';

    let prompt = `You are helping plan ${tripFocus}.${fromIntentContext
      ? formatIntentGuideContextForPrompt(intentContext)
      : suggestText
        ? `

ROAD TRIP CONTEXT:
This user came from the compare page wanting to plan a road trip visiting: ${suggestText}. Focus on that multi-park itinerary when they ask about "the road trip" or planning.`
        : fromCompareContext
          ? `

COMPARE CONTEXT:
This user compared parks side-by-side on TrailVerse and chose ${parkName} to plan. They may reference why they picked it over alternatives — focus on planning this park, not re-running the comparison unless they ask.`
          : ''}

CURRENT CONTEXT:
- Today's date: ${currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Current month: ${currentMonth} (${getMonthName(currentMonth)})
- Current season: ${currentSeason}
- Current year: ${currentYear}

TRIP DETAILS:
${[
  `- ${suggestText ? `Destinations: ${suggestText}` : parkName ? `Park: ${parkName}` : fromIntentContext ? `Trip style: ${intentContext.title} (${intentContext.searchQuery})` : 'Destination: not specified yet'}`,
  ...(Number.isFinite(days) && days > 0 ? [`- Duration: ${days} days`] : []),
  ...(effectiveForm.startDate && effectiveForm.endDate ? [`- Dates: ${effectiveForm.startDate} to ${effectiveForm.endDate}`] : []),
  ...(effectiveForm.groupSize ? [`- Group: ${effectiveForm.groupSize} people`] : []),
  ...(effectiveForm.budget ? [`- Budget: ${effectiveForm.budget}`] : []),
  ...(effectiveForm.fitnessLevel ? [`- Fitness: ${effectiveForm.fitnessLevel}`] : []),
  ...((effectiveForm.interests || []).length ? [`- Interests: ${effectiveForm.interests.join(', ')}`] : []),
  ...(effectiveForm.accommodation ? [`- Accommodation: ${effectiveForm.accommodation}`] : []),
].join('\n')}`;

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
    if (draftPreviewEnabled() || answerStreamEnabled()) abortControllerRef.current?.abort();
    // Set flag to prevent restoration
    setIsStartingFresh(true);
    
    // Clear current conversation state
    setMessages([]);
    setCurrentTripId(null);
    setHasShownWelcome(false);
    setCurrentPlan(null);
    setDraftPreview(null);
    setPreviewOutcome(null);
    
    // Clear any saved session state
    localStorage.removeItem('planai-chat-state');

    if (customMessage) {
      showWelcomeMessage();
      setComposerDraft({ text: customMessage });
    } else {
      const content = resolvePlanAiWelcomeMessage({
        entryMode,
        user,
        parkName,
        suggestText,
        intentContext,
        isPersonalized,
        isNewChat,
        fromCompare,
      });
      setMessages([
        createUiWelcomeMessage({
          id: Date.now(),
          content,
          timestamp: new Date(),
        }),
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

  // One native gate for guests. The trip already exists; sign-in migrates the
  // same conversation and lands on the requested workspace — no regeneration.
  const openGuestAuthGate = ({ reason, mode = 'signup', surface = null }) => {
    setSaveModalReason(reason);
    setSaveModalMode(mode);
    setSaveModalSurface(surface);
    setShowSaveModal(true);
  };
  const guestLimitReason = () => (guestTrip
    ? SIGNUP_PROMPT_REASONS.LIMIT_WITH_TRIP
    : SIGNUP_PROMPT_REASONS.LIMIT_WITHOUT_TRIP);

  const handleOpenArtifact = (surface) => {
    if (isAnonymous || !isAuthenticated) {
      openGuestAuthGate({ reason: SIGNUP_PROMPT_REASONS.OPEN_TRIP, surface: surface || 'itinerary' });
      return;
    }
    const tripId = currentTripIdRef.current || currentTripId;
    if (tripId && !tripId.startsWith('temp-')) router.push(tripSurfacePath(tripId, surface));
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
    const text = `I planned my ${parkLabel} trip with Trailie 🏔️\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Social caption copied!', 'success');
    } catch {
      showToast('Could not copy', 'error');
    }
  };

  /** A real, persisted trip — recovery targets a stored response, never a temp id. */
  const isTripSaved = Boolean(currentTripId && !String(currentTripId).startsWith('temp-'));

  /**
   * Stage 14.5 — explicit, owner-initiated prose recovery. This is the ONLY way
   * prose is ever generated for a stored revision 1: nothing starts on reload,
   * on disconnect, or in the background.
   */
  const handleGenerateTripNotes = async (message) => {
    if (!isTripSaved || !message?.responseId || recoveringResponseId) return;

    setRecoveringResponseId(message.responseId);
    setRecoveryNotice(null);
    try {
      const { runProseRecoveryStream } = await import('@/services/proseRecoveryService');
      const result = await runProseRecoveryStream({
        tripId: currentTripId,
        message,
        plan: message.itineraryPlan,
        onRevealProse: (effect) => setMessages((prev) => updateProseTurn(prev, effect)),
        onPlan: (plan) => setCurrentPlan(plan),
        persistRevision2: async (effect) =>
          writeCanonicalRevisionForRecovery({ effect, tripId: currentTripId }),
      });
      if (result?.notice) {
        setRecoveryNotice({ responseId: message.responseId, message: result.notice });
      }
    } catch (err) {
      console.warn('[Trailie] prose recovery failed:', err?.message);
      setRecoveryNotice({ responseId: message.responseId, message: RECOVERY_MESSAGE.FAILED });
    } finally {
      setRecoveringResponseId(null);
    }
  };

  /** Revision-2 write for recovery — the SAME canonical writer, never a new trip. */
  const writeCanonicalRevisionForRecovery = async ({ effect, tripId }) => {
    const persisted = sanitizeMessagesForPersistence(
      updateProseTurn(messagesRef.current, effect)
    );
    const res = await tripService.updateTrip(
      tripId,
      buildResponseSavePayload({
        conversation: persisted,
        summary: createTripSummary(persisted, effect.canonicalPlan),
        plan: effect.canonicalPlan,
        expectedPreviousRevision: effect.expectedPreviousRevision,
        entryContext: entryContextRef.current,
      })
    );
    const pp = res?.planPersistence;
    if (pp && pp.success === false) {
      setSaveState(resolveSaveState({ planPersistence: pp }));
      return { ok: false, outcome: pp.outcome };
    }
    setSaveState('saved');
    refreshTrips?.();
    return { ok: true, tripId };
  };

  // WP-TU Phase 4 Task 10E — return value is now load-bearing, not just a
  // side-effecting fire-and-forget: the completed-turn handler must know
  // whether the Badlands conversation save DURABLY succeeded before it may
  // fire the target-plan (Redwood) save, whose ownership proof depends on
  // that assistant message actually being persisted. `true` only on a
  // genuine accepted write (or the equivalent new-trip create); `false` on
  // every early-return, rejected write, and network failure. Every existing
  // caller that ignores the return value is completely unaffected.
  const autoSaveConversation = async (messagesToSave, planOverride = null) => {
    if (!user || !isAuthenticated || !conversationHasUserMessages(messagesToSave)) return false;

    const persistedMessages = sanitizeMessagesForPersistence(messagesToSave);
    if (!conversationHasUserMessages(persistedMessages)) return false;

    const planToSave = planOverride || currentPlan;

    // Prevent duplicate trip creation from concurrent calls
    if (savingInProgressRef.current && (!currentTripId || currentTripId.startsWith('temp-'))) {
      console.log('⏳ Auto-save already in progress for new trip, skipping duplicate');
      return false;
    }

    console.log('🔄 Auto-saving conversation:', {
      currentTripId,
      messagesCount: persistedMessages.length,
      isExistingTrip: currentTripId && !currentTripId.startsWith('temp-'),
      hasFeedback: persistedMessages.some(msg => msg.userFeedback)
    });

    // Auto-save ALL conversations to database (no manual save needed)
    try {
      setSaveState('saving');
      savingInProgressRef.current = true;
      const tripSummary = createTripSummary(persistedMessages, planToSave);

      if (currentTripId && !currentTripId.startsWith('temp-')) {
        console.log('🔄 Updating existing trip in database:', currentTripId);
        // Stage 8.3 — response-coupled payload ONLY. No status/title, so a routine
        // or delayed auto-save can never reactivate an archived trip or rename it.
        // expectedPreviousVersion lets the server reject stale/conflicting writes.
        const updateResponse = await tripService.updateTrip(
          currentTripId,
          buildResponseSavePayload({
            conversation: persistedMessages,
            summary: tripSummary,
            plan: planToSave,
            entryContext: entryContextRef.current,
          })
        );

        // Stage 8.1 — a stale/conflicting canonical write is NOT a successful
        // save. Do not claim "Saved"; reconcile local identity to the server's
        // stored canonical response and surface a recoverable sync state.
        const pp = updateResponse?.planPersistence;
        if (pp && pp.success === false) {
          console.warn('⚠️ Canonical write rejected:', pp.outcome, pp.reason);
          // Reconcile local identity to the server's stored canonical response;
          // do NOT auto-retry (that would resubmit the same stale response).
          if (pp.storedIdentity) {
            setCurrentPlan((prev) => (prev ? { ...prev, ...pp.storedIdentity } : prev));
          }
          savingInProgressRef.current = false;
          setSaveState(resolveSaveState({ planPersistence: pp }));
          return false;
        }

        console.log('✅ Trip updated successfully');
        // Force refresh of trips list to update message count
        if (refreshTrips) {
          refreshTrips();
        }
        persistSessionToStorage(currentTripId, persistedMessages, planToSave);
      } else {
        // Create new trip in database
        console.log('🆕 Creating NEW trip in database:', {
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          messagesCount: persistedMessages.length
        });
        const response = await tripService.createTrip({
          parkName: parkName || 'General Planning',
          parkCode: formData.parkCode || null,
          title: parkName ? `${parkName} Trip Plan` : 'General Planning Session',
          formData: formData || {},
          entryContext: entryContextRef.current,
          conversation: persistedMessages,
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

        persistSessionToStorage(newTripId, persistedMessages, planToSave);
      }
      setSaveState('saved');
      return true;
    } catch (error) {
      // Stage 8.2 — a network failure is not a successful save.
      console.error('Error auto-saving conversation:', error);
      persistSessionToStorage(currentTripId, persistedMessages, planToSave);
      setSaveState(resolveSaveState({ networkError: true }));
      return false;
    } finally {
      savingInProgressRef.current = false;
    }
  };

  // WP-TU Phase 4 Task 10D/10E — a SEPARATE, additive persistence path for a
  // historical (cross-plan) mutation. Deliberately NOT a modification of
  // `autoSaveConversation` above: that function owns the ACTIVE trip's
  // conversation + plan as one atomic response-coupled unit, and must stay
  // completely unaware of any other trip. This targets a DIFFERENT trip
  // (`data.targetPlanMutation.tripId`, never `currentTripId`) with ONLY its
  // plan — `conversation`/`summary` are deliberately omitted from the payload
  // (confirmed: `tripController.js` preserves the existing stored
  // `conversation` when the field is absent from the request body), so the
  // target trip's own conversation history is never read or appended to.
  //
  // Task 10E — carries `sourceTripId`/`sourceResponseId` so the server can
  // verify (against its OWN stored data, never this claim alone) that a real,
  // durably-persisted assistant message in the active trip's conversation
  // named this target trip. The CALLER is responsible for only invoking this
  // AFTER the active-trip save has durably succeeded (see the ordering
  // enforcement at the call site) — this function does not itself wait for
  // or verify that; it only shapes and sends the payload.
  const persistTargetPlanMutation = async (targetPlanMutation, sourceProvenance) => {
    const save = buildTargetPlanMutationSave(targetPlanMutation, buildResponseSavePayload, sourceProvenance);
    if (!save) return;
    try {
      await tripService.updateTrip(save.tripId, save.payload);
    } catch (error) {
      // Best-effort — the active (Badlands) conversation's own save above has
      // already succeeded or failed independently; a failure here must not
      // be reported as a failure of THIS turn's primary (active-trip) save.
      console.error('Error persisting target plan mutation:', error);
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
        <div className="public-content w-full px-3 sm:px-4 lg:px-6 xl:px-8">
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
      className="relative flex flex-1 flex-col"
      style={{ backgroundColor: 'transparent' }}
      onPointerDownCapture={() => primeCompletionSound?.()}
    >
      <div className="flex flex-1 flex-col">
      <div
        ref={chatContainerRef}
        className="relative flex-1 chat-messages-container"
      >
          <div className={`public-shell ${isWelcomeState ? 'py-8 sm:py-12' : 'py-5 sm:py-8'}`}>
            <div className="space-y-6 sm:space-y-9">
              {displayMessages.map((message, index) => {
                if (message.messageKind === MESSAGE_KIND.UI_WELCOME && !isWelcomeState) return null;

                const sourceFlags = message.isStreaming || message.isFinalizing
                  ? { hasLiveData: false, hasWebSearch: false }
                  : liveFlagsFromSources(message.streamSources);

                // Stage 14.5 — a stored (or in-flight) revision 1 has empty
                // canonical content. The shared resolver decides what that means;
                // restore, share and export all read it, so they cannot disagree.
                const stored = deriveTrailieStoredPresentation({
                  response: message,
                  canonicalPlan: message.itineraryPlan || null,
                  viewerContext: VIEWER_CONTEXT.OWNER,
                  recoveryCapability: recoveryCapability && isTripSaved,
                });
                const presentation = {
                  showProseBubble: stored.showProse || message.role === 'user',
                  // An ACTIVE stream may say "Preparing trip notes…"; a restored
                  // trip must not, because stored state is no proof that Phase B
                  // is still running.
                  pendingLabel: message.pendingProseLabel || stored.notesLabel,
                };
                const usesSharedTrailieResponse = (
                  message.role === 'assistant'
                  && !message.isConversionMessage
                  && message.id !== 'welcome-placeholder'
                  && !(isWelcomeState && index === 0)
                );
                const trailieResponse = usesSharedTrailieResponse
                  ? toLiveTrailieResponseModel({
                      message: {
                        ...message,
                        hasLiveData: Boolean(message.hasLiveData || sourceFlags.hasLiveData),
                        hasWebSearch: Boolean(message.hasWebSearch || sourceFlags.hasWebSearch),
                      },
                      lifecycle: {
                        showProse: presentation.showProseBubble,
                        showPlan: stored.showItinerary,
                        isStreaming: Boolean(message.isStreaming),
                        isFinalizing: Boolean(message.isFinalizing),
                        pendingLabel: presentation.pendingLabel,
                      },
                    })
                  : null;

                return message.hiddenFromUi || message.isConversionMessage ? null : (
                <div key={message.id || message._id || index} id={`trailie-message-${index}`} tabIndex={-1} className="trailie-message min-w-0">
                {message.isConversionMessage ? (
                  null
                ) : usesSharedTrailieResponse ? (
                  <TrailieResponse
                    response={trailieResponse}
                    artifactAccess={isAnonymous || !isAuthenticated ? 'guest' : 'account'}
                    onOpenArtifact={handleOpenArtifact}
                    tone={
                      message.outcomeClass === TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE
                        ? 'failure'
                        : message.outcomeClass === TRAILIE_TURN_OUTCOME.UNCERTAIN_OUTCOME
                          ? 'uncertain'
                          : 'default'
                    }
                    personalizationCurrent={guestTrip?.index === index}
                    planningState={message.planningState || (guestTrip?.index === index ? planningStateRef.current : null)}
                    guestExhausted={isAnonymous && !canSendMore}
                    onRequireAccount={() => openGuestAuthGate({ reason: SIGNUP_PROMPT_REASONS.LIMIT_WITH_TRIP })}
                    footer={message.artifactStatus?.status === 'save_failed' ? (
                      <p role="status" className="max-w-[var(--public-rich-width)] border-l-2 pl-3 text-sm leading-6 text-[var(--text-secondary)]"
                        style={{ borderColor: 'color-mix(in srgb, #b7791f 55%, var(--border))' }}>
                        {message.artifactStatus.notice || 'I answered your request, but couldn’t save the trip update.'}
                      </p>
                    ) : null}
                    personalizationDisabled={conversationSendBlocked({ generating: isGenerating, recovering: historySyncBusy, recoveryPending: historyRecovery, restoreStatus: isAnonymous ? anonymousRestoreStatus : authRestoreStatus }) || (isAnonymous && !canSendMore)}
                    onFollowup={async (prompt) => {
                      // Recheck revision at submission; no direct plan/memory writes.
                      if (guestTrip?.index !== index || (currentPlanRef.current && tripRevision(currentPlanRef.current) !== tripRevision(message.canonicalPlan || message.itineraryPlan))) return null;
                      setComposerDraft({ text: prompt });
                      return { drafted: true };
                    }}
                    hideActions={Boolean(message.isStreaming || message.isFinalizing)}
                    afterContent={
                      canRetryTrailieTurn({ outcomeClass: message.outcomeClass }) ? (
                        <Button
                          onClick={() => handleRetryFailedTurn(message.id)}
                          variant="secondary"
                          size="sm"
                          icon={RefreshCw}
                          disabled={isGenerating}
                        >
                          Try again
                        </Button>
                      ) : null}
                  />
                ) : presentation.showProseBubble ? (
                <MessageBubble
                  message={
                    message.isConversionMessage
                      ? message.content || buildGuestLimitIntro({ timeUntilReset, parkName })
                      : message.content
                  }
                  isUser={message.role === 'user'}
                  timestamp={isWelcomeState && index === 0 ? null : message.timestamp}
                  inlineAvatarLayout
                  variant={
                    message.isConversionMessage
                      ? 'conversion'
                      : isWelcomeState && message.role === 'assistant' && index === 0
                        ? 'opening'
                        : 'default'
                  }
                  hideActions={
                    message.isConversionMessage ||
                    message.isStreaming ||
                    message.isFinalizing ||
                    message.id === 'welcome-placeholder' ||
                    (isWelcomeState &&
                    message.role === 'assistant' &&
                    index === 0)
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
                  isFinalizing={Boolean(message.isFinalizing)}
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
                  hasLiveData={Boolean(message.hasLiveData || sourceFlags.hasLiveData)}
                  hasWebSearch={Boolean(message.hasWebSearch || sourceFlags.hasWebSearch)}
                  liveDataParks={
                    message.parkNames?.length
                      ? message.parkNames
                      : message.parkName
                        ? [message.parkName]
                        : EMPTY_PARK_LIST
                  }
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
                        
                        // Stage 8.1 — persist feedback via the NARROW command,
                        // not a full-conversation auto-save. This can only touch
                        // userFeedback and can never rewrite canonical assistant
                        // content, the plan, or response hashes/version.
                        if (currentTripId && !currentTripId.startsWith('temp-')) {
                          tripService
                            .updateMessageFeedback(currentTripId, message.id, type)
                            .catch(err => console.error('❌ Feedback save failed:', err));
                        } else {
                          console.warn('⚠️ Skipping feedback save (unsaved trip):', { currentTripId });
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
                ) : null}
                {!usesSharedTrailieResponse && message.itineraryPlan && stored.showItinerary ? (
                  <EarlyItineraryCard
                    key={message.itineraryHash}
                    plan={message.itineraryPlan}
                    pendingLabel={presentation.pendingLabel}
                  />
                ) : null}
                {stored.showRecoveryAction ? (
                  <button
                    type="button"
                    onClick={() => handleGenerateTripNotes(message)}
                    disabled={isGenerating || recoveringResponseId === message.responseId}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition hover:opacity-90 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Generate trip notes
                  </button>
                ) : null}
                {recoveryNotice && recoveryNotice.responseId === message.responseId ? (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }} role="status">
                    {recoveryNotice.message}
                  </p>
                ) : null}
                </div>
                );
              })}

              {isWelcomeState && (
                <div className="mx-auto w-full max-w-[var(--public-rich-width)] pt-1 sm:pt-2">
                  {isPersonalized && (
                    <p
                      className="mb-2 text-xs leading-relaxed sm:mb-3 sm:text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {MY_RECOMMENDATIONS_PERSONALIZED_SUBTITLE} — or try asking:
                    </p>
                  )}
                  <SuggestedPrompts
                    hideTitle={Boolean(onOpenQuickFill || isPersonalized)}
                    prompts={isPersonalized ? TRAILIE_PERSONALIZED_PROMPTS : TRAILIE_DEMO_PROMPTS}
                    onSelect={(text) => setComposerDraft({ text })}
                    title={isPersonalized ? 'Suggestions for you' : 'Try asking...'}
                    subtitle={null}
                  />
                  {!isPersonalized && onOpenQuickFill && (
                    <div className="mt-4 flex items-center gap-2 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <span>Prefer a guided start?</span>
                      <button
                        type="button"
                        onClick={onOpenQuickFill}
                        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{ color: 'var(--accent-green)', '--tw-ring-color': 'var(--accent-green)' }}
                      >
                        {hasUsedQuickFill ? <Edit2 className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                        {hasUsedQuickFill ? 'Edit trip details' : 'Add trip details'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isAnonymous && !isGenerating &&
                (!canSendMore || messages.some(message => message.isConversionMessage)) && (
                <GuestAccountCard
                  plan={guestTrip?.plan}
                  onCreateAccount={() => openGuestAuthGate({ reason: guestLimitReason() })}
                  onSignIn={() => openGuestAuthGate({ reason: guestLimitReason(), mode: 'login' })}
                  timeUntilReset={timeUntilReset}
                />
              )}

              {isGenerating && !provisionalAnswer?.content &&
                !displayMessages.some(
                  (m) => m.role === 'assistant' && (m.isStreaming || m.isFinalizing)
                ) && (
                <TypingIndicator
                text={thinkingMessage}
                sources={thinkingSources}
                inlineAvatarLayout
              />)}

              <ProvisionalAnswer answer={provisionalAnswer} onCancel={() => abortControllerRef.current?.abort()} />
              {draftPreviewEnabled() && draftPreview && <div ref={draftPreviewRef} className="pb-8">
                <TrailieDraftPreview preview={draftPreview} onCancel={() => abortControllerRef.current?.abort()} />
              </div>}
              <div ref={messagesEndRef} />
            </div>
          </div>

        </div>
      </div>

      {/* Composer — the primary interaction surface; utilities remain secondary. */}
      <div className={`sticky bottom-0 z-20 flex-shrink-0 chat-input-area ${isWelcomeState ? '' : 'border-t'}`}
          style={{
            backgroundColor: isWelcomeState ? 'transparent' : 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: isWelcomeState ? 'none' : '0 -8px 28px rgba(31, 41, 35, 0.04)',
            paddingBottom: 'env(safe-area-inset-bottom, 12px)'
          }}
        >
          {showScrollToLatest && (
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-2 z-10 flex justify-center px-3">
              <button
                type="button"
                onClick={scrollChatToBottom}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg transition-all duration-200 hover:scale-105"
                style={{
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }}
                aria-label={isGenerating ? 'Scroll to new reply' : 'Scroll to latest messages'}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
                {isGenerating ? 'New reply' : 'Jump to latest'}
              </button>
            </div>
          )}
          <div className="public-shell pb-1.5 pt-1.5 sm:pb-4 sm:pt-3">
          <div className="mx-auto w-full max-w-[var(--public-rich-width)]">
            {draftPreviewEnabled() && draftPreview?.status === 'generating' && (
              <div className="mb-2 flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2" aria-label="Draft preview availability">
                <p role="status" className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">
                  <span className="block font-semibold text-[var(--text-primary)]">{draftPreview.days.length ? `${draftPreview.days.length} ${draftPreview.days.length === 1 ? 'day' : 'days'} ready to preview` : 'Preparing draft preview'}</span>
                  Not validated or saved
                </p>
                <button type="button" disabled={!draftPreview.days.length}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-[var(--accent-green)] disabled:opacity-40"
                  onClick={() => {
                    const day = draftPreviewRef.current?.querySelector('article');
                    if (!day) return;
                    const headerOffset = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
                    window.scrollTo({ top: window.scrollY + day.getBoundingClientRect().top - headerOffset - 16, behavior: 'instant' });
                    day.focus({ preventScroll: true });
                  }}>View draft</button>
              </div>
            )}
            {!isWelcomeState && showComposerToolbar && (
            <div className="trailie-composer-utilities mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:mb-3 sm:gap-x-4 sm:gap-y-2">
                {chatStatus && (
                  <div
                    className="inline-flex min-w-0 max-w-full items-center text-[11px] font-medium leading-snug sm:text-xs"
                    role="status"
                    aria-label="Trip save status"
                    data-testid={chatStatus.tone === 'sync-needed' ? 'sync-needed-status' : undefined}
                    style={{
                      color: chatStatus.tone === 'saved'
                        ? '#15803d'
                        : chatStatus.tone === 'saving'
                          ? '#b45309'
                          : chatStatus.tone === 'sync-needed'
                            ? '#b91c1c'
                            : 'var(--text-secondary)',
                    }}
                  >
                    <span className="min-w-0">{chatStatus.tone === 'sync-needed' ? chatStatus.description : chatStatus.label}</span>
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
                      <><CalendarDays className="h-3.5 w-3.5" />Plan My Trip</>
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
            )}

            <ConversationRecoveryNotice
              key={historyRecovery?.archiveId || 'conversation-status'}
              recovery={historyRecovery}
              notice={continuityNotice}
              busy={historySyncBusy || isGenerating || ['pending', 'error'].includes(anonymousRestoreStatus)}
              onRestore={async () => {
                if (historySyncBusy || isGeneratingRef.current || !historyRecovery?.canRestore) return;
                setHistorySyncBusy(true);
                try {
                  acknowledgeRecoverySet(localStorage, historyRecovery.archiveKey, historyRecovery.archiveId);
                  await api.post('/ai/restore-guest-history', { anonymousId, messages: historyRecovery.messages.map(m => ({ role: m.role, content: m.content })), expectedHistoryHash: historyRecovery.expectedHistoryHash });
                  const status = await validateSessionWithBackend(anonymousId);
                  if (!status) throw new Error('restore_failed');
                  const restored = mapServerMessagesToUi(status.messages);
                  const plan = [...status.messages].reverse().find(m => m.canonicalPlan)?.canonicalPlan || null;
                  if (!tripHistoryService.saveTempChatState({ currentTripId: null, ...guestCacheOwnerRef.current, messages: restored, plan, provider: 'auto' })) throw new Error('cache_write_failed');
                  setMessages(restored);
                  planningStateRef.current = status.planningState || null;
                  setCurrentPlan(plan);
                  localStorage.removeItem(historyRecovery.archiveKey);
                  setHistoryRecovery(null);
                  setAnonymousRestoreStatus(status.messages.length ? 'restored' : 'empty');
                  setContinuityNotice('Your messages are restored. You can keep planning.');
                } catch {
                  setHistoryRecovery(null);
                  setAnonymousRestoreStatus('error');
                  setContinuityNotice('We couldn’t confirm the restore. Your backup is safe. Reconnect to check your saved chat before sending.');
                } finally { setHistorySyncBusy(false); }
              }}
              onContinue={() => {
                if (historySyncBusy || !historyRecovery) return;
                try {
                  acknowledgeRecoverySet(localStorage, historyRecovery.archiveKey, historyRecovery.archiveId);
                  setHistoryRecovery(null);
                  setContinuityNotice(null);
                } catch {
                  setContinuityNotice('Your backup is still on this device. We couldn’t save your preference to hide this notice.');
                }
              }}
              onRetry={isAnonymous && (anonymousRestoreStatus === 'error' || (historyRecovery && continuityNotice)) ? () => restoreAnonymousSession() : null}
            />
            {isAnonymous && canSendMore && !isWelcomeState && messageCount > 0 && (
              <p className="mb-1.5 text-right text-[11px] leading-none sm:text-xs" style={{ color: 'var(--text-tertiary)' }} aria-live="polite">
                {anonymousMessagesRemaining} free {anonymousMessagesRemaining === 1 ? 'message' : 'messages'} remaining
              </p>
            )}
            <ChatInput
              onSend={handleSendMessage}
              disabled={conversationSendBlocked({generating:isGenerating,recovering:historySyncBusy,recoveryPending:historyRecovery,restoreStatus:isAnonymous?anonymousRestoreStatus:authRestoreStatus}) || (isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)))}
              placeholder={isAnonymous && (!canSendMore || messages.some(msg => msg.isConversionMessage)) ? "Sign in to keep chatting with Trailie" : "Ask Trailie about a park or trip…"}
              initialValue=""
              draft={composerDraft}
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
        onClose={() => { setShowSaveModal(false); setSaveModalSurface(null); }}
        parkName={parkName}
        anonymousId={anonymousId}
        conversationId={guestConversationId}
        formData={formData}
        messages={messages}
        reason={saveModalReason}
        initialMode={saveModalMode}
        surface={saveModalSurface}
      />
    </div>
  );
};

export default TripPlannerChat;
