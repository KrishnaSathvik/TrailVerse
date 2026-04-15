"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download } from '@components/icons';

const PhotoLightbox = ({ images, initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState(null);

  const image = images[currentIndex];

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, goNext, goPrev]);

  // Touch swipe support
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${image.altText || image.title || 'park-photo'}-${currentIndex + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback: open image in new tab
      window.open(image.url, '_blank');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <span className="text-white/70 text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="h-10 w-10 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
            title="Download"
          >
            <Download className="h-5 w-5 text-white" />
          </button>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full flex items-center justify-center transition-colors"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
            title="Close"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Main image */}
      <img
        src={image.url}
        alt={image.altText || image.title || 'Park photo'}
        className="max-h-[85vh] max-w-[95vw] object-contain select-none"
        draggable={false}
      />

      {/* Left arrow */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
      )}

      {/* Right arrow */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
        >
          <ChevronRight className="h-5 w-5 text-white" />
        </button>
      )}

      {/* Caption */}
      {(image.caption || image.altText) && (
        <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
          <p className="text-white/80 text-sm">
            {image.caption || image.altText}
          </p>
          {image.credit && (
            <p className="text-white/50 text-xs mt-1">
              Credit: {image.credit}
            </p>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};

export default PhotoLightbox;
