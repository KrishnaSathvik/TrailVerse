'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Send } from '@components/icons';
import MessageBubble from '@components/ai-chat/MessageBubble';
import TypingIndicator from '@components/ai-chat/TypingIndicator';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import DemoUserAvatar, { DEMO_GUEST_AVATAR } from '@/components/trailie-demo/DemoUserAvatar';
import {
  sanitizeTrailieDemoAnswer,
  withDemoGuestUpsellInBubble,
} from '@/lib/trailieDemoSanitize';
import { useDemoChatSounds } from '@/hooks/useDemoChatSounds';
import TrailieCompletionSoundToggle from '@components/plan-ai/TrailieCompletionSoundToggle';
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

const PHASE = {
  IDLE: 'idle',
  TYPING_QUESTION: 'typing-question',
  THINKING: 'thinking',
  STREAMING_ANSWER: 'streaming-answer',
  COMPLETE: 'complete',
};

const CHAR_MS_BASE = 40;
const CHAR_MS_SPACE = 58;
const CHAR_MS_PUNCT = 90;
const POST_TYPE_SETTLE_MS = 400;
const THINKING_MS = 1400;
const TURN_GAP_MS = 1200;
const STREAM_FRAME_MS = 16;

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

function advanceStreamIndex(text, index) {
  if (index >= text.length) return text.length;
  const remaining = text.length - index;
  let step = 10;
  if (remaining > 3000) step = 44;
  else if (remaining > 1500) step = 28;
  else if (remaining > 700) step = 18;
  return Math.min(text.length, index + step);
}

export default function TrailieInteractiveDemo({
  className = '',
  showHeader = true,
  showCta = true,
  autoPlay = true,
}) {
  const [activeIndex, setActiveIndex] = useState(() =>
    readTrailieDemoLastActiveIndex(DEMO_CACHE_VERSION, SCENARIOS.length)
  );
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [turnIndex, setTurnIndex] = useState(0);
  const [completedTurns, setCompletedTurns] = useState([]);
  const [typedQuestion, setTypedQuestion] = useState('');
  const [revealedAnswer, setRevealedAnswer] = useState('');
  const [showCurrentUser, setShowCurrentUser] = useState(false);
  const timersRef = useRef([]);
  const streamRafRef = useRef(null);
  const chatScrollRef = useRef(null);
  const lastScrollAtRef = useRef(0);
  /** scenario id → completed turns; restored from localStorage + updated as demos finish */
  const scenarioCacheRef = useRef(loadTrailieDemoScenarioMap(DEMO_CACHE_VERSION));
  const sounds = useDemoChatSounds();

  const scenario = SCENARIOS[activeIndex];
  const currentTurn = scenario?.turns?.[turnIndex];

  const cancelStreamRaf = useCallback(() => {
    if (streamRafRef.current) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
    cancelStreamRaf();
  }, [cancelStreamRaf]);

  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const scheduleChatScroll = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastScrollAtRef.current < 100) return;
    lastScrollAtRef.current = now;

    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (!force && distanceFromBottom > 96) return;
      el.scrollTop = el.scrollHeight;
    });
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
    clearTimers();
    setPhase(PHASE.IDLE);
    setTurnIndex(0);
    setTypedQuestion('');
    setRevealedAnswer('');
    setShowCurrentUser(false);
    lastScrollAtRef.current = 0;
  }, [clearTimers]);

  const showCachedScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      const cached = scenarioCacheRef.current.get(item?.id);
      if (!item || !cached?.length || cached.length !== item.turns.length) return false;

      resetPlaybackState();
      setActiveIndex(index);
      setCompletedTurns(cached);
      setTurnIndex(item.turns.length - 1);
      setPhase(PHASE.COMPLETE);
      return true;
    },
    [resetPlaybackState]
  );

  const streamAnswer = useCallback(
    (text, onDone) => {
      let index = 0;
      let lastTick = 0;

      const step = (timestamp) => {
        if (!lastTick || timestamp - lastTick >= STREAM_FRAME_MS) {
          lastTick = timestamp;
          index = advanceStreamIndex(text, index);
          setRevealedAnswer(text.slice(0, index));
          scheduleChatScroll();
        }

        if (index < text.length) {
          streamRafRef.current = requestAnimationFrame(step);
        } else {
          streamRafRef.current = null;
          onDone();
        }
      };

      streamRafRef.current = requestAnimationFrame(step);
    },
    [scheduleChatScroll]
  );

  const playTurn = useCallback(
    (scenarioIndex, nextTurnIndex) => {
      const item = SCENARIOS[scenarioIndex];
      const turn = item?.turns?.[nextTurnIndex];
      if (!item || !turn) return;

      setTurnIndex(nextTurnIndex);
      setPhase(PHASE.TYPING_QUESTION);
      setTypedQuestion('');
      setRevealedAnswer('');
      setShowCurrentUser(false);

      let charIndex = 0;

      const finishTyping = () => {
        const settleMs = Math.max(POST_TYPE_SETTLE_MS, sounds.keyTailMs || 0);
        schedule(() => {
          setShowCurrentUser(true);
          setTypedQuestion('');
          setPhase(PHASE.THINKING);
          scheduleChatScroll(true);
          schedule(() => {
            setPhase(PHASE.STREAMING_ANSWER);
            streamAnswer(turn.answer, () => {
              setShowCurrentUser(false);
              setRevealedAnswer('');
              setCompletedTurns((prev) => [
                ...prev,
                {
                  question: turn.question,
                  answer: turn.answer,
                  metadata: turn.metadata,
                },
              ]);

              if (nextTurnIndex + 1 < item.turns.length) {
                schedule(() => playTurn(scenarioIndex, nextTurnIndex + 1), TURN_GAP_MS);
              } else {
                const cachedTurns = turnsToCache(item);
                scenarioCacheRef.current.set(item.id, cachedTurns);
                persistTrailieDemoScenario(
                  DEMO_CACHE_VERSION,
                  item.id,
                  cachedTurns,
                  scenarioIndex
                );
                setPhase(PHASE.COMPLETE);
                scheduleChatScroll(true);
              }

              sounds.playCompletion();
            });
          }, THINKING_MS);
        }, settleMs);
      };

      const typeNext = () => {
        charIndex += 1;
        const char = turn.question[charIndex - 1];
        setTypedQuestion(turn.question.slice(0, charIndex));
        sounds.playTypingTick(char);

        if (charIndex < turn.question.length) {
          schedule(typeNext, typingDelayMs(char));
        } else {
          finishTyping();
        }
      };

      schedule(typeNext, nextTurnIndex === 0 ? 450 : 600);
    },
    [schedule, scheduleChatScroll, streamAnswer, turnsToCache, sounds]
  );

  const beginWithSound = useCallback(() => {
    sounds.prime();
  }, [sounds]);

  const runScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      if (!item) return;

      beginWithSound();

      if (showCachedScenario(index)) {
        persistTrailieDemoActiveIndex(DEMO_CACHE_VERSION, index);
        scheduleChatScroll(true);
        return;
      }

      resetPlaybackState();
      setActiveIndex(index);
      persistTrailieDemoActiveIndex(DEMO_CACHE_VERSION, index);
      setCompletedTurns([]);
      playTurn(index, 0);
    },
    [playTurn, resetPlaybackState, showCachedScenario, scheduleChatScroll, beginWithSound]
  );

  const handleSelectScenario = (index) => {
    if (index === activeIndex) {
      if (phase === PHASE.COMPLETE && scenarioCacheRef.current.has(SCENARIOS[index]?.id)) return;
      if (phase !== PHASE.IDLE && phase !== PHASE.COMPLETE) return;
    }
    runScenario(index);
  };

  useEffect(() => {
    if (autoPlay) {
      runScenario(activeIndex);
    }
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + strict-mode remount
  }, []);

  useEffect(() => {
    if (phase === PHASE.TYPING_QUESTION && turnIndex === 0) return;
    if (phase === PHASE.STREAMING_ANSWER) return;
    scheduleChatScroll(true);
  }, [phase, turnIndex, completedTurns.length, showCurrentUser, scheduleChatScroll]);

  const thinkingLabel = useMemo(() => {
    const meta = currentTurn?.metadata;
    if (meta?.hasWebSearch) return 'Searching live web results...';
    if (meta?.hasLiveData) return 'Pulling NPS live data...';
    return 'Trailie is thinking...';
  }, [currentTurn]);

  const isTyping = phase === PHASE.TYPING_QUESTION;
  const isThinking = phase === PHASE.THINKING;
  const isStreaming = phase === PHASE.STREAMING_ANSWER;
  const showAssistant = isStreaming;
  const showChat =
    (isTyping && turnIndex > 0) ||
    completedTurns.length > 0 ||
    showCurrentUser ||
    isThinking ||
    showAssistant;
  const composeLabel = turnIndex > 0 ? 'Follow-up' : 'Sample question';

  return (
    <div
      className={`w-full min-w-0 ${className}`}
      onPointerDownCapture={() => sounds.prime()}
    >
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-2.5">
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
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-6 sm:py-4"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
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
          <div className="flex shrink-0 items-center gap-1.5">
            <TrailieCompletionSoundToggle
              enabled={sounds.enabled}
              onToggle={sounds.toggleEnabled}
              offBackground="var(--bg-primary)"
              ariaLabelOn="Sounds on — typing clicks and reply-complete chime"
              ariaLabelOff="Sounds off — enable typing clicks and reply-complete chime"
              titleOn="Sounds on"
              titleOff="Sounds off — typing clicks and reply-complete chime"
            />
          </div>
        </div>

        {showChat && (
          <div
            ref={chatScrollRef}
            className="min-h-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y px-3.5 py-4 sm:px-6 sm:py-5"
            style={{
              backgroundColor: 'var(--bg-primary)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
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

              {showCurrentUser && currentTurn && (
                <MessageBubble
                  message={currentTurn.question}
                  isUser
                  hideActions
                  compact
                  userAvatar={DEMO_GUEST_AVATAR}
                />
              )}

              {isThinking && <TypingIndicator text={thinkingLabel} sources={currentTurn?.metadata?.hasWebSearch ? ['web'] : undefined} />}

              {showAssistant && currentTurn && revealedAnswer && (
                <MessageBubble
                  message={revealedAnswer}
                  isUser={false}
                  hideActions
                  linkifyParks={false}
                  isStreaming
                  compact
                  hasLiveData={currentTurn.metadata?.hasLiveData}
                  hasWebSearch={currentTurn.metadata?.hasWebSearch}
                  liveDataParks={[]}
                />
              )}
            </div>
          </div>
        )}

        {isTyping && (
          <div
            className={`shrink-0 px-4 py-5 sm:px-6 sm:py-5 ${showChat ? 'border-t' : 'flex-1'}`}
            style={showChat ? { borderColor: 'var(--border)', backgroundColor: 'var(--surface)' } : undefined}
            aria-live="polite"
          >
            <div className="w-full">
              <div className="mb-3 flex items-center gap-2.5">
                <DemoUserAvatar className="h-9 w-9" />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {composeLabel}
                </span>
              </div>
              <div className="flex items-end gap-2.5 sm:gap-3">
                <div
                  className="flex-1 min-w-0 rounded-2xl px-4 py-3.5 sm:py-4 text-sm sm:text-base leading-relaxed min-h-[3.25rem] sm:min-h-[3.5rem]"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {typedQuestion || '\u00a0'}
                  <span
                    className="inline-block w-0.5 h-[1.1em] ml-0.5 align-text-bottom animate-pulse"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                    aria-hidden="true"
                  />
                </div>
                <div
                  className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    opacity: typedQuestion ? 1 : 0.45,
                  }}
                  aria-hidden="true"
                >
                  <Send className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        )}
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
