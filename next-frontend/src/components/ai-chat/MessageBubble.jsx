import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Copy, ThumbsUp, ThumbsDown, Check, RefreshCw, X, Download, ChevronLeft, ChevronRight } from '@components/icons';
import { linkifyParkNames } from '@/utils/parkLinkifier';


const ImageLightbox = ({ images, initialIndex, onClose }) => {
  const [index, setIndex] = useState(initialIndex);

  const goPrev = useCallback(() => {
    setIndex(i => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex(i => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext]);

  const handleDownload = async () => {
    const img = images[index];
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (img.title || 'park-photo').replace(/[^a-z0-9]/gi, '-') + '.jpg';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(img.url, '_blank');
    }
  };

  const current = images[index];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
        <span className="text-white/70 text-sm font-medium">
          {index + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Nav arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition z-10"
            title="Previous"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition z-10"
            title="Next"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}

      {/* Image */}
      <img
        src={current.url}
        alt={current.altText || current.title || 'Park photo'}
        className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Caption */}
      {(current.altText || current.title) && (
        <div className="absolute bottom-0 left-0 right-0 text-center px-6 py-4 z-10">
          <p className="text-white/80 text-sm leading-relaxed max-w-2xl mx-auto">
            {current.altText || current.title}
          </p>
        </div>
      )}
    </div>,
    document.body
  );
};


const MessageBubble = ({
  message,
  isUser = false,
  timestamp,
  onCopy,
  onRegenerate,
  onFeedback,
  onExport,
  userAvatar = null,
  messageData = null, // Additional data for feedback
  initialFeedback = null, // Initial feedback state from database ('up' or 'down')
  hideActions = false,
  hasLiveData = false,
  liveDataParks = [],
  parkImages = []
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [feedbackState, setFeedbackState] = useState(initialFeedback);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [avatarError, setAvatarError] = useState(false);


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
      .replace(/\[ITINERARY_JSON\][\s\S]*$/, '') // Remove itinerary JSON block
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
      className={`flex items-start gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} group mb-5 sm:mb-7`}
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
          userAvatar && !avatarError ? (
            <img
              src={userAvatar}
              alt="User avatar"
              className="w-full h-full object-cover rounded-full"
              onError={() => setAvatarError(true)}
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
            className={`inline-block max-w-full sm:max-w-[94%] lg:max-w-[88%] rounded-[24px] px-4 py-3.5 sm:px-5 sm:py-4 backdrop-blur-sm chat-message-bubble ${
              isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
            }`}
            style={{
              backgroundColor: isUser ? 'var(--accent-green-light)' : 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              boxShadow: isUser
                ? '0 16px 32px rgba(67, 160, 106, 0.10)'
                : '0 18px 38px rgba(15, 23, 42, 0.06)',
              overflowWrap: 'anywhere',
              wordBreak: 'normal',
              hyphens: 'none'
            }}
          >

          {/* Live data indicator — inside bubble */}
          {!isUser && hasLiveData && liveDataParks.length > 0 && (
            <div
              className="flex items-center gap-1.5 mb-3 pb-2.5 border-b text-[11px] font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--accent-green)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent-green)' }} />
              <span>Live data · {liveDataParks.join(', ')}</span>
            </div>
          )}

          {/* Park photo gallery — 2×2 grid */}
          {!isUser && parkImages?.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-2 rounded-xl overflow-hidden">
                {parkImages.slice(0, 4).map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-[4/3] overflow-hidden group/img cursor-pointer"
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                    onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    role="button"
                    tabIndex={0}
                    aria-label={`View photo: ${img.altText || img.title || 'Park photo'}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setLightboxIndex(idx); setLightboxOpen(true); } }}
                  >
                    <img
                      src={img.url}
                      alt={img.altText || img.title || 'Park photo'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-110"
                      loading="lazy"
                      onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                    />
                  </div>
                ))}
              </div>
              {parkImages.length > 4 && (
                <button
                  onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
                  className="text-xs font-medium mb-2 transition-colors"
                  style={{ color: 'var(--accent-green)' }}
                >
                  View all {parkImages.length} photos
                </button>
              )}
            </>
          )}

          <div className="prose prose-sm max-w-none"
            style={{
              '--tw-prose-bullets': 'var(--text-primary)',
              '--tw-prose-counters': 'var(--text-primary)',
              overflowWrap: 'anywhere',
              wordBreak: 'normal',
              hyphens: 'none'
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              children={!isUser ? linkifyParkNames((message || '').replace(/\[ITINERARY_JSON\][\s\S]*$/, '').trimEnd()) : message}
              components={{
                // Headings
                h1: ({ children }) => <h1 className="text-lg sm:text-xl font-bold mb-3 mt-2 break-words">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base sm:text-lg font-semibold mb-2 mt-3 break-words">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm sm:text-base font-semibold mb-2 mt-2 break-words">{children}</h3>,
                
                // Text formatting
                strong: ({ children }) => <strong className="font-semibold break-words">{children}</strong>,
                em: ({ children }) => <em className="italic break-words">{children}</em>,
                
                // Paragraphs — use div when children contain block elements (images)
                p: ({ children, node }) => {
                  const hasImage = node?.children?.some(c => c.tagName === 'img');
                  const Tag = hasImage ? 'div' : 'p';
                  return <Tag className="mb-2 leading-relaxed text-sm sm:text-base break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{children}</Tag>;
                },
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
                a: ({ href, children }) => {
                  if (href?.startsWith('/parks/')) {
                    return (
                      <a href={href} className="underline" style={{ color: 'var(--accent-green)', textDecoration: 'underline' }}>
                        {children}
                      </a>
                    );
                  }
                  return (
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
                  );
                },
                
                // Inline images — render as styled cards instead of raw inline
                img: ({ src, alt }) => {
                  // Skip if this image is already shown in the parkImages grid above
                  if (parkImages?.length > 0 && parkImages.some(pi => pi.url === src)) return null;
                  return (
                    <img
                      src={src}
                      alt={alt || 'Photo'}
                      className="rounded-xl my-3 w-full max-w-sm object-cover"
                      style={{ aspectRatio: '4/3', backgroundColor: 'var(--surface-hover)' }}
                      loading="lazy"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  );
                },

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
            />
          </div>

          {/* Actions (assistant only) */}
          {!isUser && !hideActions && (
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

              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-2 rounded-lg transition-all duration-200 hover:scale-105 touch-manipulation"
                  style={{
                    color: 'var(--text-tertiary)',
                    backgroundColor: 'var(--surface-hover)'
                  }}
                  aria-label="Regenerate response"
                  title="Regenerate"
                >
                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              )}

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
                    <ThumbsUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" weight={feedbackState === 'up' ? 'fill' : 'regular'} />
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
                    <ThumbsDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" weight={feedbackState === 'down' ? 'fill' : 'regular'} />
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
      {/* Image lightbox */}
      {lightboxOpen && parkImages?.length > 0 && (
        <ImageLightbox
          images={parkImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default MessageBubble;
