import React, { useState } from 'react';

const OptimizedImage = ({ 
  src, 
  alt, 
  className = '', 
  width, 
  height,
  objectFit = 'cover'
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
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading="lazy"
      onError={() => setError(true)}
      style={{ objectFit }}
    />
  );
};

export default OptimizedImage;
