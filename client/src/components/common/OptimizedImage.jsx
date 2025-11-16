import React, { useState, useEffect, useMemo } from 'react';

// Normalize image URL - convert HTTP to HTTPS and handle relative paths
const normalizeImageUrl = (url) => {
  if (!url || url.trim() === '') {
    return null;
  }

  // Skip data URLs
  if (url.startsWith('data:image/')) {
    return null; // Data URLs can't be used for images
  }

  // Detect invalid URLs - just filenames without protocols or proper paths
  // Valid URLs should start with http://, https://, or /, or contain /uploads/
  // If it's just a filename like "image.jpg" without any path indicators, it's likely invalid
  const trimmedUrl = url.trim();
  
  // Check for just a filename without proper path (e.g., "image.jpg")
  // Note: Timestamp-based filenames like "1762743485952-599403375.jpg" are valid uploads
  if (!trimmedUrl.startsWith('http://') && 
      !trimmedUrl.startsWith('https://') && 
      !trimmedUrl.startsWith('/') && 
      !trimmedUrl.includes('/') && 
      trimmedUrl.includes('.')) {
    // This looks like just a filename (e.g., "image.jpg") without a proper path
    // Likely invalid - return null to use default image
    if (import.meta.env.DEV) {
      console.warn('Invalid image URL detected (just filename without path):', url);
    }
    return null;
  }

  const isDevelopment = import.meta.env.DEV;
  let apiBaseUrl = import.meta.env.VITE_API_URL || (isDevelopment ? 'http://localhost:5001' : 'https://trailverse.onrender.com');
  
  // Normalize apiBaseUrl - remove trailing /api if present
  if (apiBaseUrl.endsWith('/api')) {
    apiBaseUrl = apiBaseUrl.slice(0, -4);
  }
  
  // If already a full HTTPS URL from external domain (like nps.gov), return as is
  // This handles park images from NPS API
  if (url.startsWith('https://') && !url.includes('trailverse.onrender.com') && !url.includes('localhost')) {
    return url;
  }
  
  // Handle localhost URLs in production - convert to production API URL
  if (!isDevelopment && url.includes('localhost:5001')) {
    // Replace localhost with production API URL
    url = url.replace(/http:\/\/localhost:5001/g, 'https://trailverse.onrender.com');
  }
  
  // Convert HTTP to HTTPS (for production)
  if (!isDevelopment && url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  
  // If it's a trailverse.onrender.com/uploads/ URL or relative /uploads/ path, use API endpoint
  // Only convert if it's from our domain or a relative path (not external domains)
  if (url.startsWith('/uploads/') || 
      url.includes('trailverse.onrender.com/uploads/') || 
      (url.includes('localhost:5001/uploads/') && isDevelopment)) {
    // Extract the path after /uploads/ (e.g., "general/1762611045214-709377760.jpg")
    const uploadsIndex = url.indexOf('/uploads/');
    if (uploadsIndex !== -1) {
      const filePath = url.substring(uploadsIndex + '/uploads/'.length);
      // Try API endpoint first (better error handling)
      const apiUrl = `${apiBaseUrl}/api/images/file/${filePath}`;
      
      if (isDevelopment) {
        // In development, return the API URL
        return apiUrl;
      } else {
        // In production, use relative path for Vercel proxy
        return `/api/images/file/${filePath}`;
      }
    }
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
  // Memoize normalized URL to avoid recalculating on every render
  const normalizedSrc = useMemo(() => normalizeImageUrl(src), [src]);
  
  // Memoize fallback URL calculation
  const fallbackSrc = useMemo(() => {
    if (!src) return null;

    // Only set fallback for /uploads/ paths
    if (src.includes('trailverse.onrender.com/uploads/') || src.includes('/uploads/') || src.includes('localhost:5001/uploads/')) {
      let processedSrc = src;
      const isDevelopment = import.meta.env.DEV;
      
      if (!isDevelopment && src.includes('localhost:5001')) {
        processedSrc = src.replace(/http:\/\/localhost:5001/g, 'https://trailverse.onrender.com');
      }
      
      const uploadsIndex = processedSrc.indexOf('/uploads/');
      if (uploadsIndex !== -1) {
        const filePath = processedSrc.substring(uploadsIndex); // This is /uploads/...
        let apiBaseUrl = import.meta.env.VITE_API_URL || (isDevelopment ? 'http://localhost:5001' : 'https://trailverse.onrender.com');
        
        // Normalize apiBaseUrl - remove trailing /api if present
        if (apiBaseUrl.endsWith('/api')) {
          apiBaseUrl = apiBaseUrl.slice(0, -4);
        }
        
        // Fallback should be direct /uploads/ path (not /api/uploads/)
        return isDevelopment ? `${apiBaseUrl}${filePath}` : filePath;
      }
    }
    return null;
  }, [src]);

  const [error, setError] = useState(false);
  const [imageSrc, setImageSrc] = useState(normalizedSrc);
  const [attemptCount, setAttemptCount] = useState(0);
  const DEFAULT_IMAGE = '/og-image-trailverse.jpg';

  // Update image source if normalized src changes (only when it actually changes)
  useEffect(() => {
    if (normalizedSrc && normalizedSrc !== imageSrc) {
      setImageSrc(normalizedSrc);
      setError(false);
      setAttemptCount(0);
    }
  }, [normalizedSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageError = (e) => {
    // Suppress default browser error logging for missing images
    e.preventDefault();
    
    // First attempt: try fallback URL if we have one and are using API endpoint
    if (attemptCount === 0 && fallbackSrc && imageSrc && imageSrc.includes('/api/images/file/')) {
      setImageSrc(fallbackSrc);
      setAttemptCount(1);
      setError(false);
      return; // Exit early to wait for fallback result
    } 
    // Second attempt: try default image (skip fallback if we don't have one or it already failed)
    if (attemptCount <= 1 && imageSrc !== DEFAULT_IMAGE) {
      setImageSrc(DEFAULT_IMAGE);
      setAttemptCount(2);
      setError(false);
      return; // Exit early to wait for default image result
    } 
    // All attempts failed, show placeholder
    // Only log in development when we've exhausted all options
    if (import.meta.env.DEV && attemptCount >= 2) {
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
    />
  );
};

export default OptimizedImage;
