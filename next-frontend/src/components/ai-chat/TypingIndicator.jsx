import React from 'react';
import { Bot, Globe } from '@components/icons';

const TypingIndicator = ({ text = "AI is thinking...", sources = [] }) => {
  const isSearching = sources?.includes('web');

  return (
    <div className="flex gap-3 sm:gap-4 items-start" role="status" aria-live="polite" aria-label={text}>
      {/* Avatar */}
      <div className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center ring-2 ring-green-500/20"
        style={{
          backgroundColor: 'var(--accent-green)'
        }}
      >
        <Bot className="h-5 w-5 text-white" />
      </div>

      {/* Typing Bubble */}
      <div className="flex-1">
        <div className="inline-block rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3 sm:py-4 backdrop-blur-sm"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
          }}
        >
          <div className="flex items-center gap-3">
            {/* Animated Dots or Search Icon */}
            {isSearching ? (
              <Globe className="h-4 w-4 animate-spin" style={{ color: 'var(--accent-blue, #0ea5e9)', animationDuration: '2s' }} />
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    animationDelay: '0ms'
                  }}
                />
                <span className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    animationDelay: '150ms'
                  }}
                />
                <span className="h-2 w-2 rounded-full animate-bounce motion-reduce:animate-none"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    animationDelay: '300ms'
                  }}
                />
              </div>
            )}

            {/* Text */}
            <span className="text-xs sm:text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {text}
            </span>
          </div>

          {/* Source badges */}
          {sources && sources.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {sources.includes('nps') && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent-green)' }}>
                  NPS Data
                </span>
              )}
              {sources.includes('weather') && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent-blue, #0ea5e9)' }}>
                  Weather
                </span>
              )}
              {sources.includes('web') && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                  Web Search
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
