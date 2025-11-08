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

  // Convert /uploads/... paths to /api/images/file/... paths FIRST
  if (url.includes('/uploads/')) {
    // Extract the path after /uploads/
    const uploadsIndex = url.indexOf('/uploads/');
    const pathAfterUploads = url.substring(uploadsIndex + '/uploads/'.length);
    
    // Convert to API endpoint format
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Full URL - extract domain and convert path
      const domain = url.substring(0, uploadsIndex);
      url = `${domain}/api/images/file/${pathAfterUploads}`;
    } else {
      // Relative path
      url = `/api/images/file/${pathAfterUploads}`;
    }
  }

  // Convert HTTP to HTTPS (after path conversion)
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
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
