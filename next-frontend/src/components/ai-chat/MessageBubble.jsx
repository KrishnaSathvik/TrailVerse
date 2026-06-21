import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Copy, ThumbsUp, ThumbsDown, Check, RefreshCw, X, Download, ChevronLeft, ChevronRight } from '@components/icons';
import TrailieAvatar from '@components/plan-ai/TrailieAvatar';
import ParkPhotoGrid from '@/components/ai-chat/ParkPhotoGrid';
import { buildMarkdownComponents } from '@/components/ai-chat/markdownComponents';
import { filterParkChatImages } from '@/utils/parkChatImages';
import { normalizeParkLinksInMarkdown, unwrapMislinkedParkMarkdown } from '@/utils/parkLinkifier';
import { stabilizeStreamingMarkdown, escapeApproximateTildesForGfm } from '@/utils/stripMarkdown';


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
  compact = false,
  dense = false,
  hideAvatar = false,
  inlineAvatarLayout = false,
  linkifyParks = true,
  isStreaming = false,
  isFinalizing = false,
  hasLiveData = false,
  hasWebSearch = false,
  liveDataParks = [],
  parkImages = [],
  afterContent = null,
  belowBubbleContent = null,
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

  const markdownBody = (message || '').replace(/\[ITINERARY_JSON\][\s\S]*$/i, '').trimEnd();
  const renderBody = !isUser && isStreaming
    ? stabilizeStreamingMarkdown(markdownBody)
    : markdownBody;
  const shouldLinkifyParks = linkifyParks && !isStreaming && !isUser && !isFinalizing;
  const markdownContent = isUser
    ? message
    : escapeApproximateTildesForGfm(
        shouldLinkifyParks
          ? normalizeParkLinksInMarkdown(renderBody)
          : unwrapMislinkedParkMarkdown(renderBody)
      );

  const usableParkImages = useMemo(() => filterParkChatImages(parkImages), [parkImages]);
  const parkImageUrls = useMemo(
    () => new Set(usableParkImages.map((img) => img.url).filter(Boolean)),
    [usableParkImages]
  );
  const markdownComponents = useMemo(
    () => buildMarkdownComponents(parkImageUrls),
    [parkImageUrls]
  );
  const displayPhotos = useMemo(() => usableParkImages.slice(0, 4), [usableParkImages]);
  const useInlineLayout = inlineAvatarLayout && !hideAvatar;
  const useInlineAssistantLayout = useInlineLayout && !isUser;
  const useInlineUserLayout = useInlineLayout && isUser;
  const avatarSize = dense ? 'h-7 w-7' : 'h-8 w-8 sm:h-9 sm:w-9';
  const trailieAvatarSize = dense ? '!h-7 !w-7' : '!h-8 !w-8 sm:!h-9 sm:!w-9';

  const handleCopy = () => {
    if (!message) return;

    const cleanText = message
      .replace(/\[ITINERARY_JSON\][\s\S]*$/, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .trim();

    onCopy ? onCopy(cleanText) : navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = async (type) => {
    setFeedbackState(type);

    if (onFeedback) {
      try {
        await onFeedback(type, messageData);
      } catch (error) {
        console.error('Feedback error:', error);
      }
    }
  };

  const sourceLabelText = !isUser && !isStreaming && !isFinalizing && (hasLiveData || hasWebSearch)
    ? (() => {
        if (hasWebSearch) return 'Checked live info';
        if (hasLiveData && liveDataParks.length > 0) return 'Checked park info';
        if (hasLiveData) return 'Checked trip info';
        return null;
      })()
    : null;

  const sourcePill = sourceLabelText ? (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: 'var(--surface-hover)',
        color: 'var(--accent-green)',
        border: '1px solid var(--border)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: 'var(--accent-green)' }}
      />
      {sourceLabelText}
    </span>
  ) : null;

  const liveDataIndicator = sourcePill ? (
    <div
      className="mb-3 pb-2.5 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      {sourcePill}
    </div>
  ) : null;

  const messageContentCore = (
    <>
      <div className="prose prose-sm max-w-none"
        style={{
          '--tw-prose-bullets': 'var(--text-primary)',
          '--tw-prose-counters': 'var(--text-primary)',
          overflowWrap: 'anywhere',
          wordBreak: 'normal',
          hyphens: 'none'
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {markdownContent}
        </ReactMarkdown>
      </div>

      {!isUser && !isStreaming && displayPhotos.length > 0 && (
        <ParkPhotoGrid
          photos={displayPhotos}
          showViewAllCount={usableParkImages.length}
          onOpenLightbox={(idx) => {
            setLightboxIndex(idx);
            setLightboxOpen(true);
          }}
        />
      )}

      {!isUser && afterContent}

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
                  backgroundColor: feedbackState === 'up' ? 'var(--accent-green)' : 'var(--surface-hover)',
                  borderWidth: feedbackState === 'up' ? '0' : '0',
                  boxShadow: feedbackState === 'up' ? '0 2px 8px rgba(67, 160, 106, 0.3)' : 'none'
                }}
                title={feedbackState === 'up' ? 'Liked' : 'Good response'}
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
    </>
  );

  const inlineAssistantHeader = (
    <div
      className="mb-3 flex items-center gap-2.5 border-b pb-2.5 sm:gap-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <TrailieAvatar className={`${trailieAvatarSize} shrink-0`} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--accent-green)' }}
        >
          Trailie
        </span>
        {sourcePill}
      </div>
    </div>
  );

  const userAvatarBubble = (
    <div
      className={`${avatarSize} flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-gray-200`}
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {userAvatar && !avatarError ? (
        <img
          src={userAvatar}
          alt=""
          className="h-full w-full rounded-full object-cover"
          onError={() => setAvatarError(true)}
        />
      ) : (
        <User className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
      )}
    </div>
  );

  const inlineUserRow = (
    <div className="flex items-center gap-2.5 sm:gap-3">
      {userAvatarBubble}
      <div
        className="min-w-0 flex-1 text-sm leading-relaxed"
        style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', wordBreak: 'normal' }}
      >
        {message}
      </div>
    </div>
  );

  const messageBody = (
    <>
      {liveDataIndicator}
      {messageContentCore}
    </>
  );

  return (
    <div
      className={`group ${
        useInlineLayout
          ? 'w-full'
          : `flex items-start ${dense ? 'gap-2' : 'gap-3 sm:gap-4'} ${isUser ? 'flex-row-reverse' : 'flex-row'}`
      } ${hideAvatar && !useInlineLayout ? 'gap-0' : ''} ${
        dense ? 'mb-1.5 sm:mb-2' : compact ? 'mb-2 sm:mb-3' : 'mb-5 sm:mb-7'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      role="group"
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      {!hideAvatar && !useInlineLayout && (isUser ? (
        <div
          className={`flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-gray-200 ${
            dense ? 'h-8 w-8' : 'h-9 w-9 sm:h-10 sm:w-10'
          }`}
          style={{
            backgroundColor: 'var(--surface)',
            marginTop: '2px',
          }}
        >
          {userAvatar && !avatarError ? (
            <img
              src={userAvatar}
              alt="User avatar"
              className="w-full h-full object-cover rounded-full"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <User className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
          )}
        </div>
      ) : (
        <TrailieAvatar className={dense ? '!h-8 !w-8' : undefined} />
      ))}

      <div className={`${useInlineLayout ? 'w-full' : 'flex-1 min-w-0'} ${!useInlineLayout && isUser ? 'flex justify-end' : ''}`}>
        <div className={`flex flex-col gap-1.5 ${!useInlineLayout && isUser ? 'items-end' : ''}`}>
          <div
            className={`${
              useInlineLayout
                ? 'w-full !max-w-full'
                : isUser
                  ? 'w-fit max-w-full sm:max-w-[94%] lg:max-w-[88%]'
                  : 'inline-block max-w-full sm:max-w-[94%] lg:max-w-[88%]'
            } rounded-[24px] chat-message-bubble ${
              useInlineLayout ? 'chat-message-bubble--inline ' : ''
            }${
              isUser ? 'chat-message-bubble--user' : 'chat-message-bubble--assistant'
            } ${
              dense
                ? 'px-3 py-2 sm:px-3.5 sm:py-2.5'
                : compact
                  ? 'px-3.5 py-2.5 sm:px-4 sm:py-3'
                  : 'px-4 py-3.5 sm:px-5 sm:py-4'
            } ${
              useInlineLayout ? '' : isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
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
              hyphens: 'none',
            }}
          >
            {useInlineAssistantLayout ? (
              <>
                {inlineAssistantHeader}
                {messageContentCore}
              </>
            ) : useInlineUserLayout ? (
              inlineUserRow
            ) : (
              messageBody
            )}
          </div>

          {!isUser && belowBubbleContent}

          {timestamp && (
            <div
              className={`text-xs ${useInlineLayout || !isUser ? 'text-left' : 'text-right'}`}
              style={{ color: 'var(--text-tertiary)' }}
              title={new Date(timestamp).toLocaleString()}
            >
              {new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>
      {lightboxOpen && usableParkImages.length > 0 && (
        <ImageLightbox
          images={usableParkImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

function messageBubblePropsAreEqual(prev, next) {
  return (
    prev.message === next.message &&
    prev.isUser === next.isUser &&
    prev.timestamp === next.timestamp &&
    prev.userAvatar === next.userAvatar &&
    prev.initialFeedback === next.initialFeedback &&
    prev.hideActions === next.hideActions &&
    prev.compact === next.compact &&
    prev.dense === next.dense &&
    prev.hideAvatar === next.hideAvatar &&
    prev.inlineAvatarLayout === next.inlineAvatarLayout &&
    prev.linkifyParks === next.linkifyParks &&
    prev.isStreaming === next.isStreaming &&
    prev.isFinalizing === next.isFinalizing &&
    prev.hasLiveData === next.hasLiveData &&
    prev.hasWebSearch === next.hasWebSearch &&
    prev.liveDataParks === next.liveDataParks &&
    prev.parkImages === next.parkImages &&
    prev.afterContent === next.afterContent &&
    prev.belowBubbleContent === next.belowBubbleContent
  );
}

export default memo(MessageBubble, messageBubblePropsAreEqual);
