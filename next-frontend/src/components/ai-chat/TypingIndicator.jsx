import React from 'react';
import { Bot } from '@components/icons';

const TypingIndicator = ({ text = "AI is thinking..." }) => {
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
            {/* Animated Dots */}
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
            
            {/* Text */}
            <span className="text-xs sm:text-sm font-medium"
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
