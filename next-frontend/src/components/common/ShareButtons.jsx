import React, { useState } from 'react';
import { Facebook, Twitter, Instagram, Link2, Mail, Share2, Download, X } from '@components/icons';
import { useToast } from '../../context/ToastContext';
import { logShare } from '../../utils/analytics';
import Button from './Button';

const ShareButtons = ({
  url,
  title,
  description,
  image,
  type = 'default',
  showPrint = null,
  blogPost = null,
}) => {
  const { showToast } = useToast();
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const shouldShowPdf = showPrint !== null
    ? showPrint
    : Boolean(blogPost);

  const generatePublicUrl = () => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      if (url.includes('nationalparksexplorerusa.com')) {
        return url;
      }
    }

    if (typeof window !== 'undefined' && window.location.href) {
      const currentUrl = window.location.href;
      if (currentUrl.includes('nationalparksexplorerusa.com')) {
        return currentUrl;
      }
      if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
        const pathname = window.location.pathname;
        const search = window.location.search;
        const hash = window.location.hash;
        return `https://www.nationalparksexplorerusa.com${pathname}${search}${hash}`;
      }
      return currentUrl;
    }

    return url || '';
  };

  const getAbsoluteImageUrl = (imgUrl) => {
    if (!imgUrl || imgUrl.trim() === '') return null;
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://') || imgUrl.startsWith('data:')) {
      return imgUrl;
    }

    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://www.nationalparksexplorerusa.com';

    if (imgUrl.startsWith('//')) {
      const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
      return `${protocol}${imgUrl}`;
    }

    if (imgUrl.startsWith('/')) {
      return `${baseUrl}${imgUrl}`;
    }

    return `${baseUrl}/${imgUrl}`;
  };

  const shareUrl = generatePublicUrl();
  const shareImageUrl = image ? getAbsoluteImageUrl(image) : null;

  const shortenUrl = (value) => {
    if (!value) return '';
    try {
      const urlObj = new URL(value);
      const hostname = urlObj.hostname.replace(/^www\./, '');
      return hostname + urlObj.pathname;
    } catch {
      const match = value.match(/https?:\/\/(?:www\.)?([^/]+)(.*)/);
      if (match) {
        return match[1] + match[2];
      }
      return value;
    }
  };

  const handleCopyLink = () => {
    const currentUrl = generatePublicUrl();
    navigator.clipboard.writeText(currentUrl);
    logShare('copy_link', title || currentUrl, type);
    showToast('Link copied to clipboard!', 'success');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        const currentUrl = generatePublicUrl();
        const currentTitle = title || 'Check this out!';
        await navigator.share({ title: currentTitle, url: currentUrl });
        logShare('native_share', title || currentUrl, type);
        showToast('Shared successfully!', 'success');
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          showToast('Failed to share. Please try again.', 'error');
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleSavePdf = async () => {
    if (!blogPost) {
      showToast('PDF export is not available for this page.', 'info');
      return;
    }

    setIsExportingPdf(true);
    try {
      const { exportBlogPdf } = await import('@/lib/pdf/exportBlogPdf');
      await exportBlogPdf({
        ...blogPost,
        canonicalUrl: blogPost.canonicalUrl || shareUrl || url,
      });
      logShare('save_pdf', title || blogPost.title, type);
      showToast('Article saved as PDF!', 'success');
    } catch (error) {
      console.error('PDF export error:', error);
      showToast('Failed to export PDF. Please try again.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const getShareUrl = (platform) => {
    const currentUrl = generatePublicUrl();
    const currentTitle = title || '';
    const shortenedUrl = shortenUrl(currentUrl);
    logShare(platform.toLowerCase(), currentTitle || currentUrl, type);

    switch (platform) {
      case 'Facebook':
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`;
      case 'Twitter':
        return `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(currentTitle)}`;
      case 'Instagram':
        return 'https://www.instagram.com/';
      case 'LinkedIn':
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`;
      case 'WhatsApp': {
        const whatsappText = `${currentTitle} ${shortenedUrl}`;
        return `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
      }
      case 'Reddit':
        return `https://reddit.com/submit?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent(currentTitle)}`;
      case 'Email': {
        const emailBody = `${currentTitle}\n${shortenedUrl}`;
        return `mailto:?subject=${encodeURIComponent(currentTitle)}&body=${encodeURIComponent(emailBody)}`;
      }
      default:
        return currentUrl;
    }
  };

  const shareLinks = [
    { name: 'Facebook', icon: Facebook, color: 'hover:bg-blue-600' },
    { name: 'Twitter', icon: Twitter, color: 'hover:bg-sky-500' },
    { name: 'Instagram', icon: Instagram, color: 'hover:bg-pink-600' },
    { name: 'LinkedIn', icon: Share2, color: 'hover:bg-blue-700' },
    { name: 'WhatsApp', icon: Share2, color: 'hover:bg-green-600' },
    { name: 'Reddit', icon: Share2, color: 'hover:bg-orange-600' },
    { name: 'Email', icon: Mail, color: 'hover:bg-gray-600' },
  ];

  const supportsNativeShare = typeof navigator !== 'undefined' && navigator.share;
  const isCompactShareMenu = type === 'park' || type === 'article';
  const pdfButtonLabel = isExportingPdf ? 'Exporting...' : 'Save as PDF';

  const pdfButton = shouldShowPdf ? (
    <Button
      onClick={async () => {
        await handleSavePdf();
        setShowMoreOptions(false);
      }}
      variant="ghost"
      size="sm"
      icon={Download}
      className="w-full justify-start"
      disabled={isExportingPdf}
    >
      {pdfButtonLabel}
    </Button>
  ) : null;

  if (isCompactShareMenu) {
    const isArticleStyle = type === 'article';
    const buttonLabel = isArticleStyle ? 'Share Article' : 'Share Park';
    const menuLabel = isArticleStyle ? 'Share This Article' : 'Share This Park';

    return (
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-auto sm:flex-shrink-0">
          <Button
            onClick={async () => {
              if (!isArticleStyle && supportsNativeShare) {
                try {
                  await handleNativeShare();
                  return;
                } catch (error) {
                  if (error.name === 'AbortError') {
                    return;
                  }
                }
              }
              setShowMoreOptions(!showMoreOptions);
            }}
            variant="secondary"
            size="sm"
            icon={Share2}
            className="backdrop-blur w-full sm:w-auto sm:flex-shrink-0"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
            }}
            title={menuLabel}
          >
            {buttonLabel}
          </Button>

          {showMoreOptions && isArticleStyle && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setShowMoreOptions(false)}
            >
              <div
                className="relative w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                    >
                      <Share2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        Share This Article
                      </h3>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Choose how to share
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowMoreOptions(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl transition-colors"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <X className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--border)' }} />

                <div className="p-4 flex flex-col gap-1">
                  {supportsNativeShare && (
                    <Button
                      onClick={async () => {
                        await handleNativeShare();
                        setShowMoreOptions(false);
                      }}
                      variant="ghost"
                      size="sm"
                      icon={Share2}
                      className="w-full justify-start"
                    >
                      Share via...
                    </Button>
                  )}

                  <Button
                    onClick={() => {
                      handleCopyLink();
                      setShowMoreOptions(false);
                    }}
                    variant="ghost"
                    size="sm"
                    icon={Link2}
                    className="w-full justify-start"
                  >
                    Copy link
                  </Button>

                  {shareLinks
                    .filter((link) => ['Facebook', 'Twitter', 'Email'].includes(link.name))
                    .map((link) => {
                      const Icon = link.icon;
                      return (
                        <Button
                          key={link.name}
                          onClick={() => {
                            window.open(getShareUrl(link.name), '_blank', 'noopener,noreferrer');
                            setShowMoreOptions(false);
                          }}
                          variant="ghost"
                          size="sm"
                          icon={Icon}
                          className="w-full justify-start"
                        >
                          {link.name}
                        </Button>
                      );
                    })}

                  {shouldShowPdf && (
                    <>
                      <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }} />
                      {pdfButton}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {showMoreOptions && !isArticleStyle && (
            <>
              <div
                className="absolute right-0 mt-2 w-56 rounded-2xl p-2 z-50"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                    {menuLabel}
                  </p>
                </div>

                <Button
                  onClick={async () => {
                    if (supportsNativeShare) {
                      await handleNativeShare();
                    } else {
                      handleCopyLink();
                    }
                    setShowMoreOptions(false);
                  }}
                  variant="ghost"
                  size="sm"
                  icon={Share2}
                  className="w-full justify-start mb-1 mt-1"
                >
                  Share via...
                </Button>

                <Button
                  onClick={() => {
                    handleCopyLink();
                    setShowMoreOptions(false);
                  }}
                  variant="ghost"
                  size="sm"
                  icon={Link2}
                  className="w-full justify-start mb-1"
                >
                  Copy link
                </Button>

                {shareLinks
                  .filter((link) => ['Facebook', 'Twitter', 'Email'].includes(link.name))
                  .map((link) => {
                    const Icon = link.icon;
                    return (
                      <Button
                        key={link.name}
                        onClick={() => {
                          window.open(getShareUrl(link.name), '_blank', 'noopener,noreferrer');
                          setShowMoreOptions(false);
                        }}
                        variant="ghost"
                        size="sm"
                        icon={Icon}
                        className="w-full justify-start mb-1"
                      >
                        {link.name}
                      </Button>
                    );
                  })}

                {pdfButton}
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMoreOptions(false)}
                style={{ cursor: 'pointer' }}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap sm:flex-nowrap relative">
      {shareLinks.slice(0, 3).map((link) => {
        const Icon = link.icon;
        return (
          <Button
            key={link.name}
            onClick={() => {
              window.open(getShareUrl(link.name), '_blank', 'noopener,noreferrer');
            }}
            variant="secondary"
            size="sm"
            icon={Icon}
            title={`Share on ${link.name}`}
            className="backdrop-blur flex-shrink-0"
            style={{
              padding: '0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: '1px',
              borderColor: 'rgba(255, 255, 255, 0.3)',
            }}
          />
        );
      })}

      <div className="relative flex-shrink-0">
        <Button
          onClick={async () => {
            if (supportsNativeShare) {
              try {
                await handleNativeShare();
                return;
              } catch (error) {
                if (error.name === 'AbortError') {
                  return;
                }
              }
            }
            setShowMoreOptions(!showMoreOptions);
          }}
          variant="secondary"
          size="sm"
          icon={Share2}
          title={supportsNativeShare ? 'Share to other apps' : 'More sharing options'}
          className="backdrop-blur flex-shrink-0"
          style={{
            padding: '0.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: '1px',
            borderColor: 'rgba(255, 255, 255, 0.3)',
          }}
        />

        {showMoreOptions && (
          <div
            className="absolute right-0 mt-2 p-2 rounded-lg backdrop-blur z-50 min-w-[150px]"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {shareLinks.slice(3).map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.name}
                  onClick={() => {
                    window.open(getShareUrl(link.name), '_blank', 'noopener,noreferrer');
                    setShowMoreOptions(false);
                  }}
                  variant="ghost"
                  size="sm"
                  icon={Icon}
                  title={`Share on ${link.name}`}
                  className="w-full justify-start mb-1"
                >
                  {link.name}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {showMoreOptions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMoreOptions(false)}
          style={{ cursor: 'pointer' }}
        />
      )}

      <Button
        onClick={handleCopyLink}
        variant="secondary"
        size="sm"
        icon={Link2}
        title="Copy link"
        className="backdrop-blur flex-shrink-0"
        style={{
          padding: '0.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: '1px',
          borderColor: 'rgba(255, 255, 255, 0.3)',
        }}
      />

      {shouldShowPdf && (
        <Button
          onClick={handleSavePdf}
          variant="secondary"
          size="sm"
          icon={Download}
          title="Save as PDF"
          disabled={isExportingPdf}
          className="backdrop-blur flex-shrink-0"
          style={{
            padding: '0.5rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: '1px',
            borderColor: 'rgba(255, 255, 255, 0.3)',
          }}
        />
      )}
    </div>
  );
};

export default ShareButtons;
