'use client';

import LoadingSpinner from '@components/common/LoadingSpinner';
import Header from '@components/common/Header';

/**
 * Shared Plan AI page chrome — chat-first layout with contextual sub-header.
 */
export default function PlanAIShell({
  title = 'Trailie',
  subtitle,
  showSubHeader = true,
  headerActions,
  loadingMessage,
  children,
}) {
  const showChromeBar = showSubHeader || headerActions;

  return (
    <div
      className="plan-ai-shell h-dvh flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, #d6c7a5 7%, var(--bg-primary)) 0%, var(--bg-primary) 30%)',
      }}
    >
      <Header />
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        {showChromeBar && (
          <section
            className="relative z-30 shrink-0 border-b py-2 sm:py-4"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
            }}
          >
            <div className="public-shell flex items-center justify-between gap-3 sm:gap-5">
              {showSubHeader ? (
                <div className="min-w-0 flex-1">
                  {title && title !== 'Trailie' ? (
                    <p
                      className="mb-0 text-xs font-semibold tracking-wide sm:mb-0.5"
                      style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-display)' }}
                    >
                      Trailie
                    </p>
                  ) : null}
                  {title ? (
                    <h1
                      className="truncate text-lg font-semibold leading-tight sm:text-xl"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                    >
                      {title}
                    </h1>
                  ) : null}
                  {subtitle ? (
                    <p
                      className="mt-0.5 line-clamp-1 text-xs leading-snug sm:text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {subtitle}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex-1" aria-hidden="true" />
              )}
              {headerActions ? (
                <div className="flex shrink-0 items-center">{headerActions}</div>
              ) : null}
            </div>
          </section>
        )}

        <div className="public-full relative z-10 flex flex-1 min-h-0 flex-col overflow-hidden">
          {children ?? (
            loadingMessage ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4">
                <LoadingSpinner size="md" text={loadingMessage} />
              </div>
            ) : null
          )}
        </div>
      </main>
    </div>
  );
}
