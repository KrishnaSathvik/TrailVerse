import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from '@components/icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import SyncStatus from './SyncStatus';
import PWAInstallButton from './PWAInstallButton';

const Footer = () => {
  useTheme();
  const { isAuthenticated } = useAuth();
  
  return (
    <footer 
      className="text-gray-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img 
                src="/logo.png" 
                alt="TrailVerse Logo" 
                className="w-8 h-8 rounded-lg object-contain"
              />
              <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                TrailVerse
              </span>
            </div>
            <p className="text-base sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your Universe of National Parks Exploration
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Links</h3>
            <ul className="space-y-2 text-base sm:text-sm">
              <li><Link to="/features" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Features</Link></li>
              <li><Link to="/faq" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>FAQ</Link></li>
              <li><a href="https://www.nps.gov" target="_blank" rel="noopener noreferrer" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>NPS Official Site</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Resources</h3>
            <ul className="space-y-2 text-base sm:text-sm">
              <li><Link to="/about" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>About Us</Link></li>
              <li><Link to="/privacy" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link></li>
              <li><Link to="/terms" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Terms of Service</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Contact</h3>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <a 
                href="mailto:trailverseteam@gmail.com" 
                className="text-base sm:text-sm transition hover:opacity-80" 
                style={{ color: 'var(--text-secondary)' }}
              >
                trailverseteam@gmail.com
              </a>
            </div>
            
            {/* Sync Status - Only show for authenticated users */}
            {isAuthenticated && <SyncStatus />}
          </div>
        </div>

        {/* Bottom */}
        <div 
          className="mt-8 pt-8 border-t"
          style={{ 
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-base sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
              &copy; {new Date().getFullYear()} TrailVerse. All rights reserved.
            </p>
            <PWAInstallButton />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
