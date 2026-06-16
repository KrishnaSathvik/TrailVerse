'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Microphone, X } from '@components/icons';
import VoiceOverlay from './VoiceOverlay';
import { slugToParkCode } from '@/utils/parkSlug';
import { logVoiceSessionStart } from '@/utils/analytics';

const VOICE_HINT_DISMISSED_KEY = 'trailie-voice-hint-dismissed';
const LEGACY_VOICE_HINT_SESSION_KEY = 'trailie-voice-hint';
const SCROLL_TOP_THRESHOLD = 80;
const SCROLL_DELTA_THRESHOLD = 4;

function isVoiceHintDismissed() {
  if (typeof window === 'undefined') return false;

  try {
    if (localStorage.getItem(VOICE_HINT_DISMISSED_KEY) === '1') return true;
    // Migrate one-time from old session-only key
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
    // Ignore storage failures (private mode, quota, etc.)
  }
}

export default function VoiceButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const hintTimerRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const pathname = usePathname();

  // Hide on pages where voice chat isn't relevant
  const hiddenOnChat =
    pathname?.startsWith('/plan-ai') ||
    pathname?.startsWith('/blog') ||
    pathname?.startsWith('/map') ||
    pathname === '/magazine' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/testimonials' ||
    pathname === '/faq';

  // Detect park code from current URL
  const parkCode = (() => {
    const match = pathname?.match(/^\/parks\/([^/?#]+)/);
    if (match) return slugToParkCode(match[1]);
    return null;
  })();

  // Show hint once for first-time visitors; persist dismiss in localStorage.
  useEffect(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }

    if (hiddenOnChat || isVoiceHintDismissed()) {
      setShowHint(false);
      return undefined;
    }

    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      if (!isVoiceHintDismissed()) {
        setShowHint(true);
      }
    }, 3000);

    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };
  }, [hiddenOnChat]);

  useEffect(() => {
    setFabVisible(true);
    lastScrollYRef.current = 0;

    const autoHideTimer = setTimeout(() => {
      if (window.scrollY > SCROLL_TOP_THRESHOLD) {
        setFabVisible(false);
      }
    }, 3500);

    return () => clearTimeout(autoHideTimer);
  }, [pathname]);

  // Hide while scrolling down; reveal on scroll up or near top.
  useEffect(() => {
    if (hiddenOnChat) return undefined;

    lastScrollYRef.current = window.scrollY;
    let ticking = false;

    const revealFab = () => setFabVisible(true);
    const hideFab = () => setFabVisible(false);

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollYRef.current;

        if (currentY <= SCROLL_TOP_THRESHOLD) {
          revealFab();
        } else if (delta > SCROLL_DELTA_THRESHOLD) {
          hideFab();
        } else if (delta < -SCROLL_DELTA_THRESHOLD) {
          revealFab();
        }

        lastScrollYRef.current = currentY;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [hiddenOnChat]);

  if (hiddenOnChat) return null;

  const keepFabVisible = isOpen;
  const fabHidden = !keepFabVisible && !fabVisible;

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
    logVoiceSessionStart({ parkCode });
    setSessionKey(k => k + 1);
    setIsOpen(true);
  }

  return (
    <>
      {/* Hint tooltip */}
      {showHint && !isOpen && (
        <div
          className="trailie-voice-hint"
          style={{
            position: 'fixed',
            zIndex: 9997,
            bottom: '5.5rem',
            right: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1rem',
            borderRadius: '0.75rem',
            fontSize: '0.875rem',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 0 0 1px var(--border)',
            color: 'var(--text-primary)',
            maxWidth: '260px',
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease',
            transform: fabHidden ? 'translateY(calc(100% + 2rem))' : 'translateY(0)',
            opacity: fabHidden ? 0 : 1,
            pointerEvents: fabHidden ? 'none' : 'auto',
          }}
        >
          <span className="leading-snug">
            {parkCode
              ? 'Ask Trailie for insider tips, weather, or trip ideas — hands-free'
              : 'Ask Trailie to plan trips, compare parks, or get insider tips'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); dismissHint(); }}
            className="flex-shrink-0 p-0.5 rounded-md transition hover:opacity-70"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Voice FAB — wrapper handles hide/show so legacy CSS !important cannot block it */}
      <div
        className="trailie-voice-fab-host"
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9998,
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease',
          transform: fabHidden ? 'translateY(calc(100% + 2rem))' : 'translateY(0)',
          opacity: fabHidden ? 0 : 1,
          pointerEvents: fabHidden ? 'none' : 'auto',
        }}
        aria-hidden={fabHidden}
      >
        <div
          role="button"
          tabIndex={fabHidden ? -1 : 0}
          title="Talk to Trailie"
          aria-label="Talk to Trailie — voice assistant"
          className="trailie-voice-btn"
          onClick={openVoice}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openVoice();
            }
          }}
        >
          <Microphone size={24} weight="fill" />
        </div>
      </div>

      {isOpen && (
        <VoiceOverlay
          key={sessionKey}
          parkCode={parkCode}
          pagePath={pathname}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
