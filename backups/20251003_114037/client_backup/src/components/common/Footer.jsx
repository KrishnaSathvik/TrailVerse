import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const Footer = () => {
  const { isDark } = useTheme();
  
  return (
    <footer 
      className="text-gray-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your gateway to exploring America's 63 National Parks
            </p>
          </div>


          {/* Resources */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Resources</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/faq" className="transition" style={{ color: 'var(--text-secondary)' }}>FAQ</Link></li>
              <li><a href="https://www.nps.gov" target="_blank" rel="noopener noreferrer" className="transition" style={{ color: 'var(--text-secondary)' }}>NPS Official Site</a></li>
              <li><Link to="/about" className="transition" style={{ color: 'var(--text-secondary)' }}>About Us</Link></li>
              <li><Link to="/privacy" className="transition" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link></li>
              <li><Link to="/terms" className="transition" style={{ color: 'var(--text-secondary)' }}>Terms of Service</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Contact</h3>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <a 
                href="mailto:travelswithkrishna@gmail.com" 
                className="text-sm transition hover:opacity-80" 
                style={{ color: 'var(--text-secondary)' }}
              >
                travelswithkrishna@gmail.com
              </a>
            </div>
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
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              &copy; {new Date().getFullYear()} TrailVerse. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
