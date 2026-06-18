import React from 'react';
import { Globe } from '@components/icons';
import TrailieAvatar from '@components/plan-ai/TrailieAvatar';

const TypingIndicator = ({ text = 'AI is thinking...', sources = [], inlineAvatarLayout = false }) => {
  const isSearching = sources?.includes('web');
  const showLiveWeb = sources?.includes('web');
  const showLiveNps = !showLiveWeb && sources?.some((s) => s === 'nps' || s === 'weather');

  const inlineHeaderLabel = showLiveWeb || showLiveNps ? (
    <div
      className="flex items-center gap-1.5 min-w-0 text-[11px] font-medium"
      style={{ color: 'var(--accent-green)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent-green)' }} />
      <span>{showLiveWeb ? 'Live web search' : 'Live NPS data'}</span>
    </div>
  ) : (
    <span
      className="text-[11px] font-semibold uppercase tracking-[0.2em]"
      style={{ color: 'var(--accent-green)' }}
    >
      Trailie
    </span>
  );

  const typingBody = (
    <div className="flex items-center gap-3">
      {isSearching ? (
        <Globe
          className="h-4 w-4 animate-spin"
          style={{ color: 'var(--accent-blue, #0ea5e9)', animationDuration: '2s' }}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '0ms' }}
          />
          <span
            className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '150ms' }}
          />
          <span
            className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
            style={{ backgroundColor: 'var(--accent-green)', animationDelay: '300ms' }}
          />
        </div>
      )}

      <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {text}
      </span>
    </div>
  );

  const sourceBadges =
    sources && sources.length > 0 ? (
      <div className="mt-2 flex items-center gap-1.5">
        {sources.includes('nps') && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent-green)' }}
          >
            NPS Data
          </span>
        )}
        {sources.includes('weather') && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent-blue, #0ea5e9)' }}
          >
            Weather
          </span>
        )}
        {sources.includes('web') && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}
          >
            Web Search
          </span>
        )}
      </div>
    ) : null;

  if (inlineAvatarLayout) {
    return (
      <div className="group w-full" role="status" aria-live="polite" aria-label={text}>
        <div
          className="chat-message-bubble chat-message-bubble--assistant chat-message-bubble--inline w-full rounded-[24px] px-4 py-3.5 sm:px-5 sm:py-4"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            boxShadow: '0 18px 38px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div
            className="mb-3 flex items-center gap-2.5 border-b pb-2.5 sm:gap-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <TrailieAvatar className="!h-8 !w-8 shrink-0 sm:!h-9 sm:!w-9" />
            {inlineHeaderLabel}
          </div>
          {typingBody}
          {sourceBadges}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 sm:gap-4" role="status" aria-live="polite" aria-label={text}>
      <TrailieAvatar />
      <div className="flex-1">
        <div
          className="inline-block rounded-2xl rounded-tl-sm px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          {typingBody}
          {sourceBadges}
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
