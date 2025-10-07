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
    <div className="mb-4">
      {title && (
        <p className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {title}
        </p>
      )}
      
      <div className="flex flex-wrap gap-2">
        {promptsToShow.map((prompt, index) => {
          const Icon = typeof prompt === 'object' ? prompt.icon : null;
          const text = typeof prompt === 'object' ? prompt.text : prompt;
          const colorClass = typeof prompt === 'object' ? prompt.color : 'text-gray-600';
          
          return (
            <button
              key={index}
              onClick={() => onSelect(text)}
              aria-label={`Use prompt: ${text}`}
              className="group flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105 hover:shadow-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              {Icon && (
                <Icon className={`h-4 w-4 ${colorClass} group-hover:scale-110 transition-transform`} />
              )}
              <span className="group-hover:text-gray-800 transition-colors">
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
