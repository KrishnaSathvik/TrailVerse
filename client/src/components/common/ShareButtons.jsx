import React from 'react';
import { Facebook, Twitter, Instagram, Link2, Mail } from '@components/icons';
import { useToast } from '../../context/ToastContext';
import Button from './Button';

const ShareButtons = ({ url, title, description, type = 'default' }) => {
  const { showToast } = useToast();
  
  // Generate share URL - all main routes are now public
  const generatePublicUrl = () => {
    if (url) return url;
    return window.location.href;
  };
  
  const shareUrl = generatePublicUrl();

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    showToast('Link copied to clipboard!', 'success');
  };

  const shareLinks = [
    {
      name: 'Facebook',
      icon: Facebook,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      color: 'hover:bg-blue-600'
    },
    {
      name: 'Twitter',
      icon: Twitter,
      url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
      color: 'hover:bg-sky-500'
    },
    {
      name: 'Instagram',
      icon: Instagram,
      url: `https://www.instagram.com/`,
      color: 'hover:bg-pink-600'
    },
    {
      name: 'Email',
      icon: Mail,
      url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description || shareUrl)}`,
      color: 'hover:bg-gray-600'
    }
  ];

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {shareLinks.map((link) => {
        const Icon = link.icon;
        return (
          <Button
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="sm"
            icon={Icon}
            title={`Share on ${link.name}`}
            className="backdrop-blur"
            style={{ 
              padding: '0.5rem',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: '1px',
              borderColor: 'rgba(255, 255, 255, 0.3)'
            }}
          />
        );
      })}
      
      <Button
        onClick={handleCopyLink}
        variant="secondary"
        size="sm"
        icon={Link2}
        title="Copy link"
        className="backdrop-blur"
        style={{ 
          padding: '0.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: '1px',
          borderColor: 'rgba(255, 255, 255, 0.3)'
        }}
      />
    </div>
  );
};

export default ShareButtons;
