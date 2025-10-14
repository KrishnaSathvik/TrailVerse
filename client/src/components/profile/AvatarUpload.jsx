import React, { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import imageUploadService from '../../services/imageUploadService';
import { useToast } from '../../context/ToastContext';

/**
 * Avatar Upload Component with drag & drop functionality
 * Supports image upload, preview, and integration with existing avatar system
 */
const AvatarUpload = ({ 
  user, 
  currentAvatar, 
  onAvatarChange, 
  onUploadComplete,
  className = '',
  showPreview = true,
  maxSize = 5 * 1024 * 1024, // 5MB default
  acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  // Handle file drop/selection
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      // Validate file
      if (file.size > maxSize) {
        throw new Error(`File size too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
      }

      if (!acceptedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Please use JPEG, PNG, GIF, or WebP.');
      }

      // Create preview
      const previewUrl = await imageUploadService.createImagePreview(file);
      setPreview(previewUrl);

      // Resize image for avatar (square, 400x400 max)
      const resizedBlob = await imageUploadService.resizeImage(file, 400, 400, 0.9);
      
      // Convert Blob back to File object with proper metadata
      const resizedFile = new File([resizedBlob], file.name, {
        type: file.type,
        lastModified: Date.now()
      });
      
      // Upload as profile picture
      const uploadResult = await imageUploadService.uploadProfilePicture(resizedFile);
      
      // Extract the relative path from the server URL (e.g., "profile/image.jpg")
      const relativePath = imageUploadService.extractRelativePath(uploadResult.url);
      
      // Get the uploaded image URL for API access
      const imageUrl = imageUploadService.getImageUrl(relativePath);
      
      // Update avatar
      onAvatarChange(imageUrl);
      
      // Call completion callback
      if (onUploadComplete) {
        onUploadComplete(uploadResult);
      }

      showToast('Avatar uploaded successfully!', 'success');
      
    } catch (err) {
      console.error('Avatar upload error:', err);
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }, [maxSize, acceptedTypes, onAvatarChange, onUploadComplete, showToast]);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    multiple: false
  });

  // Handle file input click
  const handleFileInputClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onDrop([file]);
    }
  };

  // Clear preview
  const clearPreview = () => {
    setPreview(null);
    setError(null);
  };

  return (
    <div className={`avatar-upload-container ${className}`}>
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200
          ${isDragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={{ color: 'var(--text-primary)' }}
      >
        <input {...getInputProps()} disabled={uploading} />
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-sm">Uploading avatar...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            <div className="text-4xl">📸</div>
            <div>
              <p className="text-lg font-medium">
                {isDragActive ? 'Drop your image here' : 'Upload Avatar'}
              </p>
              <p className="text-sm opacity-70 mt-1">
                Drag & drop an image, or click to select
              </p>
              <p className="text-xs opacity-50 mt-2">
                Supports: JPEG, PNG, GIF, WebP (max {Math.round(maxSize / 1024 / 1024)}MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={clearPreview}
            className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            Clear error
          </button>
        </div>
      )}

      {/* Preview */}
      {showPreview && (preview || currentAvatar) && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Avatar Preview
            </h4>
            {(preview || currentAvatar) && (
              <button
                onClick={clearPreview}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Clear
              </button>
            )}
          </div>
          
          <div className="relative inline-block">
            <img
              src={preview || currentAvatar}
              alt="Avatar preview"
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
            />
            {uploading && (
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Tips */}
      <div className="mt-4 text-xs opacity-60" style={{ color: 'var(--text-secondary)' }}>
        <p>💡 <strong>Tips:</strong> Use square images for best results. Images will be automatically resized to 400x400px.</p>
      </div>
    </div>
  );
};

export default AvatarUpload;
