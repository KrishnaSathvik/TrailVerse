'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import TrailieDemoCta from '@/components/trailie-demo/TrailieDemoCta';
import TrailieDemoPlaybackStage from '@/components/trailie-demo/TrailieDemoPlaybackStage';
import { sanitizeTrailieDemoAnswer } from '@/lib/trailieDemoSanitize';
import playbackData from '@/data/trailieDemoPlayback.json';
import {
  PLAYBACK_TIMING,
  normalizePlaybackScenario,
  playbackBeatsForTurn,
  thinkingLabelForTurn,
  typingDelayMs,
} from '@/lib/trailieDemoPlaybackSchema';
import {
  loadTrailieDemoScenarioMap,
  persistTrailieDemoActiveIndex,
  persistTrailieDemoScenario,
  readTrailieDemoLastActiveIndex,
} from '@/lib/trailieDemoScenarioCache';

const DEMO_DESTINATIONS = {
  discovery: 'Shenandoah National Park',
  'zion-bryce': 'Zion and Bryce Canyon National Parks',
  realistic: 'Yosemite, Sequoia and Kings Canyon',
  yellowstone: 'Yellowstone National Park',
  glacier: 'Glacier National Park',
};

function demoPresentation(scenario, _turnIndex, turn) {
  if (turn?.presentation) return turn.presentation;
  const kind = turn.plan ? 'itinerary' : 'plain_answer';
  return {
    schemaVersion: 1,
    presentationKind: kind,
    refinement: { isRefinement: false, changes: [] },
    primaryArtifact: { kind, source: turn.plan ? 'canonicalPlan' : 'content' },
    supportingModules: [],
    prosePolicy: 'full',
    ending: { caveat: null, beforeYouGo: null, followups: [] },
  };
}

/**
 * These are /trailie-demo's OWN scenarios, loaded from its own fixture. This
 * file deliberately does not import `@/lib/trailieDemoPrompts` — those are the
 * /plan-ai starter chips and serve a different purpose.
 */
export const SCENARIOS = playbackData.scenarios.map((item) => {
  const scenario = normalizePlaybackScenario(item);
  return {
    ...scenario,
    turns: scenario.turns.map((turn, turnIndex) => {
      const plan = turn.plan
        ? { ...turn.plan, parkName: turn.plan.parkName || DEMO_DESTINATIONS[scenario.id] }
        : null;
      const canonicalTurn = { ...turn, plan, canonicalPlan: plan };
      const liveEnvelope = turn.source === 'live-envelope' || Boolean(turn.presentation);
      return {
        ...canonicalTurn,
        parkName: turn.parkName || DEMO_DESTINATIONS[scenario.id] || null,
        prose: liveEnvelope ? turn.prose : sanitizeTrailieDemoAnswer(turn.prose),
        content: liveEnvelope ? (turn.content || turn.prose) : sanitizeTrailieDemoAnswer(turn.prose),
        intent: turn.intent || {
          primaryIntent: scenario.kind,
          verticals: [],
          reasonCodes: [],
        },
        presentation: demoPresentation(scenario, turnIndex, canonicalTurn),
      };
    }),
  };
});

/**
 * Cache key for persisted transcripts.
 *
 * It must change whenever the ANSWERS change, not just when playback code
 * changes — otherwise a visitor who saw the previous capture keeps replaying it
 * from localStorage and never sees the new one. The signature below is derived
 * from the fixture's own content, so re-importing captures invalidates old
 * transcripts automatically. Bump the trailing number for behavior changes.
 */
// Include canonical identity/provenance as well as answer text in cache invalidation.
let fixtureHash = 2166136261;
for (const character of JSON.stringify(playbackData)) {
  fixtureHash = Math.imul(fixtureHash ^ character.charCodeAt(0), 16777619);
}
const fixtureSignature = (fixtureHash >>> 0).toString(16);
const DEMO_PLAYBACK_CACHE_VERSION = `v${playbackData.schemaVersion}-playback-v14-${fixtureSignature}`;

const PHASE = { IDLE: 'idle', TYPING: 'typing', PLAYING: 'playing', PAUSED: 'paused', COMPLETE: 'complete' };

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
  /** The turn currently being revealed, plus which beat it is on. */
  const [activeTurn, setActiveTurn] = useState(null);

  const timersRef = useRef([]);
  const playbackTokenRef = useRef(0);
  const scenarioCacheRef = useRef(loadTrailieDemoScenarioMap(DEMO_PLAYBACK_CACHE_VERSION));

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

  /** Cancels any in-flight playback. Bumping the token orphans pending timers. */
  const resetPlaybackState = useCallback(() => {
    playbackTokenRef.current += 1;
    clearTimers();
    setPhase(PHASE.IDLE);
    setTypedQuestion('');
    setActiveTurn(null);
  }, [clearTimers]);

  const hydrateFromCache = useCallback((item) => {
    const cached = scenarioCacheRef.current.get(item.id);
    // Restore the visitor's reading position without advancing an unseen turn.
    if (!cached?.length || cached.length > item.turns.length) return false;

    setCompletedTurns(cached);
    setPhase(cached.length === item.turns.length ? PHASE.COMPLETE : PHASE.PAUSED);
    setTypedQuestion('');
    setActiveTurn(null);
    return true;
  }, []);

  /**
   * Plays one turn as an explicit beat sequence.
   *
   *   conversation → thinking → prose
   *   itinerary    → thinking → intro → prose
   *
   * The intro beat is the spoken opening only. The day card arrives with the
   * finished turn, so the itinerary never appears above an intro that has not
   * been written yet. A turn with no plan cannot reach that card.
   */
  const playTurn = useCallback(
    (scenarioIndex, turnIndex, token) => {
      const item = SCENARIOS[scenarioIndex];
      const turn = item?.turns?.[turnIndex];
      if (!item || !turn || token !== playbackTokenRef.current) return;

      const beats = playbackBeatsForTurn(turn);
      const thinkingLabel = thinkingLabelForTurn(turn);

      const commitTurn = () => {
        if (token !== playbackTokenRef.current) return;

        setActiveTurn(null);
        setCompletedTurns((prev) => {
          const nextTurns = [...prev, turn];
          // Persist progress so switching tabs mid-scenario doesn't lose the
          // transcript on refresh.
          scenarioCacheRef.current.set(item.id, nextTurns);
          persistTrailieDemoScenario(DEMO_PLAYBACK_CACHE_VERSION, item.id, nextTurns, scenarioIndex);
          return nextTurns;
        });

        if (turnIndex + 1 < item.turns.length) {
          setPhase(PHASE.PAUSED);
        } else {
          setPhase(PHASE.COMPLETE);
        }
      };

      const runBeat = (beatIndex) => {
        if (token !== playbackTokenRef.current) return;

        const beat = beats[beatIndex];
        if (!beat || beat === 'prose') {
          commitTurn();
          return;
        }

        setActiveTurn({ ...turn, beat, thinkingLabel });
        const holdMs = beat === 'intro' ? PLAYBACK_TIMING.writingMs : PLAYBACK_TIMING.thinkingMs;
        schedule(() => runBeat(beatIndex + 1), holdMs);
      };

      const startReveal = () => {
        if (token !== playbackTokenRef.current) return;
        setTypedQuestion('');
        setPhase(PHASE.PLAYING);
        runBeat(0);
      };

      setPhase(PHASE.TYPING);
      setTypedQuestion('');
      setActiveTurn(null);

      let charIndex = 0;
      const typeNext = () => {
        if (token !== playbackTokenRef.current) return;

        charIndex += 1;
        const char = turn.question[charIndex - 1];
        setTypedQuestion(turn.question.slice(0, charIndex));

        if (charIndex < turn.question.length) {
          schedule(typeNext, typingDelayMs(char));
        } else {
          startReveal();
        }
      };

      schedule(
        typeNext,
        turnIndex === 0 ? PLAYBACK_TIMING.leadInMs : PLAYBACK_TIMING.followUpLeadInMs
      );
    },
    [schedule]
  );

  const runScenario = useCallback(
    (index) => {
      const item = SCENARIOS[index];
      if (!item) return;

      resetPlaybackState();
      setActiveIndex(index);
      persistTrailieDemoActiveIndex(DEMO_PLAYBACK_CACHE_VERSION, index);

      if (hydrateFromCache(item)) return;

      const token = playbackTokenRef.current;
      setCompletedTurns([]);
      playTurn(index, 0, token);
    },
    [playTurn, resetPlaybackState, hydrateFromCache]
  );

  const handleSelectScenario = (index) => {
    if (index === activeIndex && phase !== PHASE.IDLE) return;
    runScenario(index);
  };

  useEffect(() => {
    if (autoPlay) runScenario(activeIndex);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + strict-mode remount
  }, []);

  const isTyping = phase === PHASE.TYPING;
  const showMessagePane = completedTurns.length > 0 || Boolean(activeTurn);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      {showHeader && (
        <div className="mb-5 sm:mb-6 shrink-0 text-center">
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Trailie conversations
          </h2>
          <p
            className="mt-2 text-sm sm:text-base leading-relaxed text-pretty"
            style={{ color: 'var(--text-secondary)' }}
          >
            Explore five recorded conversations, from choosing a park to refining a trip.
            Each includes real follow-up questions and Trailie’s answers.
          </p>
        </div>
      )}

      <div className="mb-5 shrink-0 border-b border-[var(--border)] pb-4 sm:mb-6" role="tablist" aria-label="Demo scenarios">
        <div className="flex gap-2 overflow-x-auto pb-1 sm:gap-2.5 lg:justify-between">
          {SCENARIOS.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectScenario(index)}
                className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium lg:px-5 lg:font-semibold transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--accent-green)' : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  borderWidth: '1px',
                  borderColor: isActive ? 'var(--accent-green)' : 'var(--border)',
                  boxShadow: isActive ? '0 10px 24px rgba(67, 160, 106, 0.15)' : 'none',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        <TrailieDemoPlaybackStage
          scenario={scenario}
          completedTurns={completedTurns}
          isTyping={isTyping}
          typedQuestion={typedQuestion}
          activeTurn={activeTurn}
          showMessagePane={showMessagePane}
        />
      </div>

      {phase === PHASE.PAUSED && (
        <div className="public-reading mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
            Question {completedTurns.length} of {scenario.turns.length}
          </p>
          <button type="button"
            className="min-h-11 rounded-full bg-[var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-green)]"
            onClick={() => {
              if (phase === PHASE.PAUSED) playTurn(activeIndex, completedTurns.length, playbackTokenRef.current);
            }}>
            Next question
          </button>
        </div>
      )}

      {showCta && phase === PHASE.COMPLETE && !completedTurns.some(turn => (turn.canonicalPlan || turn.plan)?.days?.length) && (
        <TrailieDemoCta
          className="public-reading mt-8 sm:mt-10 shrink-0"
          askPrompt={scenario?.turns?.[0]?.question || null}
        />
      )}
    </div>
  );
}
