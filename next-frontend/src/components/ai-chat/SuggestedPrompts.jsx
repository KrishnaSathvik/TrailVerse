import React from 'react';
import { Sparkles, TrendingUp, Zap, Lightbulb } from '@components/icons';

const SuggestedPrompts = ({
  prompts,
  onSelect,
  title = 'Suggested prompts',
  subtitle = null,
  mobileMax = null,
  hideTitle = false,
}) => {
  const defaultPrompts = [
    {
      icon: Sparkles,
      text: "Make this trip less strenuous",
      color: "text-purple-400"
    },
    {
      icon: TrendingUp,
      text: "Add more photography spots",
      color: "text-blue-400"
    },
    {
      icon: Zap,
      text: "What should I pack?",
      color: "text-yellow-400"
    },
    {
      icon: Lightbulb,
      text: "Show me Day 2 details",
      color: "text-green-400"
    }
  ];

  const promptsToShow = prompts || defaultPrompts;

  if (promptsToShow.length === 0) return null;

  return (
    <div>
      {title && !hideTitle && (
        <p
          className="mb-1.5 text-xs font-medium sm:mb-3 sm:text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          {title}
        </p>
      )}
      {subtitle && (
        <p className="-mt-1 mb-1.5 text-[11px] leading-snug sm:-mt-2 sm:mb-3 sm:text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          {subtitle}
        </p>
      )}

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
        {promptsToShow.map((prompt, index) => {
          const text = typeof prompt === 'object' ? prompt.text : prompt;
          const label = typeof prompt === 'object' ? (prompt.label || prompt.text) : prompt;
          const hideOnMobile = mobileMax != null && index >= mobileMax;

          return (
            <button
              key={index}
              onClick={() => onSelect(text)}
              aria-label={`Use prompt: ${label}`}
              title={text !== label ? text : undefined}
              className={`trailie-starter-prompt group flex w-full items-start gap-3 border-b px-1 py-3 text-left text-sm font-medium leading-snug transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:px-0 sm:py-3.5 sm:text-[15px] ${hideOnMobile ? 'max-sm:hidden' : ''}`}
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                '--tw-ring-color': 'var(--accent-green)',
              }}
            >
              <span className="min-w-0 flex-1 break-words">
                {label}
              </span>
              <span
                aria-hidden="true"
                className="mt-px shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                style={{ color: 'var(--accent-green)' }}
              >
                →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SuggestedPrompts;
