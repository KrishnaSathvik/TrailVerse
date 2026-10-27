'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import useRealtimeVoice from '@/hooks/useRealtimeVoice';
import { slugToParkCode } from '@/utils/parkSlug';
import { logVoiceSessionStart } from '@/utils/analytics';
import { isVoiceHiddenPath } from '@/lib/voiceRoutes';

export { isVoiceHiddenPath, VOICE_HIDDEN_PATHS } from '@/lib/voiceRoutes';

export const VoiceSessionContext = createContext(null);

export function VoiceSessionProvider({ children }) {
  const pathname = usePathname();
  const {
    status,
    transcript,
    isTrailieSpeaking,
    isToolCalling,
    toolName,
    toolArgs,
    toolStartedAt,
    toolCallInfo,
    responsePending,
    thinkingStartedAt,
    error,
    authRequired,
    permissionDenied,
    userMuted,
    bargeInEnabled,
    audioLevel,
    micActive,
    connect,
    disconnect,
    setMuted,
    toggleMute,
  } = useRealtimeVoice();

  const [uiMode, setUiMode] = useState('closed'); // closed | docked | immersive
  const startedParkRef = useRef(null);
  const prevHiddenRef = useRef(false);
  const uiModeRef = useRef(uiMode);
  uiModeRef.current = uiMode;

  const hidden = isVoiceHiddenPath(pathname);
  const parkCode = useMemo(() => {
    const match = pathname?.match(/^\/parks\/([^/?#]+)/);
    if (match) return slugToParkCode(match[1]);
    return null;
  }, [pathname]);

  const endCall = useCallback(() => {
    disconnect();
    setUiMode('closed');
    startedParkRef.current = null;
  }, [disconnect]);

  // End session when navigating onto excluded routes
  useEffect(() => {
    const wasHidden = prevHiddenRef.current;
    prevHiddenRef.current = hidden;
    if (hidden && !wasHidden && uiModeRef.current !== 'closed') {
      endCall();
    }
  }, [hidden, endCall]);

  const startSession = useCallback(() => {
    if (hidden) return;
    logVoiceSessionStart({ parkCode });
    startedParkRef.current = parkCode;
    setUiMode('docked');
    connect(parkCode);
  }, [hidden, parkCode, connect]);

  const retry = useCallback(() => {
    const code = startedParkRef.current ?? parkCode;
    setUiMode('docked');
    connect(code);
  }, [parkCode, connect]);

  const expand = useCallback(() => {
    setUiMode((mode) => (mode === 'closed' ? mode : 'immersive'));
  }, []);

  const dock = useCallback(() => {
    setUiMode((mode) => (mode === 'closed' ? mode : 'docked'));
  }, []);

  // Escape from immersive returns to dock (does not end call)
  useEffect(() => {
    if (uiMode !== 'immersive') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setUiMode('docked');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uiMode]);

  const value = useMemo(
    () => ({
      status,
      transcript,
      isTrailieSpeaking,
      isToolCalling,
      toolName,
      toolArgs,
      toolStartedAt,
      toolCallInfo,
      responsePending,
      thinkingStartedAt,
      error,
      authRequired,
      permissionDenied,
      userMuted,
      bargeInEnabled,
      audioLevel,
      micActive,
      setMuted,
      toggleMute,
      uiMode,
      hidden,
      parkCode,
      pagePath: pathname,
      startSession,
      endCall,
      retry,
      expand,
      dock,
      setUiMode,
    }),
    [
      status,
      transcript,
      isTrailieSpeaking,
      isToolCalling,
      toolName,
      toolArgs,
      toolStartedAt,
      toolCallInfo,
      responsePending,
      thinkingStartedAt,
      error,
      authRequired,
      permissionDenied,
      userMuted,
      bargeInEnabled,
      audioLevel,
      micActive,
      setMuted,
      toggleMute,
      uiMode,
      hidden,
      parkCode,
      pathname,
      startSession,
      endCall,
      retry,
      expand,
      dock,
    ]
  );

  return (
    <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>
  );
}

export function useVoiceSession() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error('useVoiceSession must be used within VoiceSessionProvider');
  }
  return ctx;
}
