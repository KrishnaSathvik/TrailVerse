import React from 'react';
import { Sparkles, TrendingUp, Zap, Lightbulb } from '@components/icons';

const SuggestedPrompts = ({ prompts, onSelect, title = "Suggested prompts" }) => {
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
      {title && (
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 sm:text-xs sm:mb-3"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {title}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5 w-full">
        {promptsToShow.map((prompt, index) => {
          const Icon = typeof prompt === 'object' ? prompt.icon : null;
          const text = typeof prompt === 'object' ? prompt.text : prompt;

          return (
            <button
              key={index}
              onClick={() => onSelect(text)}
              aria-label={`Use prompt: ${text}`}
              className="group flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] leading-tight sm:gap-2.5 sm:px-4 sm:py-3 sm:rounded-xl sm:text-sm sm:leading-snug font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 text-left"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {Icon && (
                <Icon className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" style={{ color: 'var(--accent-green)' }} />
              )}
              <span className="flex-1 line-clamp-2">
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
