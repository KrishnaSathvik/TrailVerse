"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Menu, X, LogOut } from '@components/icons';
import ThemeSwitcher from './ThemeSwitcher';


const Header = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/home', label: 'Home' },
    { path: '/explore', label: 'Explore' },
    { path: '/plan-ai', label: 'Plan AI' },
    { path: '/events', label: 'Events' },
    { path: '/blog', label: 'Blog' },
    { path: '/map', label: 'Map' },
    { path: '/compare', label: 'Compare' },
  ];

  const authenticatedOnlyNavItems = [
    { path: '/chat-history', label: 'Chat History' },
  ];

  // Add Profile to nav items for authenticated users
  const allNavItems = isAuthenticated
    ? [
        ...navItems,
        ...authenticatedOnlyNavItems,
        { path: '/profile', label: 'Profile' }
      ]
    : navItems;
  
  // For unauthenticated users, show only public pages (exclude Daily Feed and Profile)
  const publicNavItems = navItems.filter(item => 
    item.path !== '/home' && item.path !== '/profile'
  );
  const mobileNavItems = isAuthenticated ? allNavItems : publicNavItems;

  const isActive = (path) => {
    if (path === '/plan-ai') return pathname.startsWith('/plan-ai');
    if (path === '/chat-history') return pathname.startsWith('/chat-history');
    return pathname === path;
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const canUsePortal = typeof document !== 'undefined';

  useEffect(() => {
    if (!mobileMenuOpen) {
      const scrollY = document.body.dataset.mobileNavScrollY || '0';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.classList.remove('mobile-nav-open');
      document.documentElement.classList.remove('mobile-nav-open');
      delete document.body.dataset.mobileNavScrollY;
      window.scrollTo(0, Number(scrollY));
      return;
    }

    const scrollY = window.scrollY;
    document.body.dataset.mobileNavScrollY = String(scrollY);
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.classList.add('mobile-nav-open');
    document.documentElement.classList.add('mobile-nav-open');

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      const savedScrollY = document.body.dataset.mobileNavScrollY || '0';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.classList.remove('mobile-nav-open');
      document.documentElement.classList.remove('mobile-nav-open');
      delete document.body.dataset.mobileNavScrollY;
      window.scrollTo(0, Number(savedScrollY));
      window.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  const mobileMenu = canUsePortal && mobileMenuOpen
    ? createPortal(
      <div
        className="lg:hidden fixed inset-0 z-[2147483647] transition-all duration-300 pointer-events-auto overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)' }}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/45 transition-opacity duration-300 opacity-100"
          onClick={closeMobileMenu}
          aria-label="Close navigation menu"
        />

        <aside
          id="mobile-navigation"
          className="fixed inset-y-0 left-0 h-[100dvh] min-h-[100dvh] w-[min(20rem,84vw)] max-w-[20rem] overflow-hidden overscroll-none border-r transition-transform duration-300 ease-out translate-x-0"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)'
          }}
        >
          <div className="flex h-full flex-col">
            <div
              className="flex items-center justify-between border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))]"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-primary)'
              }}
            >
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="TrailVerse Logo"
                  className="h-10 w-10 rounded-xl object-contain"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--accent-green)' }}>
                    Menu
                  </p>
                  <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    TrailVerse
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeMobileMenu}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
                aria-label="Close sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto px-4 py-4"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div
                className="mb-6 rounded-2xl border p-3"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)'
                }}
              >
                <ThemeSwitcher showLabel />
              </div>

              <p
                className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Navigation
              </p>
              <div className="grid gap-2">
                {mobileNavItems.map((item) => (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={closeMobileMenu}
                    className={`block w-full rounded-xl px-4 py-3.5 text-left text-base font-medium transition ${isActive(item.path) ? 'ring-1' : ''}`}
                    style={{
                      backgroundColor: isActive(item.path) ? 'var(--surface)' : 'transparent',
                      borderColor: isActive(item.path) ? 'var(--border)' : 'transparent',
                      color: isActive(item.path) ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div
              className="border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-primary)'
              }}
            >
              {isAuthenticated ? (
                <div className="grid gap-2">
                  {user?.role === 'admin' && (
                    <Link
                      href="/admin"
                      onClick={closeMobileMenu}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition"
                      style={{
                        backgroundColor: 'transparent',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition"
                    style={{
                      backgroundColor: 'var(--surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>,
      document.body
    )
    : null;

  return (
    <header
      className="relative backdrop-blur-xl border-b sticky top-0 z-50"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)'
      }}
    >
      <nav className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex h-16 items-center justify-between">
          <div className="flex min-w-0 items-center gap-3 lg:contents">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              aria-label="Open sidebar"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Logo */}
            <Link href="/" className="flex min-w-0 items-center gap-3 group lg:mr-0 mr-auto lg:flex-none">
              <img 
                src="/logo.png" 
                alt="TrailVerse Logo" 
                className="hidden h-10 w-10 shrink-0 rounded-xl object-contain transition-transform group-hover:scale-105 lg:block"
              />
              <span
                className="truncate text-xl font-bold tracking-tighter"
                style={{ color: 'var(--text-primary)' }}
              >
                TrailVerse
              </span>
            </Link>
          </div>

          {/* Desktop Navigation Pills - Show for both authenticated and unauthenticated users */}
          <div className="hidden lg:flex items-center gap-2">
            {(isAuthenticated ? allNavItems : publicNavItems).map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    isActive(item.path)
                      ? 'ring-1'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  style={{
                    backgroundColor: isActive(item.path) ? 'var(--surface)' : 'transparent',
                    color: isActive(item.path) ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderColor: isActive(item.path) ? 'var(--border)' : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive(item.path)) {
                      e.target.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive(item.path)) {
                      e.target.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>

          {/* Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <ThemeSwitcher showLabel />
            
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="text-sm font-medium transition"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                  onMouseLeave={(e) => e.target.style.color = 'var(--text-tertiary)'}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>

          {/* Mobile menu button */}
        </div>
      </nav>

      {mobileMenu}
    </header>
  );
};

export default Header;
