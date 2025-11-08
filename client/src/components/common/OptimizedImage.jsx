import React, { useState, useEffect } from 'react';

// Normalize image URL - convert HTTP to HTTPS and handle relative paths
const normalizeImageUrl = (url) => {
  if (!url || url.trim() === '') {
    return null;
  }

  // Skip data URLs
  if (url.startsWith('data:image/')) {
    return null; // Data URLs can't be used for images
  }

  // Convert HTTP to HTTPS
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }

  // If already HTTPS or relative, return as is
  if (url.startsWith('https://') || url.startsWith('/')) {
    return url;
  }

  // If it's a relative path without leading slash, add it
  return `/${url}`;
};

const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  width, 
  height,
  objectFit = 'cover'
}) => {
  const [error, setError] = useState(false);
  const [imageSrc, setImageSrc] = useState(() => normalizeImageUrl(src));

  // Update image source if src prop changes
  useEffect(() => {
    const normalized = normalizeImageUrl(src);
    setImageSrc(normalized);
    setError(false); // Reset error when src changes
  }, [src]);

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
      loading="lazy"
      onError={() => setError(true)}
      style={{ objectFit }}
      crossOrigin="anonymous"
    />
  );
};

export default OptimizedImage;
