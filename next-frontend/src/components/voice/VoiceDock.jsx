'use client';

import { useEffect, useRef } from 'react';
import { Maximize, Microphone } from '@components/icons';
import { createAppIcon } from '@/components/icons/createAppIcon';
import {
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  ArrowClockwiseIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react';
import { useVoiceSession } from '@/context/VoiceSessionContext';
import VoiceWaveMark from './VoiceWaveMark';
import VoiceActivityMark from './VoiceActivityMark';
import VoiceAuthGate from './VoiceAuthGate';
import useVoiceActivity from '@/hooks/useVoiceActivity';
import { getSuggestedPrompts } from '@/lib/voiceStatusCopy';

const MicrophoneSlash = createAppIcon(MicrophoneSlashIcon);
const PhoneDisconnect = createAppIcon(PhoneDisconnectIcon);
const ArrowClockwise = createAppIcon(ArrowClockwiseIcon);
const CircleNotch = createAppIcon(CircleNotchIcon);

function HeaderIcon({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="trailie-voice-ctrl"
    >
      {children}
    </button>
  );
}

export default function VoiceDock() {
  const {
    status,
    transcript,
    isTrailieSpeaking,
    isToolCalling,
    toolName,
    toolArgs,
    toolStartedAt,
    error,
    authRequired,
    permissionDenied,
    userMuted,
    bargeInEnabled,
    responsePending,
    thinkingStartedAt,
    audioLevel,
    parkCode,
    pagePath,
    endCall,
    retry,
    expand,
    toggleMute,
  } = useVoiceSession();

  const activity = useVoiceActivity({
    status,
    isTrailieSpeaking,
    isToolCalling,
    toolName,
    toolArgs,
    toolStartedAt,
    userMuted,
    permissionDenied,
    authRequired,
    responsePending,
    thinkingStartedAt,
    bargeInEnabled,
  });

  const panelRef = useRef(null);
  const replyRef = useRef(null);
  const stickRef = useRef(true);
  const announcedRef = useRef('');

  useEffect(() => {
    panelRef.current?.querySelector('button')?.focus?.();
  }, []);

  const lastAssistant = [...transcript].reverse().find((m) => m.role === 'assistant');
  const latestReply = lastAssistant?.text || '';

  useEffect(() => {
    const el = replyRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [latestReply, lastAssistant?.streaming]);

  // Soften SR chatter: announce only when the status label meaningfully changes.
  useEffect(() => {
    if (activity.label && activity.label !== announcedRef.current) {
      announcedRef.current = activity.label;
    }
  }, [activity.label]);

  if (authRequired) {
    return (
      <div
        ref={panelRef}
        className="trailie-voice-dock trailie-voice-dock--auth"
        role="region"
        aria-label="Trailie Voice"
      >
        <div className="trailie-voice-dock-handle" aria-hidden="true" />
        <VoiceAuthGate onDismiss={endCall} compact />
      </div>
    );
  }

  const showIdle =
    !latestReply &&
    !isToolCalling &&
    !responsePending &&
    status !== 'connecting' &&
    status !== 'error';

  const suggestions = getSuggestedPrompts({ parkCode, pagePath });
  const liveAccent = activity.id === 'listening' || activity.id === 'hearing';

  return (
    <div
      ref={panelRef}
      className="trailie-voice-dock"
      role="region"
      aria-label="Trailie Voice"
    >
      <div className="trailie-voice-dock-handle" aria-hidden="true" />

      <div className="trailie-voice-dock-header">
        <div className="trailie-voice-dock-brand">
          <span className="trailie-voice-dock-mark">
            <VoiceWaveMark size="sm" tone="light" />
          </span>
          <div className="trailie-voice-dock-title-row min-w-0">
            <p className="trailie-voice-dock-title">Trailie</p>
            <p
              className="trailie-voice-dock-sub"
              aria-live="polite"
              aria-atomic="true"
            >
              {activity.id === 'connecting' ? (
                <span className="inline-flex items-center gap-1.5">
                  <CircleNotch size={12} className="voice-spinner" />
                  {activity.label}
                </span>
              ) : (
                <>
                  {liveAccent ? (
                    <span className="trailie-voice-status-dot" aria-hidden="true" />
                  ) : null}
                  <span className={liveAccent ? 'trailie-voice-status-live' : undefined}>
                    {activity.label}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <HeaderIcon onClick={expand} label="Expand to full screen">
          <Maximize className="h-4 w-4" />
        </HeaderIcon>
      </div>

      <div className="trailie-voice-dock-body">
        <div className="trailie-voice-dock-visual" aria-hidden="true">
          <VoiceActivityMark visual={activity.visual} audioLevel={audioLevel} size="md" />
        </div>

        {activity.id === 'thinking' || activity.id === 'checking' ? (
          <p className="trailie-voice-dock-activity-hint">
            {activity.id === 'checking' ? activity.label : 'Working on your answer.'}
          </p>
        ) : null}

        {error && (
          <p className="trailie-voice-dock-error" role="alert">
            {error}
          </p>
        )}

        {(permissionDenied || status === 'error') && (
          <button type="button" className="trailie-voice-dock-retry" onClick={retry}>
            <ArrowClockwise className="h-4 w-4" />
            Retry
          </button>
        )}

        {latestReply ? (
          <div className="trailie-voice-dock-latest">
            <p className="trailie-voice-dock-latest-label">Last response</p>
            <div
              ref={replyRef}
              className="trailie-voice-dock-latest-body"
              onScroll={() => {
                const el = replyRef.current;
                if (!el) return;
                stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              }}
            >
              <p>
                {latestReply}
                {lastAssistant?.streaming ? <span className="trailie-voice-caret" /> : null}
              </p>
            </div>
          </div>
        ) : showIdle ? (
          <div>
            <p className="trailie-voice-dock-hint">
              Ask me about a park or your next trip.
            </p>
            {status === 'connected' && !error && (
              <div className="trailie-voice-dock-suggestions">
                {suggestions.slice(0, 2).map((q) => (
                  <span key={q}>{q}</span>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {status !== 'error' ? (
        <div className="trailie-voice-dock-footer">
          <button
            type="button"
            className={`trailie-voice-dock-mute${userMuted ? ' is-active' : ''}`}
            onClick={toggleMute}
            aria-pressed={userMuted}
            aria-label={userMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {userMuted ? <MicrophoneSlash className="h-4 w-4" /> : <Microphone className="h-4 w-4" />}
            {userMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            className="trailie-voice-dock-end"
            onClick={endCall}
            aria-label="End call"
          >
            <PhoneDisconnect className="h-4 w-4" weight="fill" />
            End call
          </button>
        </div>
      ) : (
        <div className="trailie-voice-dock-footer">
          <button
            type="button"
            className="trailie-voice-dock-end"
            onClick={endCall}
            aria-label="Dismiss"
            style={{ flex: 1 }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
