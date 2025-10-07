import React, { useState } from 'react';
import { User, Sparkles, Copy, ThumbsUp, ThumbsDown, MoreVertical, Check } from 'lucide-react';


const MessageBubble = ({ 
  message, 
  isUser = false, 
  timestamp,
  onCopy,
  onFeedback 
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy(message);
    } else {
      navigator.clipboard.writeText(message);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderMessageContent = (content) => {
    // Parse markdown-style formatting
    const lines = content.split('\n');
    
    return lines.map((line, i) => {
      // Headers
      if (line.startsWith('# ')) {
        return (
          <h1 key={i} className="text-2xl font-bold mb-3 mt-4 first:mt-0"
            style={{ color: isUser ? 'inherit' : 'var(--text-primary)' }}
          >
            {line.slice(2)}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={i} className="text-xl font-semibold mb-2 mt-4 first:mt-0"
            style={{ color: isUser ? 'inherit' : 'var(--text-primary)' }}
          >
            {line.slice(3)}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h3 key={i} className="text-lg font-semibold mb-2 mt-3 first:mt-0"
            style={{ color: isUser ? 'inherit' : 'var(--text-primary)' }}
          >
            {line.slice(4)}
          </h3>
        );
      }

      // Bold text
      if (line.startsWith('**') && line.endsWith('**')) {
        return (
          <p key={i} className="font-semibold mb-1">
            {line.slice(2, -2)}
          </p>
        );
      }

      // List items
      if (line.startsWith('- ')) {
        return (
          <li key={i} className="ml-4 mb-1">
            {line.slice(2)}
          </li>
        );
      }

      // Horizontal rule
      if (line.trim() === '---') {
        return (
          <hr key={i} className="my-4" 
            style={{ borderColor: isUser ? 'rgba(255,255,255,0.2)' : 'var(--border)' }} 
          />
        );
      }

      // Regular paragraph
      if (line.trim()) {
        return (
          <p key={i} className="mb-2 leading-relaxed">
            {line}
          </p>
        );
      }

      // Empty line
      return <br key={i} />;
    });
  };

  return (
    <div
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-forest-500'
          : 'bg-gradient-to-br from-purple-500 to-pink-500'
      }`}>
        {isUser ? (
          <User className="h-5 w-5 text-white" />
        ) : (
          <Sparkles className="h-5 w-5 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`inline-block max-w-[85%] rounded-2xl p-4 ${
          isUser
            ? 'bg-forest-500 text-white'
            : 'backdrop-blur'
        }`}
        style={!isUser ? {
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)'
        } : {}}
        >
          <div className="prose prose-sm max-w-none"
            style={!isUser ? { color: 'var(--text-primary)' } : {}}
          >
            {renderMessageContent(message)}
          </div>

          {/* Message Actions */}
          {!isUser && (
            <div className={`flex items-center gap-2 mt-3 pt-3 border-t transition-opacity ${
              showActions ? 'opacity-100' : 'opacity-0'
            }`}
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-white/5 transition"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>

              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback('up')}
                    className="p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Good response"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onFeedback('down')}
                    className="p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Bad response"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </>
              )}

              <button
                className="p-1 rounded-lg hover:bg-white/5 transition ml-auto"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        
        {/* Timestamp */}
        {timestamp && (
          <div className={`mt-1 text-xs ${isUser ? 'text-right' : 'text-left'}`}
            style={{ color: 'var(--text-tertiary)' }}
          >
            {new Date(timestamp).toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit' 
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
