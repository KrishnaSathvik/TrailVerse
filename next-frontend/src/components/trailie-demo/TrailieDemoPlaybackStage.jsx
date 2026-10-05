'use client';

import DemoChatComposer from '@/components/trailie-demo/DemoChatComposer';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';
import TrailieResponse from '@/components/trailie-response/TrailieResponse';
import { toDemoTrailieResponseModel } from '@/lib/trailieResponseModel';

function questionPromptLabel(turnIndex) {
  return turnIndex >= 1 ? 'Follow up' : 'Sample question';
}

function ThinkingStatus({ label }) {
  return (
    <div className="flex items-center gap-2.5 py-1 sm:py-2" role="status" aria-live="polite">
      <TrailieAvatar className="!h-7 !w-7 sm:!h-8 sm:!w-8 shrink-0" />
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex items-center gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 rounded-full animate-bounce motion-reduce:animate-none"
              style={{ backgroundColor: 'var(--accent-green)', animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </p>
      </div>
    </div>
  );
}

function QuestionBlock({ question, turnIndex }) {
  return (
    <div>
      <p
        className="mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {questionPromptLabel(turnIndex)}
      </p>
      <p
        className="text-base sm:text-lg font-medium leading-relaxed text-pretty"
        style={{ color: 'var(--text-primary)' }}
      >
        {question}
      </p>
    </div>
  );
}

/**
 * Read-only replay of one /trailie-demo scenario.
 *
 * The in-flight turn is rendered from explicit beats. An itinerary answer shows
 * the spoken intro first, then the finished turn adds the day card underneath.
 * Reusing the product's own `TrailieResponse` keeps the demo aligned with a
 * live, restored, or shared response.
 */
export default function TrailieDemoPlaybackStage({
  scenario,
  completedTurns,
  isTyping,
  typedQuestion,
  activeTurn,
  showMessagePane,
}) {
  const scenarioTitle = scenario?.chatTitle || scenario?.label || 'National park planning';
  const isFollowUpTyping = isTyping && completedTurns.length > 0;
  const isFirstTurnTyping = isTyping && completedTurns.length === 0;

  const typingBlock = <DemoChatComposer value={typedQuestion} isTyping={isTyping} />;
  const openFollowupInTrailie = (prompt) => {
    window.location.assign(`/plan-ai?ask=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 sm:mb-5" aria-label="Demo context">
        <p className="text-base sm:text-lg font-semibold text-pretty" style={{ color: 'var(--text-primary)' }}>
          {scenarioTitle}
        </p>
      </div>

      {isFirstTurnTyping && <div className="mb-5 sm:mb-6">{typingBlock}</div>}

      {(showMessagePane || isFollowUpTyping) && (
        <div className="space-y-6 sm:space-y-8">
          {completedTurns.map((turn, index) => (
            <section key={`playback-turn-${index}`} className="space-y-4 sm:space-y-5">
              <QuestionBlock question={turn.question} turnIndex={index} />
              <TrailieResponse
                response={toDemoTrailieResponseModel({ turn })}
                example
                hideActions
                onFollowup={openFollowupInTrailie}
              />
            </section>
          ))}

          {isFollowUpTyping && <section className="pt-1">{typingBlock}</section>}

          {activeTurn && (
            <section className="space-y-4 sm:space-y-5">
              <QuestionBlock question={activeTurn.question} turnIndex={completedTurns.length} />

              {activeTurn.beat === 'thinking' ? (
                <ThinkingStatus label={activeTurn.thinkingLabel} />
              ) : null}

              {activeTurn.beat === 'intro' ? (
                <TrailieResponse
                  response={toDemoTrailieResponseModel({
                    turn: {
                      ...activeTurn,
                      plan: null,
                      canonicalPlan: null,
                      presentation: null,
                      presentationKind: 'plain_answer',
                    },
                    lifecycle: {
                      showProse: true,
                      showPlan: false,
                    },
                  })}
                  example
                  hideActions
                  onFollowup={openFollowupInTrailie}
                />
              ) : null}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
