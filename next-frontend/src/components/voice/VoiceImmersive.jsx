'use client';

import { useEffect, useRef } from 'react';
import { createAppIcon } from '@/components/icons/createAppIcon';
import { CircleNotchIcon, MicrophoneSlashIcon, PhoneDisconnectIcon } from '@phosphor-icons/react';
import { Microphone } from '@components/icons';
import { useVoiceSession } from '@/context/VoiceSessionContext';
import VoiceWaveform from './VoiceWaveform';
import VoiceWaveMark from './VoiceWaveMark';
import VoiceAuthGate from './VoiceAuthGate';
import { getSuggestedPrompts, getVoiceStatusText } from '@/lib/voiceStatusCopy';
import parkSlugs from '@/data/park-slugs.json';

const CircleNotch = createAppIcon(CircleNotchIcon);
const MicrophoneSlash = createAppIcon(MicrophoneSlashIcon);
const PhoneDisconnect = createAppIcon(PhoneDisconnectIcon);

const parkNameMap = {};
for (const p of parkSlugs) {
  parkNameMap[p.parkCode] = p.fullName;
}

function shortCaption(text, max = 220) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

export default function VoiceImmersive() {
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
    dock,
    retry,
    toggleMute,
  } = useVoiceSession();

  const captionRef = useRef(null);
  const returnRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    returnRef.current?.focus?.();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (captionRef.current) {
      captionRef.current.scrollTop = captionRef.current.scrollHeight;
    }
  }, [transcript]);

  if (authRequired) {
    return (
      <div
        className="trailie-voice-immersive trailie-voice-immersive--auth"
        role="dialog"
        aria-modal="true"
        aria-label="Trailie Voice signup"
      >
        <div className="trailie-voice-immersive-header">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl object-contain" />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </p>
          </div>
        </div>
        <div className="trailie-voice-immersive-body trailie-voice-immersive-body--auth">
          <VoiceAuthGate onDismiss={endCall} />
        </div>
      </div>
    );
  }

  const parkFullName = parkCode ? parkNameMap[parkCode] || parkCode.toUpperCase() : null;
  const lastAssistant = [...transcript].reverse().find((m) => m.role === 'assistant');
  const captionText = shortCaption(lastAssistant?.text || '');
  const isStreaming = lastAssistant?.streaming;

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

  const showIdle =
    !captionText &&
    !isToolCalling &&
    status !== 'error' &&
    status !== 'connecting';

  return (
    <div
      className="trailie-voice-immersive"
      role="dialog"
      aria-modal="true"
      aria-label="Trailie Voice full screen"
    >
      <div className="trailie-voice-immersive-header">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl object-contain flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </p>
            {parkFullName && (
              <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                {parkFullName}
              </p>
            )}
          </div>
        </div>
        <button
          ref={returnRef}
          type="button"
          className="trailie-voice-immersive-return"
          onClick={dock}
        >
          Back to dock
        </button>
      </div>

      <div className="trailie-voice-immersive-body">
        <div className="trailie-voice-immersive-stage">
          <div className={`trailie-voice-immersive-pulse trailie-voice-immersive-pulse--${waveVariant}`}>
            {status === 'connecting' ? (
              <CircleNotch size={28} weight="bold" className="voice-spinner" style={{ color: '#fff' }} />
            ) : (
              <VoiceWaveMark size="lg" tone="light" />
            )}
          </div>

          <div className="trailie-voice-immersive-wave">
            <VoiceWaveform level={audioLevel} variant={waveVariant} bars={9} />
          </div>

          <p className="trailie-voice-immersive-status" aria-live="polite">
            {statusText}
          </p>
        </div>

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

        <div ref={captionRef} className="trailie-voice-immersive-caption">
          {captionText ? (
            <p>
              {captionText}
              {isStreaming && <span className="trailie-voice-caret" />}
            </p>
          ) : showIdle ? (
            <div className="trailie-voice-immersive-idle">
              <p>Ask me about a park or your next trip.</p>
              <div className="trailie-voice-dock-suggestions justify-center">
                {getSuggestedPrompts({ parkCode, pagePath }).slice(0, 3).map((q) => (
                  <span key={q} className="trailie-voice-chip">
                    {q}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
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
