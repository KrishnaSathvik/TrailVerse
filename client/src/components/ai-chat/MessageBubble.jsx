import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Copy, ThumbsUp, ThumbsDown, Check } from '@components/icons';


const MessageBubble = ({
  message,
  isUser = false,
  timestamp,
  onCopy,
  onFeedback,
  userAvatar = null,
  messageData = null, // Additional data for feedback
  initialFeedback = null // Initial feedback state from database ('up' or 'down')
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [feedbackState, setFeedbackState] = useState(initialFeedback); // Track feedback state

  // Update feedback state when initialFeedback prop changes
  useEffect(() => {
    if (initialFeedback) {
      setFeedbackState(initialFeedback);
    }
  }, [initialFeedback]);

  const handleCopy = () => {
    if (!message) return;
    
    // Strip markdown formatting for cleaner copy
    const cleanText = message
      .replace(/#{1,6}\s+/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
      .replace(/^\s*[-*+]\s+/gm, '') // Remove list bullets
      .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered lists
      .trim();
    
    onCopy ? onCopy(cleanText) : navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // Show "Copied!" for 2 seconds
  };

  const handleFeedback = async (type) => {
    // Update UI immediately for instant feedback
    setFeedbackState(type);
    
    if (onFeedback) {
      try {
        await onFeedback(type, messageData);
      } catch (error) {
        console.error('Feedback error:', error);
        // Visual feedback already set above
      }
    }
  };

  return (
    <div
      className={`flex items-start gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group mb-4 sm:mb-6`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      role="group"
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center overflow-hidden ring-2 ${
        isUser ? 'ring-gray-200' : 'ring-green-500/20'
      }`}
        style={{
          backgroundColor: isUser ? 'var(--surface)' : 'var(--accent-green)',
          marginTop: '2px' // Slight alignment adjustment
        }}
      >
        {isUser ? (
          userAvatar ? (
            <img 
              src={userAvatar} 
              alt="User avatar" 
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <User className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
          )
        ) : (
          <Bot className="h-5 w-5 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div className="flex flex-col gap-1.5">
          <div
            className={`inline-block max-w-full sm:max-w-[90%] md:max-w-[85%] lg:max-w-[80%] rounded-2xl px-4 sm:px-5 py-3 sm:py-4 backdrop-blur-sm chat-message-bubble break-words overflow-wrap-anywhere ${
              isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
            }`}
            style={{
              backgroundColor: isUser ? 'var(--surface)' : 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              hyphens: 'auto'
            }}
          >

          <div className="prose prose-sm max-w-none break-words"
            style={{
              '--tw-prose-bullets': 'var(--text-primary)',
              '--tw-prose-counters': 'var(--text-primary)',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
              hyphens: 'auto'
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Headings
                h1: ({ children }) => <h1 className="text-lg sm:text-xl font-bold mb-3 mt-2 break-words">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base sm:text-lg font-semibold mb-2 mt-3 break-words">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm sm:text-base font-semibold mb-2 mt-2 break-words">{children}</h3>,
                
                // Text formatting
                strong: ({ children }) => <strong className="font-semibold break-words">{children}</strong>,
                em: ({ children }) => <em className="italic break-words">{children}</em>,
                
                // Paragraphs and spacing
                p: ({ children }) => <p className="mb-2 leading-relaxed text-sm sm:text-base break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{children}</p>,
                br: () => <br />,
                
                // Lists
                ul: ({ children }) => (
                  <ul className="ml-4 list-disc space-y-1 mb-2 text-sm sm:text-base break-words" 
                    style={{ 
                      color: 'var(--text-primary)',
                      listStyleType: 'disc'
                    }}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="ml-4 list-decimal space-y-1 mb-2 text-sm sm:text-base break-words"
                    style={{ 
                      color: 'var(--text-primary)',
                      listStyleType: 'decimal'
                    }}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="break-words" 
                    style={{ 
                      color: 'var(--text-primary)',
                      markerColor: 'var(--text-primary)',
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word'
                    }}
                  >
                    {children}
                  </li>
                ),
                
                // Code
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code 
                      className="px-1 rounded text-xs sm:text-sm" 
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      {children}
                    </code>
                  ) : (
                    <code 
                      className="block p-2 rounded text-xs sm:text-sm overflow-x-auto mb-2" 
                      style={{ backgroundColor: 'var(--surface-hover)' }}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre 
                    className="p-2 rounded overflow-x-auto mb-2 text-xs sm:text-sm" 
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                  >
                    {children}
                  </pre>
                ),
                
                // Links
                a: ({ href, children }) => (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="underline"
                    style={{ 
                      color: 'var(--forest-500)',
                      '--hover-color': 'var(--forest-600)'
                    }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--forest-600)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--forest-500)'}
                  >
                    {children}
                  </a>
                ),
                
                // Horizontal rule
                hr: () => <hr className="my-4" style={{ borderColor: 'var(--border)' }} />,
                
                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote 
                    className="border-l-4 pl-4 italic mb-2 break-words overflow-wrap-anywhere"
                    style={{ 
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                
                // Tables
                table: ({ children }) => (
                  <table 
                    className="min-w-full border-collapse border mb-2 text-xs sm:text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {children}
                  </table>
                ),
                th: ({ children }) => (
                  <th 
                    className="border px-2 py-1 font-semibold text-left break-words overflow-wrap-anywhere"
                    style={{ 
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--surface-hover)'
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td 
                    className="border px-2 py-1 break-words overflow-wrap-anywhere"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {children}
                  </td>
                ),
              }}
            >
              {message}
            </ReactMarkdown>
          </div>

          {/* Actions (assistant only) */}
          {!isUser && (
            <div
              className="flex items-center gap-1.5 mt-4 pt-3 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg transition-all duration-200 hover:scale-105 touch-manipulation"
                style={{ 
                  color: copied ? 'var(--accent-green)' : 'var(--text-tertiary)',
                  backgroundColor: copied ? 'var(--accent-green)/10' : 'var(--surface-hover)'
                }}
                aria-label="Copy message"
                title={copied ? 'Copied!' : 'Copy'}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </button>

              {onFeedback && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFeedback('up');
                    }}
                    className="p-2 rounded-lg transition-all duration-200 hover:scale-105 touch-manipulation"
                    style={{ 
                      color: feedbackState === 'up' ? '#fff' : 'var(--text-tertiary)',
                      backgroundColor: feedbackState === 'up' ? '#3b82f6' : 'var(--surface-hover)',
                      borderWidth: feedbackState === 'up' ? '0' : '0',
                      boxShadow: feedbackState === 'up' ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
                    }}
                    title={feedbackState === 'up' ? 'Liked!' : 'Good response'}
                    aria-label="Thumbs up"
                  >
                    <ThumbsUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill={feedbackState === 'up' ? '#fff' : 'none'} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFeedback('down');
                    }}
                    className="p-2 rounded-lg transition-all duration-200 hover:scale-105 touch-manipulation"
                    style={{ 
                      color: feedbackState === 'down' ? '#fff' : 'var(--text-tertiary)',
                      backgroundColor: feedbackState === 'down' ? '#ef4444' : 'var(--surface-hover)',
                      borderWidth: feedbackState === 'down' ? '0' : '0',
                      boxShadow: feedbackState === 'down' ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
                    }}
                    title={feedbackState === 'down' ? 'Disliked' : 'Bad response'}
                    aria-label="Thumbs down"
                  >
                    <ThumbsDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill={feedbackState === 'down' ? '#fff' : 'none'} />
                  </button>
                </>
              )}
            </div>
          )}
          </div>

          {/* Timestamp */}
          {timestamp && (
            <div
              className={`text-xs ${isUser ? 'text-right' : 'text-left'}`}
              style={{ color: 'var(--text-tertiary)' }}
              title={new Date(timestamp).toLocaleString()}
            >
              {new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
