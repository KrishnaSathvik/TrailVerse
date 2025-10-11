import React from 'react';
import { Sparkles, TrendingUp, Zap, Lightbulb } from 'lucide-react';

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
        <p className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {title}
        </p>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 w-full">
        {promptsToShow.map((prompt, index) => {
          const Icon = typeof prompt === 'object' ? prompt.icon : null;
          const text = typeof prompt === 'object' ? prompt.text : prompt;
          
          return (
            <button
              key={index}
              onClick={() => onSelect(text)}
              aria-label={`Use prompt: ${text}`}
              className="group flex items-center gap-2.5 px-3.5 sm:px-4 py-3 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 text-left"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                minHeight: '48px'
              }}
            >
              {Icon && (
                <Icon className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              )}
              <span className="flex-1 leading-snug line-clamp-2">
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
