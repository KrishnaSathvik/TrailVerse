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
          const Icon = typeof prompt === 'object' ? prompt.icon : null;
          const text = typeof prompt === 'object' ? prompt.text : prompt;
          const hideOnMobile = mobileMax != null && index >= mobileMax;

          return (
            <button
              key={index}
              onClick={() => onSelect(text)}
              aria-label={`Use prompt: ${text}`}
              className={`group flex w-full items-start gap-2 px-3 py-2.5 rounded-lg text-xs leading-snug sm:gap-2.5 sm:px-4 sm:py-3 sm:rounded-xl sm:text-sm font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 text-left ${hideOnMobile ? 'max-sm:hidden' : ''}`}
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {Icon && (
                <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 sm:mt-0 sm:h-4 sm:w-4" style={{ color: 'var(--accent-green)' }} />
              )}
              <span className="min-w-0 flex-1 break-words">
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SuggestedPrompts;
