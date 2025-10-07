import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Copy, ThumbsUp, ThumbsDown, MoreVertical, Check } from 'lucide-react';


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
    if (!message) return;
    onCopy ? onCopy(message) : navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      role="group"
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
        isUser ? 'bg-gray-500' : 'bg-gradient-to-br from-forest-400 to-forest-600'
      }`}>
        {isUser ? <User className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`inline-block max-w-[85%] rounded-2xl p-4 backdrop-blur`}
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Headings
                h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 mt-4">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-semibold mb-2 mt-4">{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-3">{children}</h3>,
                
                // Text formatting
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                
                // Paragraphs and spacing
                p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                br: () => <br />,
                
                // Lists
                ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 mb-2">{children}</ul>,
                ol: ({ children }) => <ul className="ml-5 list-decimal space-y-1 mb-2">{children}</ul>,
                li: ({ children }) => <li>{children}</li>,
                
                // Code
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="px-1 rounded bg-black/10 text-sm">{children}</code>
                  ) : (
                    <code className="block bg-gray-100 p-2 rounded text-sm overflow-x-auto">{children}</code>
                  );
                },
                pre: ({ children }) => <pre className="bg-gray-100 p-2 rounded overflow-x-auto mb-2">{children}</pre>,
                
                // Links
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">
                    {children}
                  </a>
                ),
                
                // Horizontal rule
                hr: () => <hr className="my-4" style={{ borderColor: 'var(--border)' }} />,
                
                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-700 mb-2">
                    {children}
                  </blockquote>
                ),
                
                // Tables
                table: ({ children }) => (
                  <table className="min-w-full border-collapse border border-gray-300 mb-2">
                    {children}
                  </table>
                ),
                th: ({ children }) => (
                  <th className="border border-gray-300 px-2 py-1 bg-gray-100 font-semibold text-left">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-gray-300 px-2 py-1">
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
              className={`flex items-center gap-2 mt-3 pt-3 border-t transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-white/5 transition"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Copy message"
              >
                {copied ? (<><Check className="h-3 w-3" /> Copied</>) : (<><Copy className="h-3 w-3" /> Copy</>)}
              </button>

              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback('up')}
                    className="p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Good response"
                    aria-label="Thumbs up"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onFeedback('down')}
                    className="p-1 rounded-lg hover:bg-white/5 transition"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Bad response"
                    aria-label="Thumbs down"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </>
              )}

              <button
                className="p-1 rounded-lg hover:bg-white/5 transition ml-auto"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="More actions"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div
            className={`mt-1 text-xs ${isUser ? 'text-right' : 'text-left'}`}
            style={{ color: 'var(--text-tertiary)' }}
            title={new Date(timestamp).toLocaleString()}
          >
            {new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
