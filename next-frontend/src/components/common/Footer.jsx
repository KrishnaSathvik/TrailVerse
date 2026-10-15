"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { reportHref } from '@/lib/reportLinks';
import { Mail, Instagram, Facebook, Map } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import PWAInstallInstructionsModal from './PWAInstallInstructionsModal';
import SyncStatus from './SyncStatus';

const linkClass = 'transition hover:opacity-80';
const linkStyle = { color: 'var(--text-secondary)' };

function FooterSection({ title, children }) {
  return (
    <div className="min-w-0">
      <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <ul className="space-y-2 text-base sm:text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children, external = false }) {
  if (external) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          style={linkStyle}
        >
          {children}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link href={href} className={linkClass} style={linkStyle}>
        {children}
      </Link>
    </li>
  );
}

const Footer = () => {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const reportFrom = pathname || '/';
  const { canInstall, canInstallDesktop, isIOS, install, deferredPrompt } = usePWAInstall();
  const [showInstallLink, setShowInstallLink] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  useEffect(() => {
    setShowInstallLink(canInstall || canInstallDesktop);
  }, [canInstall, canInstallDesktop]);

  const handleInstall = async (e) => {
    e.preventDefault();
    if (deferredPrompt) {
      await install();
      return;
    }
    if (isIOS || canInstall) {
      setShowInstallInstructions(true);
    }
  };

  return (
    <footer
      className="public-footer border-t"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
    >
      <div className="public-shell py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img
                src="/brand/trailverse-logo-40.a8f681720be9.webp"
                srcSet="/brand/trailverse-logo-40.a8f681720be9.webp 1x, /brand/trailverse-logo-80.5ba3166e4f83.webp 2x, /brand/trailverse-logo-120.c31aee090dd3.webp 3x"
                width={32}
                height={32}
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
                href="https://www.instagram.com/trailverseapp/"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                style={linkStyle}
                aria-label="TrailVerse on Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.facebook.com/travelswithkrishna/"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                style={linkStyle}
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://www.tiktok.com/@travelswithkrishna"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                style={linkStyle}
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
                className={linkClass}
                style={linkStyle}
                aria-label="Google Maps"
              >
                <Map className="h-5 w-5" />
              </a>
            </div>
          </div>

          <FooterSection title="Explore">
            <FooterLink href="/plan-ai">Plan with Trailie</FooterLink>
            <FooterLink href="/itineraries">Sample Itineraries</FooterLink>
            <FooterLink href="/explore">Explore Parks</FooterLink>
            <FooterLink href="/features">Features</FooterLink>
          </FooterSection>

          <FooterSection title="Resources">
            <FooterLink href="/blog">Blog</FooterLink>
            <FooterLink href="/guides">Planning Guides</FooterLink>
            <li>
              <a
                href={reportHref('/reports/national-parks-2025.html', { from: reportFrom })}
                className={linkClass}
                style={linkStyle}
              >
                2025 Park Report
              </a>
            </li>
            <li>
              <a
                href={reportHref('/reports/when-to-go', { from: reportFrom })}
                className={linkClass}
                style={linkStyle}
              >
                Crowd Calendar
              </a>
            </li>
            <FooterLink href="/where-next">Where Next?</FooterLink>
          </FooterSection>

          <FooterSection title="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/faq">FAQ</FooterLink>
            <FooterLink href="/testimonials">Traveler Stories</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/terms">Terms</FooterLink>
            {!isAuthenticated && (
              <FooterLink href="/signup">Sign up</FooterLink>
            )}
            <li>
              <a
                href="mailto:trailverseteam@gmail.com"
                className={`inline-flex items-center gap-2 ${linkClass}`}
                style={linkStyle}
              >
                <Mail className="h-4 w-4 shrink-0" />
                Email us
              </a>
            </li>
            {isAuthenticated && (
              <li>
                <SyncStatus />
              </li>
            )}
          </FooterSection>

          <FooterSection title="Apps">
            <FooterLink href="/trailie-demo">Trailie Demo</FooterLink>
            <FooterLink href="/chatgpt">ChatGPT App</FooterLink>
            <FooterLink href="/mcp">MCP for Claude</FooterLink>
            {showInstallLink && (
              <li>
                <a
                  href="#"
                  onClick={handleInstall}
                  className={linkClass}
                  style={linkStyle}
                >
                  Install App
                </a>
              </li>
            )}
          </FooterSection>
        </div>

        <div
          className="mt-8 pt-8 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
            &copy; {new Date().getFullYear()} TrailVerse. All rights reserved.
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline mt-1 sm:mt-0">Not affiliated with the National Park Service.</span>
          </p>
          <a
            href="https://www.nps.gov"
            target="_blank"
            rel="noopener noreferrer"
            className={`${linkClass} text-xs sm:text-sm whitespace-nowrap`}
            style={linkStyle}
          >
            NPS Official Site
          </a>
        </div>
      </div>

      {showInstallInstructions && (
        <PWAInstallInstructionsModal
          isIOS={isIOS}
          onClose={() => setShowInstallInstructions(false)}
        />
      )}
    </footer>
  );
};

export default Footer;
