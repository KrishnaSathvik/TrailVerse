'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createAppIcon } from '@/components/icons/createAppIcon';
import { CircleNotchIcon, WaveformSlashIcon } from '@phosphor-icons/react';
import { X, Microphone } from '@components/icons';

const CircleNotch = createAppIcon(CircleNotchIcon);
const WaveformSlash = createAppIcon(WaveformSlashIcon);
import useRealtimeVoice from '@/hooks/useRealtimeVoice';
import parkSlugs from '@/data/park-slugs.json';

// Build parkCode → fullName lookup
const parkNameMap = {};
for (const p of parkSlugs) {
  parkNameMap[p.parkCode] = p.fullName;
}

function getParkFullName(code) {
  if (!code) return null;
  return parkNameMap[code.toLowerCase()] || code.toUpperCase();
}

// Map tool names to user-friendly labels
function getToolLabel(toolName) {
  switch (toolName) {
    case 'get_park_details': return 'Fetching live park data';
    case 'search_parks': return 'Searching parks';
    case 'plan_trip': return 'Building your itinerary';
    case 'compare_parks': return 'Comparing parks';
    case 'find_events': return 'Finding events';
    default: return 'Looking things up';
  }
}

export default function VoiceOverlay({ parkCode, pagePath, onClose }) {
  const {
    status, transcript, isTrailieSpeaking, isToolCalling, toolCallInfo, error, authRequired, connect, disconnect,
  } = useRealtimeVoice();

  const parkFullName = useMemo(() => getParkFullName(parkCode), [parkCode]);
  const captionRef = useRef(null);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Auto-connect (handles React Strict Mode)
  useEffect(() => {
    connect(parkCode);
    return () => { disconnect(); };
  }, [connect, parkCode]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Auto-scroll caption area
  useEffect(() => {
    if (captionRef.current) {
      captionRef.current.scrollTop = captionRef.current.scrollHeight;
    }
  }, [transcript]);

  function handleClose() {
    disconnect();
    onClose();
  }

  // Get the latest assistant response text (live caption)
  const lastAssistant = [...transcript].reverse().find(m => m.role === 'assistant');
  const captionText = lastAssistant?.text || '';
  const isStreaming = lastAssistant?.streaming;

  // Orb color
  const orbColor =
    status === 'error' ? 'var(--error, #ef4444)' :
    isToolCalling ? 'var(--accent-orange, #f97316)' :
    status === 'speaking' ? 'var(--accent-blue, #0ea5e9)' :
    status === 'listening' ? '#22c55e' :
    'var(--accent-green)';

  // Orb animation class
  const orbStateClass =
    status === 'listening' ? 'voice-mic-listening' :
    status === 'speaking' ? 'voice-mic-speaking' :
    status === 'connecting' ? 'voice-mic-connecting' :
    isToolCalling ? 'voice-mic-tool-calling' :
    status === 'error' ? 'voice-mic-error' :
    'voice-mic-idle';

  // Status line text
  const statusText =
    isToolCalling ? getToolLabel(toolCallInfo) :
    status === 'connecting' ? 'Connecting...' :
    status === 'listening' ? "You're speaking..." :
    status === 'speaking' ? 'Trailie is speaking' :
    status === 'error' ? 'Connection error' :
    'Listening';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
      role="dialog"
      aria-label="Talk to Trailie voice assistant"
      aria-modal="true"
    >
      {/* Brand header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="TrailVerse Logo" className="h-9 w-9 rounded-xl object-contain" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </p>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {parkCode ? parkFullName : 'Talk to Trailie'}
            </p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 transition"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          aria-label="Close voice assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Center content — orb + status + caption */}
      <div className="flex flex-col items-center w-full max-w-xl px-6" style={{ marginTop: '-2rem' }}>
        {/* Orb */}
        <div className={`voice-mic-ring ${orbStateClass}`} style={{ position: 'relative' }}>
          <div
            className="voice-mic-circle transition-colors duration-300"
            style={{ backgroundColor: orbColor }}
          >
            {status === 'connecting' ? (
              <CircleNotch size={36} weight="bold" className="voice-spinner text-white" />
            ) : status === 'error' ? (
              <WaveformSlash size={36} weight="fill" className="text-white" />
            ) : (
              <Microphone className="h-9 w-9 text-white" />
            )}
          </div>
          {/* Tool-calling spinner ring */}
          {isToolCalling && (
            <div
              className="absolute inset-0 rounded-full border-4 animate-spin"
              style={{
                borderColor: 'rgba(249, 115, 22, 0.2)',
                borderTopColor: 'var(--accent-orange, #f97316)',
              }}
            />
          )}
        </div>

        {/* Status line */}
        <div className="mt-5 flex items-center gap-2">
          {isToolCalling && (
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-orange, #f97316)', animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-orange, #f97316)', animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-orange, #f97316)', animationDelay: '300ms' }} />
            </div>
          )}
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {statusText}
          </p>
        </div>

        {error && !authRequired && (
          <p className="mt-2 text-sm" style={{ color: 'var(--error, #ef4444)' }}>
            {error}
          </p>
        )}

        {authRequired && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              You&apos;ve used your free voice chats. Sign up to keep talking to Trailie — it&apos;s free.
            </p>
            <div className="flex gap-3">
              <a
                href="/signup"
                className="inline-flex items-center px-5 py-2 rounded-xl text-sm font-semibold text-white transition"
                style={{ backgroundColor: 'var(--accent-green)' }}
              >
                Sign Up Free
              </a>
              <a
                href="/login"
                className="inline-flex items-center px-5 py-2 rounded-xl text-sm font-medium transition"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                Log In
              </a>
            </div>
          </div>
        )}

        {/* Live caption area */}
        <div
          ref={captionRef}
          className="mt-8 w-full max-h-[40vh] overflow-y-auto"
        >
          {captionText ? (
            <p
              className="text-center text-base sm:text-lg leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {captionText}
              {isStreaming && (
                <span
                  className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                  style={{ backgroundColor: 'var(--text-secondary)' }}
                />
              )}
            </p>
          ) : (
            !isToolCalling && status !== 'error' && status !== 'connecting' && (
              <div className="text-center space-y-3">
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Try asking...
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {(parkCode ? [
                    'What should I not miss here?',
                    'Any closures or alerts?',
                    'Best hikes for beginners?',
                  ] : pagePath?.startsWith('/events') ? [
                    'Events at Grand Canyon this week?',
                    'Ranger programs at Yellowstone?',
                    'Any stargazing events in Utah?',
                  ] : pagePath?.startsWith('/compare') ? [
                    'Compare Zion and Grand Canyon',
                    'Which has better hiking, Glacier or Yellowstone?',
                    'Yosemite vs Sequoia for families?',
                  ] : [
                    'What parks are near me?',
                    'Best parks to visit right now?',
                    'Top parks for first-timers?',
                  ]).map((q, i) => (
                    <span
                      key={i}
                      className="inline-block text-xs px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* Tool call data sources */}
        {isToolCalling && (
          <div className="mt-4 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent-green)' }}
            >
              NPS Data
            </span>
            {(toolCallInfo === 'get_park_details' || toolCallInfo === 'plan_trip') && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent-blue, #0ea5e9)' }}
              >
                Weather
              </span>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
