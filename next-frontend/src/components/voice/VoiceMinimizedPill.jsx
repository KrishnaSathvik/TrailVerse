'use client';

import { createAppIcon } from '@/components/icons/createAppIcon';
import { PhoneDisconnectIcon } from '@phosphor-icons/react';
import { useVoiceSession } from '@/context/VoiceSessionContext';
import VoiceWaveform from './VoiceWaveform';
import VoiceWaveMark from './VoiceWaveMark';
import { getVoiceStatusText } from '@/lib/voiceStatusCopy';

const PhoneDisconnect = createAppIcon(PhoneDisconnectIcon);

export default function VoiceMinimizedPill() {
  const {
    status,
    isToolCalling,
    toolCallInfo,
    userMuted,
    permissionDenied,
    authRequired,
    audioLevel,
    micActive,
    dock,
    endCall,
  } = useVoiceSession();

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
    : status === 'speaking'
      ? 'speak'
      : status === 'listening' || status === 'connected'
        ? 'listen'
        : 'idle';

  return (
    <div className="trailie-voice-mini" role="status" aria-live="polite">
      <button
        type="button"
        className="trailie-voice-mini-main"
        onClick={dock}
        aria-label={`Trailie Voice ${statusText}. Activate to expand dock. Microphone ${micActive ? 'on' : 'off'}.`}
      >
        <VoiceWaveMark size="sm" tone="light" />
        <VoiceWaveform level={audioLevel} variant={waveVariant} bars={4} />
        <span className="trailie-voice-mini-label">{statusText}</span>
        {micActive && !userMuted && (
          <span className="trailie-voice-mini-dot" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="trailie-voice-mini-end"
        onClick={endCall}
        aria-label="End call"
      >
        <PhoneDisconnect size={16} weight="fill" />
      </button>
    </div>
  );
}
