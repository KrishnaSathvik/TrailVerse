'use client';

import DemoChatComposer from '@/components/trailie-demo/DemoChatComposer';
import DemoAnswerProse from '@/components/trailie-demo/DemoAnswerProse';
import TrailieAvatar from '@/components/plan-ai/TrailieAvatar';

function questionPromptLabel(turnIndex) {
  return turnIndex >= 1 ? 'Follow up' : 'Sample question';
}

function ThinkingStatus({ label, hasWebSearch }) {
  return (
    <div className="flex items-center gap-2.5 py-1 sm:py-2" role="status" aria-live="polite">
      <TrailieAvatar className="!h-7 !w-7 sm:!h-8 sm:!w-8 shrink-0" />
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '0ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '150ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '300ms' }}
          />
        </div>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          {label}
          {hasWebSearch ? ' · web' : ''}
        </p>
      </div>
    </div>
  );
}

export default function TrailieDemoPlaybackStage({
  scenario,
  completedTurns,
  isTyping,
  typedQuestion,
  isThinking,
  sentQuestion,
  thinkingLabel,
  turnMetadata,
  showMessagePane,
}) {
  const scenarioTitle =
    scenario?.chatTitle || scenario?.metadata?.parkName || scenario?.label || 'National park planning';
  const isFollowUpTyping = isTyping && completedTurns.length > 0;
  const isFirstTurnTyping = isTyping && completedTurns.length === 0;

  const typingBlock = <DemoChatComposer value={typedQuestion} isTyping={isTyping} />;

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 sm:mb-5" aria-label="Demo context">
        <p
          className="text-base sm:text-lg font-semibold text-pretty"
          style={{ color: 'var(--text-primary)' }}
        >
          {scenarioTitle}
        </p>
      </div>

      {isFirstTurnTyping && <div className="mb-5 sm:mb-6">{typingBlock}</div>}

      {(showMessagePane || isFollowUpTyping) && (
        <div className="space-y-6 sm:space-y-8">
          {completedTurns.map((turn, index) => (
            <section key={`playback-turn-${index}`} className="space-y-4 sm:space-y-5">
              <div>
                <p
                  className="mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {questionPromptLabel(index)}
                </p>
                <p
                  className="text-base sm:text-lg font-medium leading-relaxed text-pretty"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {turn.question}
                </p>
              </div>

              <div>
                <div className="mb-3 sm:mb-4 flex items-center gap-2 sm:gap-2.5">
                  <TrailieAvatar className="!h-7 !w-7 sm:!h-8 sm:!w-8 shrink-0" />
                  <div>
                    <p className="text-sm sm:text-base font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                      Trailie
                    </p>
                    {(turn.metadata?.hasLiveData || turn.metadata?.hasWebSearch) && (
                      <p className="text-[10px] sm:text-xs mt-1" style={{ color: 'var(--accent-green)' }}>
                        {turn.metadata?.hasWebSearch ? 'Live web search' : 'NPS live data'}
                      </p>
                    )}
                  </div>
                </div>
                <DemoAnswerProse text={turn.answer} className="sm:text-base" />
              </div>
            </section>
          ))}

          {isFollowUpTyping && <section className="pt-1">{typingBlock}</section>}

          {isThinking && sentQuestion && (
            <section className="space-y-4 sm:space-y-5">
              <div>
                <p
                  className="mb-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {questionPromptLabel(completedTurns.length)}
                </p>
                <p
                  className="text-base sm:text-lg font-medium leading-relaxed text-pretty"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {sentQuestion}
                </p>
              </div>
              <ThinkingStatus label={thinkingLabel} hasWebSearch={turnMetadata?.hasWebSearch} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
