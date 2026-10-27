'use client';

import VoiceWaveMark from './VoiceWaveMark';

/**
 * Disconnected guest-limit screen. No Mute/End Call — session is already closed.
 */
export default function VoiceAuthGate({ onDismiss, compact = false }) {
  return (
    <div
      className={`trailie-voice-auth${compact ? ' trailie-voice-auth--compact' : ''}`}
      role="region"
      aria-label="Voice session limit reached"
    >
      <div className="trailie-voice-auth-brand">
        <span className="trailie-voice-auth-mark">
          <VoiceWaveMark size="sm" tone="light" />
        </span>
        <p className="trailie-voice-auth-title">Trailie</p>
      </div>

      <p className="trailie-voice-auth-status" aria-live="polite">
        Free voice sessions used
      </p>
      <p className="trailie-voice-auth-copy">
        You&apos;ve used your free Trailie Voice chats. Create a free account to keep talking.
      </p>

      <div className="trailie-voice-auth-actions">
        <a href="/signup" className="trailie-voice-dock-cta">
          Create account
        </a>
        <a href="/login" className="trailie-voice-dock-link">
          Log in
        </a>
        <button type="button" className="trailie-voice-auth-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
