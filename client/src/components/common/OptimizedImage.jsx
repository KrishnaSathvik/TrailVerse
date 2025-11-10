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

  const isDevelopment = import.meta.env.DEV;
  let apiBaseUrl = import.meta.env.VITE_API_URL || (isDevelopment ? 'http://localhost:5001' : 'https://trailverse.onrender.com');
  
  // Normalize apiBaseUrl - remove trailing /api if present
  if (apiBaseUrl.endsWith('/api')) {
    apiBaseUrl = apiBaseUrl.slice(0, -4);
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
  
  // If it's a trailverse.onrender.com/uploads/ URL or /uploads/ path, use API endpoint
  if (url.includes('trailverse.onrender.com/uploads/') || url.includes('/uploads/')) {
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
  const [error, setError] = useState(false);
  const [imageSrc, setImageSrc] = useState(() => normalizeImageUrl(src));
  const [fallbackSrc, setFallbackSrc] = useState(null);

  // Update image source if src prop changes
  useEffect(() => {
    const normalized = normalizeImageUrl(src);
    setImageSrc(normalized);
    setError(false); // Reset error when src changes
    setFallbackSrc(null); // Reset fallback
    
    // If we converted to API endpoint, set fallback to direct URL
    if (src && (src.includes('trailverse.onrender.com/uploads/') || src.includes('/uploads/') || src.includes('localhost:5001/uploads/'))) {
      // Handle localhost URLs in production
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
        const directUrl = isDevelopment ? `${apiBaseUrl}${filePath}` : filePath;
        setFallbackSrc(directUrl);
      }
    }
  }, [src]);

  const DEFAULT_IMAGE = '/og-image-trailverse.jpg';
  const [attemptCount, setAttemptCount] = useState(0);

  const handleImageError = (e) => {
    console.error('Image failed to load:', imageSrc, e);
    
    // First attempt: try fallback URL if we have one and are using API endpoint
    if (attemptCount === 0 && fallbackSrc && imageSrc && imageSrc.includes('/api/images/file/')) {
      console.log('Trying fallback URL:', fallbackSrc);
      setImageSrc(fallbackSrc);
      setAttemptCount(1);
      setError(false);
    } 
    // Second attempt: try default image
    else if (attemptCount <= 1 && imageSrc !== DEFAULT_IMAGE) {
      console.log('Trying default image:', DEFAULT_IMAGE);
      setImageSrc(DEFAULT_IMAGE);
      setAttemptCount(2);
      setError(false);
    } 
    // All attempts failed, show placeholder
    else {
      setError(true);
    }
  };

  // Reset attempt count when src changes
  useEffect(() => {
    setAttemptCount(0);
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
      onError={handleImageError}
      style={{ objectFit }}
      decoding="async"
      fetchpriority="auto"
    />
  );
};

export default OptimizedImage;
