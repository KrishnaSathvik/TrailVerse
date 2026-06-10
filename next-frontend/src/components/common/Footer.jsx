"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { reportHref } from '@/lib/reportLinks';
import { Mail, Instagram, Facebook, Map } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import SyncStatus from './SyncStatus';

const Footer = () => {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const reportFrom = pathname || '/';
  const { canInstall, canInstallDesktop, install, deferredPrompt } = usePWAInstall();
  const [showInstallLink, setShowInstallLink] = useState(false);

  useEffect(() => {
    setShowInstallLink(canInstall || canInstallDesktop);
  }, [canInstall, canInstallDesktop]);

  const handleInstall = async (e) => {
    e.preventDefault();
    if (deferredPrompt) {
      await install();
    }
  };

  return (
    <footer
      className="text-gray-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
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
            <p className="text-base sm:text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Your Universe of National Parks Exploration
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://instagram.com/travelswithkrishna"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.facebook.com/travelswithkrishna/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://www.tiktok.com/@travelswithkrishna"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="TikTok"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.19 8.19 0 0 0 4.76 1.52V6.78a4.83 4.83 0 0 1-1-.09z"/>
                </svg>
              </a>
              <a
                href="https://www.google.com/maps/contrib/118219629305553937668"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Google Maps"
              >
                <Map className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="min-w-0">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Links</h3>
            <ul className="space-y-2 text-base sm:text-sm">
              <li><Link href="/plan-ai" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Plan with Trailie</Link></li>
              <li><Link href="/explore" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Explore Parks</Link></li>
              <li><Link href="/features" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Features</Link></li>
              <li><Link href="/faq" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>FAQ</Link></li>
              <li><Link href="/testimonials" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Testimonials</Link></li>
              <li><Link href="/newsletter" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Newsletter</Link></li>
              {!isAuthenticated && (
                <li><Link href="/signup" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Sign up</Link></li>
              )}
              <li><a href="https://www.nps.gov" target="_blank" rel="noopener noreferrer" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>NPS Official Site</a></li>
              {showInstallLink && (
                <li><a href="#" onClick={handleInstall} className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Install App</a></li>
              )}
            </ul>
          </div>

          {/* Resources */}
          <div className="min-w-0">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Resources</h3>
            <ul className="space-y-2 text-base sm:text-sm">
              <li><Link href="/blog" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Blog</Link></li>
              <li><Link href="/guides" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Planning Guides</Link></li>
              <li><Link href="/about" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>About</Link></li>
              <li><Link href="/magazine" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Magazine</Link></li>
              <li><Link href="/chatgpt" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>ChatGPT App</Link></li>
              <li><Link href="/mcp" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>MCP for Claude</Link></li>
              <li><Link href="/privacy" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link></li>
              <li><Link href="/terms" className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Terms of Service</Link></li>
            </ul>
          </div>

          {/* Reports */}
          <div className="min-w-0">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Reports</h3>
            <ul className="space-y-2 text-base sm:text-sm">
              <li><a href={reportHref('/reports/national-parks-2025.html', { from: reportFrom })} className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>2025 Park Report</a></li>
              <li><a href={reportHref('/reports/when-to-go', { from: reportFrom })} className="transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>Crowd Calendar</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="min-w-0">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Contact</h3>
            <a
              href="mailto:trailverseteam@gmail.com"
              className="inline-flex items-center gap-2 text-sm transition hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Mail className="h-4 w-4 shrink-0" />
              <span className="lg:hidden">Email us</span>
              <span className="hidden lg:inline">trailverseteam@gmail.com</span>
            </a>

            {/* Sync Status - Only show for authenticated users */}
            {isAuthenticated && <SyncStatus />}
          </div>
        </div>

        {/* Bottom */}
        <div
          className="mt-8 pt-8 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
            &copy; {new Date().getFullYear()} TrailVerse. All rights reserved.
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline mt-1 sm:mt-0">Not affiliated with the National Park Service.</span>
          </p>
        </div>
      </div>

    </footer>
  );
};

export default Footer;
