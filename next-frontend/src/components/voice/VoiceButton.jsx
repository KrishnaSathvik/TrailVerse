'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from '@components/icons';
import { useVoiceSession } from '@/context/VoiceSessionContext';
import VoiceDock from './VoiceDock';
import VoiceImmersive from './VoiceImmersive';

const VOICE_HINT_DISMISSED_KEY = 'trailie-voice-hint-dismissed';
const LEGACY_VOICE_HINT_SESSION_KEY = 'trailie-voice-hint';
const SCROLL_COMPACT_THRESHOLD = 48;

function isVoiceHintDismissed() {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(VOICE_HINT_DISMISSED_KEY) === '1') return true;
    if (sessionStorage.getItem(LEGACY_VOICE_HINT_SESSION_KEY) === '1') {
      localStorage.setItem(VOICE_HINT_DISMISSED_KEY, '1');
      sessionStorage.removeItem(LEGACY_VOICE_HINT_SESSION_KEY);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function persistVoiceHintDismissed() {
  try {
    localStorage.setItem(VOICE_HINT_DISMISSED_KEY, '1');
    sessionStorage.removeItem(LEGACY_VOICE_HINT_SESSION_KEY);
  } catch {
    // ignore
  }
}

export default function VoiceButton() {
  const pathname = usePathname();
  const {
    uiMode,
    hidden,
    parkCode,
    startSession,
  } = useVoiceSession();

  const [showHint, setShowHint] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const hintTimerRef = useRef(null);

  const sessionOpen = uiMode !== 'closed';
  const suppressHint = hidden || pathname === '/' || sessionOpen;
  const compact = scrolled;

  useEffect(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    if (suppressHint || isVoiceHintDismissed()) {
      setShowHint(false);
      return undefined;
    }
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      if (!isVoiceHintDismissed()) setShowHint(true);
    }, 4000);
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [suppressHint]);

  useEffect(() => {
    setScrolled(window.scrollY > SCROLL_COMPACT_THRESHOLD);
  }, [pathname]);

  useEffect(() => {
    if (hidden || sessionOpen) return undefined;
    let ticking = false;
    const syncScroll = () => {
      setScrolled(window.scrollY > SCROLL_COMPACT_THRESHOLD);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        syncScroll();
        ticking = false;
      });
    };
    syncScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hidden, sessionOpen]);

  if (hidden) return null;

  function dismissHint() {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    persistVoiceHintDismissed();
    setShowHint(false);
  }

  function openVoice() {
    dismissHint();
    startSession();
  }

  return (
    <>
      {showHint && uiMode === 'closed' && (
        <div
          className={`trailie-voice-hint${compact ? ' trailie-voice-hint--compact' : ''}`}
        >
          <span className="leading-snug">
            {parkCode
              ? 'Ask Trailie for tips, weather, or trip ideas — hands-free'
              : 'Talk to Trailie while you browse'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissHint();
            }}
            className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-md transition hover:opacity-70"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {uiMode === 'closed' && (
        <div
          className={`trailie-voice-launcher-host${compact ? ' is-compact' : ''}`}
        >
          <button
            type="button"
            className={`trailie-voice-launcher${compact ? ' is-compact' : ''}`}
            aria-label="Talk to Trailie"
            onClick={openVoice}
          >
            <span className="trailie-voice-launcher-icon" aria-hidden="true">
              <span className="trailie-voice-launcher-wave">
                <i /><i /><i /><i /><i />
              </span>
            </span>
            <span className="trailie-voice-launcher-label">Talk to Trailie</span>
          </button>
        </div>
      )}

      {uiMode === 'docked' && <VoiceDock />}
      {uiMode === 'immersive' && <VoiceImmersive />}
    </>
  );
}
