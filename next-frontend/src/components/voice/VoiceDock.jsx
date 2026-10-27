'use client';

import { useEffect, useRef } from 'react';
import { Minimize, Maximize, Microphone } from '@components/icons';
import { createAppIcon } from '@/components/icons/createAppIcon';
import {
  MicrophoneSlashIcon,
  PhoneDisconnectIcon,
  ArrowClockwiseIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react';
import { useVoiceSession } from '@/context/VoiceSessionContext';
import VoiceWaveform from './VoiceWaveform';
import VoiceWaveMark from './VoiceWaveMark';
import VoiceAuthGate from './VoiceAuthGate';
import { getSuggestedPrompts, getVoiceStatusText } from '@/lib/voiceStatusCopy';

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

function shortCaption(text, max = 160) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

export default function VoiceDock() {
  const {
    status,
    transcript,
    isTrailieSpeaking,
    isToolCalling,
    toolCallInfo,
    error,
    authRequired,
    permissionDenied,
    userMuted,
    audioLevel,
    parkCode,
    pagePath,
    endCall,
    retry,
    minimize,
    expand,
    toggleMute,
  } = useVoiceSession();

  const panelRef = useRef(null);
  const captionRef = useRef(null);

  useEffect(() => {
    panelRef.current?.querySelector('button')?.focus?.();
  }, []);

  useEffect(() => {
    if (captionRef.current) {
      captionRef.current.scrollTop = captionRef.current.scrollHeight;
    }
  }, [transcript]);

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

  const lastAssistant = [...transcript].reverse().find((m) => m.role === 'assistant');
  const captionText = shortCaption(lastAssistant?.text || '');
  const statusText = getVoiceStatusText({
    status,
    isToolCalling,
    toolCallInfo,
    userMuted,
    permissionDenied,
    authRequired,
  });

  const waveVariant = userMuted
    ? 'muted'
    : isTrailieSpeaking
      ? 'speak'
      : status === 'listening' || status === 'connected'
        ? 'listen'
        : 'idle';

  const showIdleHint =
    !captionText &&
    !isToolCalling &&
    status !== 'connecting' &&
    status !== 'error';

  const suggestions = getSuggestedPrompts({ parkCode, pagePath });

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
          <div className="min-w-0">
            <p className="trailie-voice-dock-title">Trailie</p>
            <p className="trailie-voice-dock-sub" aria-live="polite">
              {status === 'connecting' ? (
                <span className="inline-flex items-center gap-1.5">
                  <CircleNotch size={12} className="voice-spinner" />
                  {statusText}
                </span>
              ) : (
                statusText
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <HeaderIcon onClick={minimize} label="Minimize">
            <Minimize className="h-4 w-4" />
          </HeaderIcon>
          <HeaderIcon onClick={expand} label="Expand to full screen">
            <Maximize className="h-4 w-4" />
          </HeaderIcon>
        </div>
      </div>

      <div className="trailie-voice-dock-body">
        <div className="trailie-voice-dock-visual" aria-hidden="true">
          <VoiceWaveform level={audioLevel} variant={waveVariant} bars={7} />
        </div>

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

        <div ref={captionRef} className="trailie-voice-dock-caption">
          {captionText ? (
            <p>{captionText}</p>
          ) : showIdleHint ? (
            <p className="trailie-voice-dock-hint">
              Ask me about a park or your next trip.
            </p>
          ) : null}
        </div>

        {showIdleHint && !error && status === 'connected' && (
          <div className="trailie-voice-dock-suggestions">
            {suggestions.slice(0, 2).map((q) => (
              <span key={q}>{q}</span>
            ))}
          </div>
        )}
      </div>

      {status !== 'error' && (
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
      )}

      {status === 'error' && (
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
