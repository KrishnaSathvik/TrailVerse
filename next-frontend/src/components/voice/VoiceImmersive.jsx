'use client';

import { useEffect, useRef } from 'react';
import { createAppIcon } from '@/components/icons/createAppIcon';
import { CircleNotchIcon, MicrophoneSlashIcon, PhoneDisconnectIcon } from '@phosphor-icons/react';
import { Microphone, Minimize } from '@components/icons';
import { useVoiceSession } from '@/context/VoiceSessionContext';
import VoiceWaveMark from './VoiceWaveMark';
import VoiceActivityMark from './VoiceActivityMark';
import VoiceAuthGate from './VoiceAuthGate';
import VoiceConversation from './VoiceConversation';
import useVoiceActivity from '@/hooks/useVoiceActivity';
import { getSuggestedPrompts } from '@/lib/voiceStatusCopy';
import parkSlugs from '@/data/park-slugs.json';

const CircleNotch = createAppIcon(CircleNotchIcon);
const MicrophoneSlash = createAppIcon(MicrophoneSlashIcon);
const PhoneDisconnect = createAppIcon(PhoneDisconnectIcon);

const parkNameMap = {};
for (const p of parkSlugs) {
  parkNameMap[p.parkCode] = p.fullName;
}

export default function VoiceImmersive() {
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
    dock,
    retry,
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

  const returnRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    returnRef.current?.focus?.();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (authRequired) {
    return (
      <div
        className="trailie-voice-immersive trailie-voice-immersive--auth"
        role="dialog"
        aria-modal="true"
        aria-label="Trailie Voice signup"
      >
        <div className="trailie-voice-immersive-header">
          <div className="trailie-voice-immersive-brand">
            <span className="trailie-voice-dock-mark">
              <VoiceWaveMark size="sm" tone="light" />
            </span>
            <p className="trailie-voice-immersive-title">Trailie Voice</p>
          </div>
        </div>
        <div className="trailie-voice-immersive-shell trailie-voice-immersive-shell--auth">
          <VoiceAuthGate onDismiss={endCall} />
        </div>
      </div>
    );
  }

  const parkFullName = parkCode ? parkNameMap[parkCode] || parkCode.toUpperCase() : null;

  const showIdle =
    transcript.length === 0 &&
    !isToolCalling &&
    !responsePending &&
    status !== 'error' &&
    status !== 'connecting';

  const liveAccent = activity.id === 'listening' || activity.id === 'hearing';

  return (
    <div
      className="trailie-voice-immersive"
      role="dialog"
      aria-modal="true"
      aria-label="Trailie Voice conversation"
    >
      <div className="trailie-voice-immersive-header">
        <div className="trailie-voice-immersive-brand min-w-0">
          <span className="trailie-voice-dock-mark flex-shrink-0">
            <VoiceWaveMark size="sm" tone="light" />
          </span>
          <div className="min-w-0">
            <p className="trailie-voice-immersive-title">Trailie Voice</p>
            {parkFullName && (
              <p className="trailie-voice-immersive-park truncate">{parkFullName}</p>
            )}
          </div>
        </div>
        <button
          ref={returnRef}
          type="button"
          className="trailie-voice-immersive-collapse"
          onClick={dock}
          aria-label="Return to dock"
          title="Return to dock"
        >
          <span className="trailie-voice-immersive-collapse-label trailie-voice-immersive-collapse-label--short">
            Dock
          </span>
          <span className="trailie-voice-immersive-collapse-label trailie-voice-immersive-collapse-label--long">
            Return to dock
          </span>
          <Minimize className="h-4 w-4" />
        </button>
      </div>

      <div
        className="trailie-voice-immersive-mobile-status"
        aria-live="polite"
        aria-atomic="true"
      >
        <VoiceActivityMark visual={activity.visual} audioLevel={audioLevel} size="sm" />
        <span className={liveAccent ? 'trailie-voice-status-live' : undefined}>
          {liveAccent ? <span className="trailie-voice-status-dot" aria-hidden="true" /> : null}
          {activity.label}
        </span>
      </div>

      <div className="trailie-voice-immersive-shell">
        <div className="trailie-voice-immersive-main">
          {error && (
            <p className="trailie-voice-immersive-error" role="alert">
              {error}
            </p>
          )}

          {(permissionDenied || status === 'error') && (
            <button type="button" className="trailie-voice-dock-retry" onClick={retry}>
              Retry connection
            </button>
          )}

          <VoiceConversation
            transcript={transcript}
            mode="chat"
            emptyHint={
              showIdle ? (
                <div className="trailie-voice-immersive-idle">
                  <p>Listening — ask about a park or your next trip.</p>
                  <div className="trailie-voice-dock-suggestions">
                    {getSuggestedPrompts({ parkCode, pagePath }).slice(0, 3).map((q) => (
                      <span key={q} className="trailie-voice-chip">
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            }
          />
        </div>

        <aside className="trailie-voice-immersive-side" aria-label="Voice activity">
          <div
            className={`trailie-voice-immersive-pulse trailie-voice-immersive-pulse--${
              activity.visual === 'speak-wave'
                ? 'speak'
                : activity.visual === 'think-dots'
                  ? 'think'
                  : activity.visual === 'muted'
                    ? 'muted'
                    : 'listen'
            }`}
          >
            {activity.id === 'connecting' ? (
              <CircleNotch size={22} weight="bold" className="voice-spinner" style={{ color: '#fff' }} />
            ) : activity.visual === 'think-dots' ? (
              <VoiceActivityMark visual="think-dots" size="md" />
            ) : (
              <VoiceWaveMark size="md" tone="light" />
            )}
          </div>
          <p className="trailie-voice-immersive-status" aria-live="polite" aria-atomic="true">
            {activity.label}
          </p>
          <p className="trailie-voice-immersive-side-note">
            {activity.id === 'checking'
              ? 'Looking up live park data'
              : activity.id === 'thinking'
                ? 'Working on your answer'
                : userMuted
                  ? 'Microphone muted'
                  : 'Voice is active'}
          </p>
          {(activity.id === 'listening' || activity.id === 'hearing' || activity.id === 'speaking') && (
            <div className="trailie-voice-immersive-side-wave" aria-hidden="true">
              <VoiceActivityMark visual={activity.visual} audioLevel={audioLevel} size="lg" />
            </div>
          )}
        </aside>
      </div>

      {status !== 'error' ? (
        <div className="trailie-voice-immersive-footer">
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
        <div className="trailie-voice-immersive-footer">
          <button type="button" className="trailie-voice-dock-end" onClick={endCall} style={{ flex: 1 }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
