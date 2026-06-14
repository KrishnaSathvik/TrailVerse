'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from '@components/icons';
import MessageBubble from '@components/ai-chat/MessageBubble';
import TypingIndicator from '@components/ai-chat/TypingIndicator';
import DemoChatComposer from '@/components/trailie-demo/DemoChatComposer';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import { DEMO_GUEST_AVATAR } from '@/components/trailie-demo/DemoUserAvatar';
import {
  sanitizeTrailieDemoAnswer,
  withDemoGuestUpsellInBubble,
} from '@/lib/trailieDemoSanitize';
import demoData from '@/data/trailieDemoResponses.json';
import {
  loadTrailieDemoScenarioMap,
  persistTrailieDemoActiveIndex,
  persistTrailieDemoScenario,
  readTrailieDemoLastActiveIndex,
} from '@/lib/trailieDemoScenarioCache';

function normalizeScenario(item) {
  const rawTurns = item.turns?.length
    ? item.turns
    : [{ question: item.question, answer: item.answer, metadata: item.metadata || {} }];

  const turns = rawTurns.map((turn) => ({
    question: turn.question,
    answer: withDemoGuestUpsellInBubble(
      sanitizeTrailieDemoAnswer(turn.answer),
      turn.metadata || item.metadata
    ),
    metadata: { ...(item.metadata || {}), ...(turn.metadata || {}) },
  }));

  return { ...item, turns };
}

const SCENARIOS = demoData.scenarios.map(normalizeScenario);
const DEMO_CACHE_VERSION = demoData.version;

/** Bump when demo playback behavior changes so stale localStorage transcripts are ignored. */
const DEMO_PLAYBACK_CACHE_VERSION = `${demoData.version}-playback-v6`;

const PHASE = {
  IDLE: 'idle',
  TYPING_QUESTION: 'typing-question',
  THINKING: 'thinking',
  COMPLETE: 'complete',
};

const CHAR_MS_BASE = 32;
const CHAR_MS_SPACE = 46;
const CHAR_MS_PUNCT = 72;
const THINKING_MS = 1000;
const TURN_GAP_MS = 700;

const DEMO_CTA = {
  title: 'Plan your own trip',
  body: 'Ask Trailie anything — add follow-ups, save your itinerary, or chat by voice. Share your dates and where you’re starting from so the advice fits your trip.',
  accountNote: 'Guests get 5 free messages. Sign up to save trips and download a PDF.',
  button: 'Open Trailie',
};

function typingDelayMs(char) {
  if (char === ' ' || char === '\n') return CHAR_MS_SPACE;
  if (/[.,!?;:]/.test(char)) return CHAR_MS_PUNCT;
  return CHAR_MS_BASE;
}

export default function TrailieInteractiveDemo({
  className = '',
  showHeader = true,
  showCta = true,
  autoPlay = true,
}) {
  const [activeIndex, setActiveIndex] = useState(() =>
    readTrailieDemoLastActiveIndex(DEMO_PLAYBACK_CACHE_VERSION, SCENARIOS.length)
  );
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [completedTurns, setCompletedTurns] = useState([]);
  const [typedQuestion, setTypedQuestion] = useState('');
  const [sentQuestion, setSentQuestion] = useState('');
  const [turnMetadata, setTurnMetadata] = useState(null);
  const timersRef = useRef([]);
  const playbackTokenRef = useRef(0);
  const chatScrollRef = useRef(null);
  const scenarioCacheRef = useRef(loadTrailieDemoScenarioMap(DEMO_PLAYBACK_CACHE_VERSION));

  const scrollChatToTop = useCallback(() => {
    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      el.scrollTo({ top: 0, behavior: 'instant' });
    });
  }, []);

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  /** Multi-turn follow-ups (Discover turn 2+) need scroll; single-turn stays pinned to top. */
  const scrollForTurn = useCallback(
    (scenarioIndex, turnIndex) => {
      const item = SCENARIOS[scenarioIndex];
      const isFollowUp = (item?.turns?.length ?? 0) > 1 && turnIndex >= 1;
      if (isFollowUp) {
        scrollChatToBottom();
      } else {
        scrollChatToTop();
      }
    },
    [scrollChatToBottom, scrollChatToTop]
  );

  const scenario = SCENARIOS[activeIndex];

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const turnsToCache = useCallback((item) => {
    if (!item?.turns?.length) return [];
    return item.turns.map((turn) => ({
      question: turn.question,
      answer: turn.answer,
      metadata: turn.metadata,
    }));
  }, []);

  const resetPlaybackState = useCallback(() => {
    playbackTokenRef.current += 1;
    clearTimers();
    setPhase(PHASE.IDLE);
    setTypedQuestion('');
    setSentQuestion('');
    setTurnMetadata(null);
  }, [clearTimers]);

  const playTurn = useCallback(
    (scenarioIndex, nextTurnIndex, token) => {
      const item = SCENARIOS[scenarioIndex];
      const turn = item?.turns?.[nextTurnIndex];
      if (!item || !turn || token !== playbackTokenRef.current) return;

      setPhase(PHASE.TYPING_QUESTION);
      setTypedQuestion('');
      setSentQuestion('');
      setTurnMetadata(turn.metadata);
      scrollForTurn(scenarioIndex, nextTurnIndex);

      let charIndex = 0;

      const finishTyping = () => {
        if (token !== playbackTokenRef.current) return;

        setTypedQuestion('');
        setSentQuestion(turn.question);
        setPhase(PHASE.THINKING);
        scrollForTurn(scenarioIndex, nextTurnIndex);

        schedule(() => {
          if (token !== playbackTokenRef.current) return;

          setSentQuestion('');
          setCompletedTurns((prev) => [
            ...prev,
            {
              question: turn.question,
              answer: turn.answer,
              metadata: turn.metadata,
            },
          ]);

          if (nextTurnIndex + 1 < item.turns.length) {
            schedule(() => {
              if (token !== playbackTokenRef.current) return;
              playTurn(scenarioIndex, nextTurnIndex + 1, token);
            }, TURN_GAP_MS);
          } else {
            const cachedTurns = turnsToCache(item);
            scenarioCacheRef.current.set(item.id, cachedTurns);
            persistTrailieDemoScenario(DEMO_PLAYBACK_CACHE_VERSION, item.id, cachedTurns, scenarioIndex);
            setPhase(PHASE.COMPLETE);
          }
          scrollForTurn(scenarioIndex, nextTurnIndex);
        }, THINKING_MS);
      };

      const typeNext = () => {
        if (token !== playbackTokenRef.current) return;

        charIndex += 1;
        const char = turn.question[charIndex - 1];
        setTypedQuestion(turn.question.slice(0, charIndex));

        if (charIndex < turn.question.length) {
          schedule(typeNext, typingDelayMs(char));
        } else {
          finishTyping();
        }
      };

      schedule(typeNext, nextTurnIndex === 0 ? 400 : 550);
    },
    [schedule, scrollForTurn, turnsToCache]
  );

  const runScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      if (!item) return;

      resetPlaybackState();
      const token = playbackTokenRef.current;
      setActiveIndex(index);
      persistTrailieDemoActiveIndex(DEMO_PLAYBACK_CACHE_VERSION, index);
      setCompletedTurns([]);
      scrollChatToTop();
      playTurn(index, 0, token);
    },
    [playTurn, resetPlaybackState, scrollChatToTop]
  );

  const handleSelectScenario = (index) => {
    if (index === activeIndex && phase !== PHASE.IDLE && phase !== PHASE.COMPLETE) return;
    runScenario(index);
  };

  useEffect(() => {
    if (autoPlay) {
      runScenario(activeIndex);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + strict-mode remount
  }, []);

  const isTyping = phase === PHASE.TYPING_QUESTION;
  const isThinking = phase === PHASE.THINKING;
  const showChat = completedTurns.length > 0 || isTyping || isThinking;

  const thinkingLabel = useMemo(() => {
    const meta = turnMetadata;
    if (meta?.hasWebSearch) return 'Searching live web results...';
    if (meta?.hasLiveData) return 'Pulling NPS live data...';
    return 'Trailie is thinking...';
  }, [turnMetadata]);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      {showHeader && (
        <div className="mb-5 sm:mb-6 text-center">
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Live Trailie demo
          </h2>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-pretty" style={{ color: 'var(--text-secondary)' }}>
            Recorded from Trailie chat. Pick a sample question below.
          </p>
        </div>
      )}

      <div className="mb-4 sm:mb-6" role="tablist" aria-label="Demo scenarios">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
          {SCENARIOS.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectScenario(index)}
                className="rounded-full px-3 py-2 sm:px-4 sm:py-2.5 text-[11px] sm:text-sm font-medium transition-all duration-200 sm:hover:-translate-y-0.5 text-center sm:shrink-0"
                style={{
                  backgroundColor: isActive ? 'var(--accent-green)' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  borderWidth: '1px',
                  borderColor: isActive ? 'var(--accent-green)' : 'var(--border)',
                }}
              >
                <span className="block truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="mx-auto flex h-[min(72dvh,40rem)] w-full min-w-0 flex-col overflow-hidden rounded-2xl shadow-sm sm:h-[min(68vh,36rem)] sm:max-h-[36rem] sm:rounded-3xl sm:shadow-lg"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <div
          className="flex shrink-0 items-center gap-3 border-b px-4 py-3.5 sm:px-6 sm:py-4"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <TrailieAvatar className="!h-9 !w-9 sm:!h-10 sm:!w-10 shrink-0" />
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--accent-green)' }}
            >
              Trailie
            </p>
            <p className="truncate text-sm font-semibold sm:text-base" style={{ color: 'var(--text-primary)' }}>
              {scenario?.chatTitle || scenario?.metadata?.parkName || 'National park planning'}
            </p>
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y px-3.5 py-4 sm:px-6 sm:py-5"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {!showChat ? (
              <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Select a sample above to see Trailie&apos;s reply.
              </p>
            ) : (
              <div className="w-full min-w-0 space-y-4 sm:space-y-5">
                {completedTurns.map((turn, index) => (
                  <div key={`turn-${index}`} className="space-y-4 sm:space-y-5">
                    <MessageBubble
                      message={turn.question}
                      isUser
                      hideActions
                      compact
                      userAvatar={DEMO_GUEST_AVATAR}
                    />
                    <MessageBubble
                      message={turn.answer}
                      isUser={false}
                      hideActions
                      linkifyParks
                      compact
                      hasLiveData={turn.metadata?.hasLiveData}
                      hasWebSearch={turn.metadata?.hasWebSearch}
                      liveDataParks={[]}
                    />
                  </div>
                ))}

                {isThinking && sentQuestion && (
                  <>
                    <MessageBubble
                      message={sentQuestion}
                      isUser
                      hideActions
                      compact
                      userAvatar={DEMO_GUEST_AVATAR}
                    />
                    <TypingIndicator
                      text={thinkingLabel}
                      sources={turnMetadata?.hasWebSearch ? ['web'] : undefined}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          <div
            className="shrink-0 border-t px-3.5 py-3 sm:px-6 sm:py-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
          >
            <DemoChatComposer
              value={typedQuestion}
              isTyping={isTyping}
            />
          </div>
        </div>
      </div>

      {showCta && (
        <div className="mt-4 sm:mt-6">
          <div
            className="rounded-2xl p-4 sm:p-6 text-left"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
            }}
          >
            <div className="mb-4 flex items-start gap-3 sm:gap-4">
              <TrailieAvatar className="!h-10 !w-10 sm:!h-11 sm:!w-11 shrink-0" />
              <div className="min-w-0">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--accent-green)' }}
                >
                  Trailie
                </p>
                <h3
                  className="mt-0.5 text-lg font-semibold sm:text-xl leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {DEMO_CTA.title}
                </h3>
              </div>
            </div>
            <p className="mb-4 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {DEMO_CTA.body}
            </p>
            <Link
              href="/plan-ai"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              {DEMO_CTA.button}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-center text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {DEMO_CTA.accountNote}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
