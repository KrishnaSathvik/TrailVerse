import React, { useState } from 'react';
import { 
  Image as ImageIcon, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Download,
  Maximize2
} from 'lucide-react';
import { useAnalytics } from '../../hooks/useAnalytics';

const ReviewImages = ({ images, reviewId, parkCode }) => {
  const { trackUserAction } = useAnalytics();
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  if (!images || images.length === 0) {
    return null;
  }

  const openLightbox = (index) => {
    setSelectedImageIndex(index);
    setIsLightboxOpen(true);
    trackUserAction('review_image_view', {
      reviewId,
      parkCode,
      imageIndex: index,
      totalImages: images.length
    });
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setSelectedImageIndex(null);
  };

  const navigateImage = (direction) => {
    if (direction === 'next') {
      setSelectedImageIndex((prev) => 
        prev === images.length - 1 ? 0 : prev + 1
      );
    } else {
      setSelectedImageIndex((prev) => 
        prev === 0 ? images.length - 1 : prev - 1
      );
    }
  };

  const handleDownload = (imageUrl, index) => {
    trackUserAction('review_image_download', {
      reviewId,
      parkCode,
      imageIndex: index
    });
    
    // Create download link
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `review-${reviewId}-image-${index + 1}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      {/* Image Grid */}
      <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {images.slice(0, 6).map((imageUrl, index) => (
          <div
            key={index}
            className="relative group cursor-pointer overflow-hidden rounded-lg bg-gray-100"
            onClick={() => openLightbox(index)}
          >
            <img
              src={imageUrl}
              alt={`Review image ${index + 1}`}
              className="w-full h-24 sm:h-32 object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="h-6 w-6 text-white" />
              </div>
            </div>

            {/* Show more indicator */}
            {index === 5 && images.length > 6 && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  +{images.length - 6} more
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
          <div className="relative max-w-4xl max-h-full p-4">
            {/* Close Button */}
            <button
              onClick={closeLightbox}
              className="absolute top-2 right-2 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Navigation Buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => navigateImage('prev')}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-colors"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => navigateImage('next')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-colors"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}

            {/* Image */}
            <img
              src={images[selectedImageIndex]}
              alt={`Review image ${selectedImageIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />

            {/* Image Info and Controls */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
              <span className="text-sm">
                {selectedImageIndex + 1} of {images.length}
              </span>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => handleDownload(images[selectedImageIndex], selectedImageIndex)}
                  className="bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-colors"
                  title="Download image"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Keyboard Navigation */}
            <div 
              className="absolute inset-0 focus:outline-none"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowLeft') navigateImage('prev');
                if (e.key === 'ArrowRight') navigateImage('next');
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ReviewImages;
