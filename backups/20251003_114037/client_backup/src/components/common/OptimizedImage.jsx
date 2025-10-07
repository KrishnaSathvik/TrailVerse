import React, { useState } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  width, 
  height,
  objectFit = 'cover',
  placeholder = '/placeholder.svg',
  effect = 'blur'
}) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`bg-gray-200 flex items-center justify-center ${className}`}>
        <div className="text-center p-4">
          <p className="text-gray-500 text-sm">Image not available</p>
        </div>
      </div>
    );
  }

  return (
    <LazyLoadImage
      src={src}
      alt={alt}
      effect={effect}
      width={width}
      height={height}
      className={className}
      placeholderSrc={placeholder}
      onError={() => setError(true)}
      style={{ objectFit }}
    />
  );
};

export default OptimizedImage;
