import React from 'react';
import { Facebook, Twitter, Linkedin, Link2, Mail } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const ShareButtons = ({ url, title, description }) => {
  const { showToast } = useToast();
  const shareUrl = url || window.location.href;

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
      name: 'LinkedIn',
      icon: Linkedin,
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
      color: 'hover:bg-blue-700'
    },
    {
      name: 'Email',
      icon: Mail,
      url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description || shareUrl)}`,
      color: 'hover:bg-gray-600'
    }
  ];

  return (
    <div className="flex items-center gap-2">
      {shareLinks.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2.5 rounded-lg transition ${link.color}`}
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
            title={`Share on ${link.name}`}
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
      
      <button
        onClick={handleCopyLink}
        className="p-2.5 rounded-lg transition hover:bg-green-600"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)'
        }}
        title="Copy link"
      >
        <Link2 className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ShareButtons;
