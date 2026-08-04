"use client";

import React, { useState, useEffect, useMemo } from 'react';

/**
 * Normalize image URL for display.
 * Uploads stay same-origin (/uploads/...) so Vercel can rewrite + edge-cache
 * instead of sending browsers straight to trailverse.onrender.com (Render egress).
 */
const normalizeImageUrl = (url) => {
  if (!url || url.trim() === '') {
    return null;
  }

  // Support local file previews used by admin forms before upload completes.
  if (url.startsWith('data:image/')) {
    return url;
  }

  const trimmedUrl = url.trim();
  
  // Check for just a filename without proper path (e.g., "image.jpg")
  if (!trimmedUrl.startsWith('http://') && 
      !trimmedUrl.startsWith('https://') && 
      !trimmedUrl.startsWith('/') && 
      !trimmedUrl.includes('/') && 
      trimmedUrl.includes('.')) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Invalid image URL detected (just filename without path):', url);
    }
    return null;
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // External HTTPS (nps.gov, unsplash, etc.) — leave alone
  if (
    trimmedUrl.startsWith('https://') &&
    !trimmedUrl.includes('trailverse.onrender.com') &&
    !trimmedUrl.includes('localhost') &&
    !trimmedUrl.includes('nationalparksexplorerusa.com')
  ) {
    return trimmedUrl;
  }

  let working = trimmedUrl;

  // Strip known absolute origins down to a site-relative path
  working = working
    .replace(/^https?:\/\/trailverse\.onrender\.com/i, '')
    .replace(/^https?:\/\/(www\.)?nationalparksexplorerusa\.com/i, '')
    .replace(/^https?:\/\/localhost:5001/i, '');

  if (!isDevelopment && working.startsWith('http://')) {
    working = working.replace('http://', 'https://');
  }

  // /uploads/... → keep as same-origin relative (Next rewrites to Render)
  if (working.startsWith('/uploads/')) {
    return working;
  }

  // Legacy API file path — also same-origin relative
  if (working.startsWith('/api/images/file/')) {
    return working;
  }

  // Absolute onrender /api/images/file already stripped above; handle leftover
  const uploadsIndex = working.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return working.substring(uploadsIndex);
  }

  const apiFileIndex = working.indexOf('/api/images/file/');
  if (apiFileIndex !== -1) {
    return working.substring(apiFileIndex);
  }

  if (working.startsWith('https://') || working.startsWith('/')) {
    return working;
  }

  return `/${working}`;
};

const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  width, 
  height,
  objectFit = 'cover',
  loading = 'lazy'
}) => {
  const normalizedSrc = useMemo(() => normalizeImageUrl(src), [src]);
  
  // Fallback: if /api/images/file fails, try /uploads equivalent
  const fallbackSrc = useMemo(() => {
    if (!normalizedSrc) return null;
    if (normalizedSrc.startsWith('/api/images/file/')) {
      return normalizedSrc.replace('/api/images/file/', '/uploads/');
    }
    return null;
  }, [normalizedSrc]);

  const [error, setError] = useState(false);
  const [imageSrc, setImageSrc] = useState(normalizedSrc);
  const [attemptCount, setAttemptCount] = useState(0);
  const DEFAULT_IMAGE = '/og-image-trailverse.jpg';

  useEffect(() => {
    if (normalizedSrc && normalizedSrc !== imageSrc) {
      setImageSrc(normalizedSrc);
      setError(false);
      setAttemptCount(0);
    }
  }, [normalizedSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageError = (e) => {
    e.preventDefault();
    
    if (attemptCount === 0 && fallbackSrc && imageSrc && imageSrc.includes('/api/images/file/')) {
      setImageSrc(fallbackSrc);
      setAttemptCount(1);
      setError(false);
      return;
    } 
    if (attemptCount <= 1 && imageSrc !== DEFAULT_IMAGE) {
      setImageSrc(DEFAULT_IMAGE);
      setAttemptCount(2);
      setError(false);
      return;
    } 
    if (process.env.NODE_ENV === 'development' && attemptCount >= 2) {
      console.warn('Image failed to load after all attempts:', imageSrc);
    }
    setError(true);
  };

  if (error || !imageSrc) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ backgroundColor: 'var(--surface)' }}>
        <div className="text-center p-4">
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Image not available</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={handleImageError}
      style={{ objectFit }}
      decoding="async"
      loading={loading}
    />
  );
};

export default OptimizedImage;
