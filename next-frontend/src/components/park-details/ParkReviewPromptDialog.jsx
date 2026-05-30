import React, { useEffect } from 'react';
import { Star, X } from '@components/icons';
import Button from '../common/Button';

export default function ParkReviewPromptDialog({
  isOpen,
  onClose,
  parkName,
  onLeaveTip,
}) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const shortName = parkName?.replace(/\s+National Park$/i, '') || parkName || 'this park';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="park-review-prompt-title"
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 transition-colors z-10"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8 pt-10 text-center">
          <div
            className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(250, 204, 21, 0.15)' }}
          >
            <Star className="h-8 w-8" weight="fill" style={{ color: '#facc15' }} />
          </div>

          <h2
            id="park-review-prompt-title"
            className="text-2xl font-bold tracking-tight mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            How was {shortName}?
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
            Leave a 30-second tip for the next visitor — parking, crowds, trails, or one thing you wish you&apos;d known.
          </p>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              onClick={onLeaveTip}
            >
              Leave a quick tip
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium py-2 transition-colors hover:underline"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
