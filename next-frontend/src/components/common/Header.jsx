"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { LogOut, ChevronDown } from '@components/icons';
import ThemeSwitcher from './ThemeSwitcher';
import { BROWSE_HUB_NAV_LABEL, BROWSE_HUB_PATH } from '@/lib/browseHub';

/** SSR/hydration-safe skeleton — matches ThemeSwitcher showLabel toggle size. */
function DesktopThemeTogglePlaceholder() {
  return (
    <button
      type="button"
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full"
      style={{ backgroundColor: '#e5e7eb', border: '1px solid var(--border)' }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <span className="inline-block h-6 w-6 translate-x-1 transform rounded-full bg-white" />
    </button>
  );
}

const AUTH_HOME_NAV_ITEM = { path: '/home', label: 'Home' };
const BLOG_NAV_ITEM = { path: '/blog', label: 'Blog' };
const EVENTS_NAV_ITEM = { path: '/events', label: 'Events' };

const CORE_PRIMARY_NAV_ITEMS = [
  { path: '/explore', label: 'Explore' },
  { path: '/map', label: 'Map' },
  { path: '/plan-ai', label: 'Trailie' },
];

const GUEST_PRIMARY_NAV_ITEMS = [...CORE_PRIMARY_NAV_ITEMS, BLOG_NAV_ITEM];

const SECONDARY_NAV_ITEMS = [
  { path: '/events', label: 'Events' },
  { path: '/compare', label: 'Compare' },
  { path: BROWSE_HUB_PATH, label: BROWSE_HUB_NAV_LABEL },
];

const AUTH_MORE_NAV_ITEMS = [
  { path: '/chat-history', label: 'Chat History' },
  { path: '/profile', label: 'Profile' },
];

const LANDING_MOBILE_MORE_ITEMS = [
  { path: '/map', label: 'Map' },
  { path: '/plan-ai', label: 'Trailie' },
];

const LANDING_MOBILE_INLINE_ITEMS_GUEST = [
  { path: '/explore', label: 'Explore' },
  BLOG_NAV_ITEM,
  EVENTS_NAV_ITEM,
];

const LANDING_MOBILE_INLINE_ITEMS_AUTH = [
  AUTH_HOME_NAV_ITEM,
  { path: '/explore', label: 'Explore' },
  BLOG_NAV_ITEM,
  EVENTS_NAV_ITEM,
];

const LANDING_MOBILE_MORE_EXCLUDED_PATHS = new Set(['/blog', '/events']);

/** Stable class string — active visuals via .header-mobile-nav-item CSS + aria-current. */
const MOBILE_NAV_ITEM_CLASS =
  'header-mobile-nav-item inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-solid px-2.5 py-2 text-sm leading-none transition sm:px-3 sm:text-[0.9375rem] hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10';

const Header = () => {
  const { isAuthenticated, authReady, initialAuthHint, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const showAuthChrome = hasMounted && authReady;
  // SSR + first paint: cookie hint only. After mount: full client auth state.
  const showAuthenticatedNav = hasMounted
    ? isAuthenticated
    : Boolean(initialAuthHint && isAuthenticated);

  const primaryNavItems = showAuthenticatedNav
    ? [AUTH_HOME_NAV_ITEM, ...CORE_PRIMARY_NAV_ITEMS]
    : GUEST_PRIMARY_NAV_ITEMS;

  const moreNavItems = showAuthenticatedNav
    ? [BLOG_NAV_ITEM, ...SECONDARY_NAV_ITEMS, ...AUTH_MORE_NAV_ITEMS]
    : SECONDARY_NAV_ITEMS;

  const isActive = (path) => {
    if (path === '/plan-ai') return pathname.startsWith('/plan-ai');
    if (path === '/chat-history') return pathname.startsWith('/chat-history');
    if (path === BROWSE_HUB_PATH) return pathname.startsWith(BROWSE_HUB_PATH);
    if (path === '/blog') return pathname.startsWith('/blog');
    return pathname === path;
  };

  const isLandingPage = pathname === '/';

  const inlineNavItems = isLandingPage
    ? (showAuthenticatedNav ? LANDING_MOBILE_INLINE_ITEMS_AUTH : LANDING_MOBILE_INLINE_ITEMS_GUEST)
    : primaryNavItems;

  const currentMoreNavItems = isLandingPage
    ? [
        ...LANDING_MOBILE_MORE_ITEMS,
        ...moreNavItems.filter((item) => !LANDING_MOBILE_MORE_EXCLUDED_PATHS.has(item.path)),
      ]
    : moreNavItems;

  const isMoreActive = (items = moreNavItems) => items.some((item) => isActive(item.path));

  const navLinkClassName = (active, { mobileInline = false } = {}) =>
    mobileInline
      ? MOBILE_NAV_ITEM_CLASS
      : `block w-full rounded-xl px-4 py-3.5 text-left text-base font-medium transition lg:inline-block lg:w-auto lg:rounded-full lg:px-4 lg:py-2.5 lg:text-[0.9375rem] ${
          active ? 'ring-1' : 'hover:bg-black/5 dark:hover:bg-white/5 lg:hover:bg-black/5 lg:dark:hover:bg-white/5'
        }`;

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

  const renderNavLink = (item, { onClick, mobileInline = false } = {}) => {
    const active = isActive(item.path);

    return (
      <Link
        key={item.path}
        href={item.path}
        onClick={onClick}
        className={navLinkClassName(active, { mobileInline })}
        {...(mobileInline
          ? { 'aria-current': active ? 'page' : undefined }
          : {
              style: navLinkStyle(active),
              onMouseEnter: (event) => handleNavLinkHover(event, active),
              onMouseLeave: (event) => handleNavLinkLeave(event, active),
            })}
      >
        {item.label}
      </Link>
    );
  };

  const renderMoreMenuLink = (item, onClick) => {
    const active = isActive(item.path);

    return (
      <Link
        key={item.path}
        href={item.path}
        onClick={onClick}
        className={`block rounded-xl px-3 py-3 text-base font-medium transition lg:py-2.5 lg:text-sm ${
          active ? 'ring-1' : 'hover:bg-black/5 dark:hover:bg-white/5'
        }`}
        style={{
          backgroundColor: active ? 'var(--surface)' : 'transparent',
          borderColor: active ? 'var(--border)' : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        role="menuitem"
      >
        {item.label}
      </Link>
    );
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const closeMoreMenu = () => setMoreMenuOpen(false);

  useEffect(() => {
    setMoreMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreMenuOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMoreMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [moreMenuOpen]);

  const renderMoreButton = ({ active = isMoreActive(), mobile = false } = {}) => (
    <button
      type="button"
      onClick={() => setMoreMenuOpen((open) => !open)}
      className={`${MOBILE_NAV_ITEM_CLASS} ${mobile && active ? 'header-mobile-nav-item--active' : ''} lg:px-4 lg:py-2.5 lg:text-[0.9375rem] ${
        !mobile && active ? 'lg:font-semibold lg:ring-1' : ''
      }`}
      {...(mobile
        ? {}
        : { style: navLinkStyle(active) })}
      aria-expanded={moreMenuOpen}
      aria-haspopup="menu"
      aria-controls="more-navigation-menu-mobile"
    >
      More
      <ChevronDown className={`h-4 w-4 transition-transform lg:h-3 lg:w-3 ${moreMenuOpen ? 'rotate-180' : ''}`} />
    </button>
  );

  const renderMoreDropdown = (align = 'center', items = moreNavItems) => (
    moreMenuOpen ? (
      <div
        id={align === 'right' ? 'more-navigation-menu-mobile' : 'more-navigation-menu-desktop'}
        className={`min-w-[12rem] rounded-2xl border p-2 shadow-xl ${
          align === 'right'
            ? 'absolute right-0 top-full z-[70] mt-2 lg:hidden'
            : 'absolute left-1/2 top-full z-20 mt-2 hidden -translate-x-1/2 lg:block'
        }`}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
        }}
        role="menu"
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => renderMoreMenuLink(item, closeMoreMenu))}

        {align === 'right' && (
          <div
            className="mt-1 border-t px-1 pt-2"
            style={{ borderColor: 'var(--border)' }}
          >
            {hasMounted ? <ThemeSwitcher variant="segmented" /> : null}
          </div>
        )}

        {align === 'right' && showAuthChrome && (
          <div
            className="mt-1 border-t px-1 pt-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => {
                closeMoreMenu();
                handleLogout();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-base font-medium transition hover:bg-black/5 dark:hover:bg-white/5 lg:py-2.5 lg:text-sm"
              style={{ color: 'var(--text-secondary)' }}
              role="menuitem"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Log out
            </button>
          </div>
        )}
      </div>
    ) : null
  );

  return (
    <header
      className="sticky top-0 z-50 overflow-visible border-b backdrop-blur-xl"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <nav className="relative max-w-[92rem] mx-auto px-2 sm:px-6 lg:px-10 xl:px-12">
        {moreMenuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/10 lg:bg-transparent"
            onClick={closeMoreMenu}
            aria-label="Close more menu"
          />
        )}

        <div className="grid h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-x-1 lg:h-[4.25rem] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4">
          <div className="flex shrink-0 items-center justify-self-start">
            <Link href="/" className="flex items-center gap-2.5 group" aria-label="TrailVerse home">
              <img
                src="/logo.png"
                alt=""
                aria-hidden="true"
                className="h-9 w-9 shrink-0 rounded-lg object-contain transition-transform group-hover:scale-105 sm:h-10 sm:w-10 lg:h-10 lg:w-10 lg:rounded-xl"
              />
              <span
                className="hidden truncate text-[1.25rem] font-bold tracking-tighter lg:block"
                style={{ color: 'var(--text-primary)' }}
              >
                TrailVerse
              </span>
            </Link>
          </div>

          <div
            className="flex min-w-0 items-center justify-center lg:justify-self-center"
            aria-label="Primary navigation"
          >
            <div
              className="flex min-w-0 max-w-full items-center gap-0.5 lg:hidden"
              data-testid="mobile-inline-nav"
            >
              <div className="flex min-w-0 items-center overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max items-center gap-0.5">
                  {inlineNavItems.map((item) =>
                    renderNavLink(item, { mobileInline: true })
                  )}
                </div>
              </div>

              <div className="relative shrink-0">
                {renderMoreButton({ active: isMoreActive(currentMoreNavItems), mobile: true })}
                {renderMoreDropdown('right', currentMoreNavItems)}
              </div>
            </div>

            <div className="hidden items-center justify-center gap-2 lg:flex">
              {inlineNavItems.map((item) => renderNavLink(item))}

              <div className="relative">
                {renderMoreButton({ active: isMoreActive(currentMoreNavItems) })}
                {renderMoreDropdown('center', currentMoreNavItems)}
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center justify-end justify-self-end lg:flex lg:w-auto">
            <div className="flex items-center gap-3">
              {hasMounted ? (
                <>
                  <ThemeSwitcher showLabel />
                  {showAuthChrome ? (
                    <div className="flex items-center gap-3">
                      {user.role === 'admin' && (
                        <Link
                          href="/admin"
                          className="text-sm font-medium transition"
                          style={{ color: 'var(--text-secondary)' }}
                          onMouseEnter={(e) => { e.target.style.color = 'var(--text-primary)'; }}
                          onMouseLeave={(e) => { e.target.style.color = 'var(--text-secondary)'; }}
                        >
                          Admin
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-full transition"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={(e) => { e.target.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={(e) => { e.target.style.color = 'var(--text-tertiary)'; }}
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <DesktopThemeTogglePlaceholder />
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
