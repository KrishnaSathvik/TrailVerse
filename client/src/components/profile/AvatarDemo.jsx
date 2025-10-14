import React, { useState } from 'react';
import UnifiedAvatarSelector from './UnifiedAvatarSelector';
import AvatarUpload from './AvatarUpload';

/**
 * Demo component showing how to use the new avatar system
 * This can be used as a standalone avatar picker in other parts of the app
 */
const AvatarDemo = () => {
  const [selectedAvatar, setSelectedAvatar] = useState('https://api.dicebear.com/9.x/avataaars/svg?seed=demo');
  const [user] = useState({
    email: 'demo@example.com',
    firstName: 'Demo',
    lastName: 'User'
  });

  const handleAvatarChange = (newAvatar) => {
    setSelectedAvatar(newAvatar);
    console.log('Avatar changed to:', newAvatar);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white">
          Avatar System Demo
        </h2>
        
        {/* Current Avatar Display */}
        <div className="text-center mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Current Avatar
          </h3>
          <img
            src={selectedAvatar}
            alt="Selected avatar"
            className="w-24 h-24 rounded-full mx-auto border-4 border-gray-200 dark:border-gray-600 object-cover"
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {selectedAvatar.includes('dicebear.com') || selectedAvatar.includes('boringavatars.com') 
              ? 'Generated Avatar' 
              : selectedAvatar.includes('localhost') || selectedAvatar.includes('api')
              ? 'Uploaded Image'
              : 'Custom Avatar'
            }
          </p>
        </div>

        {/* Unified Avatar Selector */}
        <div className="mb-8">
          <UnifiedAvatarSelector
            user={user}
            currentAvatar={selectedAvatar}
            onAvatarChange={handleAvatarChange}
            showGenerated={true}
            showUpload={true}
          />
        </div>

        {/* Standalone Upload Component */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
          <h3 className="text-lg font-semibold mb-4 text-center text-gray-700 dark:text-gray-300">
            Or Use Standalone Upload
          </h3>
          <AvatarUpload
            user={user}
            currentAvatar={selectedAvatar}
            onAvatarChange={handleAvatarChange}
            maxSize={5 * 1024 * 1024}
            showPreview={true}
          />
        </div>

        {/* Usage Instructions */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">
            How to Use:
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• <strong>Generated Avatars:</strong> Choose from 8 pre-generated options or create random ones</li>
            <li>• <strong>Upload Images:</strong> Drag & drop or click to upload your own images (JPEG, PNG, GIF, WebP)</li>
            <li>• <strong>Automatic Resizing:</strong> Images are automatically resized to 400x400px for optimal performance</li>
            <li>• <strong>Real-time Preview:</strong> See your selection immediately before saving</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AvatarDemo;
