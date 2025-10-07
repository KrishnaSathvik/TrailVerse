import React from 'react';
import { Sparkles } from 'lucide-react';

const TypingIndicator = ({ text = "AI is thinking..." }) => {
  return (
    <div className="flex gap-4 items-center">
      {/* Avatar */}
      <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
        <Sparkles className="h-5 w-5 text-white" />
      </div>

      {/* Typing Bubble */}
      <div className="flex-1">
        <div className="inline-block rounded-2xl p-4 backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex items-center gap-3">
            {/* Animated Dots */}
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-forest-400 animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span className="h-2 w-2 rounded-full bg-forest-400 animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span className="h-2 w-2 rounded-full bg-forest-400 animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            
            {/* Text */}
            <span className="text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {text}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
