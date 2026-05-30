"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Menu, X, LogOut, ChevronDown } from '@components/icons';
import ThemeSwitcher from './ThemeSwitcher';
import { BROWSE_HUB_NAV_LABEL, BROWSE_HUB_PATH } from '@/lib/browseHub';

const AUTH_HOME_NAV_ITEM = { path: '/home', label: 'Home' };

const PRIMARY_NAV_ITEMS = [
  { path: '/explore', label: 'Explore' },
  { path: '/map', label: 'Map' },
  { path: '/plan-ai', label: 'Trailie' },
  { path: '/blog', label: 'Blog' },
];

const SECONDARY_NAV_ITEMS = [
  { path: '/events', label: 'Events' },
  { path: '/compare', label: 'Compare' },
  { path: BROWSE_HUB_PATH, label: BROWSE_HUB_NAV_LABEL },
];

const AUTH_MORE_NAV_ITEMS = [
  { path: '/chat-history', label: 'Chat History' },
  { path: '/profile', label: 'Profile' },
];

const Header = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const primaryNavItems = isAuthenticated
    ? [AUTH_HOME_NAV_ITEM, ...PRIMARY_NAV_ITEMS]
    : PRIMARY_NAV_ITEMS;

  const moreNavItems = isAuthenticated
    ? [...SECONDARY_NAV_ITEMS, ...AUTH_MORE_NAV_ITEMS]
    : SECONDARY_NAV_ITEMS;

  const isActive = (path) => {
    if (path === '/plan-ai') return pathname.startsWith('/plan-ai');
    if (path === '/chat-history') return pathname.startsWith('/chat-history');
    if (path === BROWSE_HUB_PATH) return pathname.startsWith(BROWSE_HUB_PATH);
    if (path === '/blog') return pathname.startsWith('/blog');
    return pathname === path;
  };

  const isMoreActive = () => moreNavItems.some((item) => isActive(item.path));

  const navLinkClassName = (active) =>
    `block w-full rounded-xl px-4 py-3.5 text-left text-base font-medium transition lg:inline-block lg:w-auto lg:rounded-full lg:px-4 lg:py-2.5 lg:text-[0.9375rem] ${active ? 'ring-1' : 'hover:bg-black/5 dark:hover:bg-white/5 lg:hover:bg-black/5 lg:dark:hover:bg-white/5'}`;

  const navLinkStyle = (active) => ({
    backgroundColor: active ? 'var(--surface)' : 'transparent',
    borderColor: active ? 'var(--border)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  });

  const handleNavLinkHover = (event, active) => {
    if (!active) {
      event.currentTarget.style.color = 'var(--text-primary)';
    }
  };

  const handleNavLinkLeave = (event, active) => {
    if (!active) {
      event.currentTarget.style.color = 'var(--text-secondary)';
    }
  };

  const renderNavLink = (item, { onClick } = {}) => {
    const active = isActive(item.path);

    return (
      <Link
        key={item.path}
        href={item.path}
        onClick={onClick}
        className={navLinkClassName(active)}
        style={navLinkStyle(active)}
        onMouseEnter={(event) => handleNavLinkHover(event, active)}
        onMouseLeave={(event) => handleNavLinkLeave(event, active)}
      >
        {item.label}
      </Link>
    );
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobileMoreOpen(false);
  };
  const openMobileMenu = () => {
    setMobileMoreOpen(isMoreActive());
    setMobileMenuOpen(true);
  };
  const closeMoreMenu = () => setMoreMenuOpen(false);
  const canUsePortal = typeof document !== 'undefined';

  useEffect(() => {
    setMoreMenuOpen(false);
  }, [pathname]);

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
                {primaryNavItems.map((item) =>
                  renderNavLink(item, { onClick: closeMobileMenu })
                )}
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setMobileMoreOpen((open) => !open)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left text-base font-medium transition ${isMoreActive() ? 'ring-1' : ''}`}
                  style={{
                    backgroundColor: isMoreActive() ? 'var(--surface)' : 'transparent',
                    borderColor: isMoreActive() ? 'var(--border)' : 'transparent',
                    color: isMoreActive() ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  aria-expanded={mobileMoreOpen}
                >
                  <span>More</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${mobileMoreOpen ? 'rotate-180' : ''}`} />
                </button>

                {mobileMoreOpen && (
                  <div className="mt-2 grid gap-2 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
                    {moreNavItems.map((item) =>
                      renderNavLink(item, { onClick: closeMobileMenu })
                    )}
                  </div>
                )}
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
        <div className="relative flex h-16 lg:h-[4.25rem] items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={openMobileMenu}
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

            <Link href="/" className="flex min-w-0 items-center gap-3 group">
              <img
                src="/logo.png"
                alt="TrailVerse Logo"
                className="hidden h-10 w-10 shrink-0 rounded-xl object-contain transition-transform group-hover:scale-105 lg:block"
              />
              <span
                className="truncate text-xl lg:text-[1.25rem] font-bold tracking-tighter"
                style={{ color: 'var(--text-primary)' }}
              >
                TrailVerse
              </span>
            </Link>
          </div>

          <div className="pointer-events-none absolute inset-x-0 hidden lg:flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2">
              {primaryNavItems.map((item) => renderNavLink(item))}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen((open) => !open)}
                  className={`inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-[0.9375rem] font-medium transition ${
                    isMoreActive() ? 'ring-1' : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  style={{
                    backgroundColor: isMoreActive() ? 'var(--surface)' : 'transparent',
                    color: isMoreActive() ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderColor: isMoreActive() ? 'var(--border)' : 'transparent',
                  }}
                  aria-expanded={moreMenuOpen}
                  aria-haspopup="menu"
                >
                  More
                  <ChevronDown className={`h-3 w-3 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {moreMenuOpen && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10"
                      onClick={closeMoreMenu}
                      aria-label="Close more menu"
                    />
                    <div
                      className="absolute left-1/2 top-full z-20 mt-2 min-w-[12rem] -translate-x-1/2 rounded-2xl border p-2 shadow-xl"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: 'var(--border)',
                      }}
                      role="menu"
                    >
                      {moreNavItems.map((item) => {
                        const active = isActive(item.path);

                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            onClick={closeMoreMenu}
                            className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                              active ? 'ring-1' : 'hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                            style={navLinkStyle(active)}
                            role="menuitem"
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
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
          </div>
        </div>
      </nav>

      {mobileMenu}
    </header>
  );
};

export default Header;
