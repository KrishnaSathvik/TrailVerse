"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { LogOut, ChevronDown } from '@components/icons';
import ThemeSwitcher, { SegmentedThemeSkeleton } from './ThemeSwitcher';
import { BROWSE_HUB_NAV_LABEL, BROWSE_HUB_PATH } from '@/lib/browseHub';
import { resolveHeaderMobileNav } from '@/lib/planAiHeaderNav';
import { isNavPathActive } from '@/lib/headerNavActive';
import { captureNavigation } from '@/utils/analytics';

const AUTH_HOME_NAV_ITEM = { path: '/home', label: 'Home' };
const BLOG_NAV_ITEM = { path: '/blog', label: 'Blog' };

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
  { path: '/chat-history', label: 'My Trips' },
  { path: '/profile', label: 'Profile' },
];

/** Stable class string — active visuals via .header-mobile-nav-item CSS + aria-current. */
const MOBILE_NAV_ITEM_CLASS =
  'header-mobile-nav-item relative inline-flex h-11 min-h-11 shrink-0 items-center gap-0.5 whitespace-nowrap bg-transparent px-2 py-0 text-sm leading-none transition sm:px-3 sm:text-[0.9375rem]';

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

  const isActive = (path) => isNavPathActive(path, pathname);


  const {
    inlineNavItems,
    mobileMoreNavItems: currentMoreNavItems,
  } = resolveHeaderMobileNav({
    primaryNavItems,
    moreNavItems,
  });

  const isMoreActive = (items = moreNavItems) => items.some((item) => isActive(item.path));

  const navLinkClassName = (active, { mobileInline = false } = {}) =>
    mobileInline
      ? MOBILE_NAV_ITEM_CLASS
      : `header-desktop-nav-link inline-flex items-center bg-transparent px-3 py-2 text-[0.9375rem] font-medium transition ${
          active ? 'header-desktop-nav-link--active' : ''
        }`;

  const navLinkStyle = (active) => ({
    backgroundColor: 'transparent',
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
        onClick={(event) => {
          captureNavigation(mobileInline ? 'header_mobile' : 'header', item.path);
          onClick?.(event);
        }}
        className={navLinkClassName(active, { mobileInline })}
        aria-current={active ? 'page' : undefined}
        {...(mobileInline
          ? {}
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
        onClick={(event) => {
          captureNavigation('header_more', item.path);
          onClick?.(event);
        }}
        className={`block rounded-xl px-3 py-3 text-base font-medium transition lg:py-2.5 lg:text-sm ${
          active ? 'ring-1' : 'hover:bg-black/5 dark:hover:bg-white/5'
        }`}
        style={{
          backgroundColor: active ? 'var(--surface)' : 'transparent',
          borderColor: active ? 'var(--border)' : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        role="menuitem"
        aria-current={active ? 'page' : undefined}
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

  const renderSegmentedThemeSwitcher = () =>
    hasMounted ? (
      <ThemeSwitcher variant="segmented" size="sm" />
    ) : (
      <SegmentedThemeSkeleton size="sm" />
    );

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
      className={
        mobile
          ? `${MOBILE_NAV_ITEM_CLASS} ${active ? 'header-mobile-nav-item--active' : ''}`
          : `header-desktop-nav-link inline-flex items-center gap-0.5 bg-transparent px-3 py-2 text-[0.9375rem] font-medium transition ${
              active ? 'header-desktop-nav-link--active' : ''
            }`
      }
      {...(mobile
        ? {}
        : { style: navLinkStyle(active) })}
      aria-expanded={moreMenuOpen}
      aria-haspopup="menu"
      aria-controls={mobile ? 'more-navigation-menu-mobile' : 'more-navigation-menu-desktop'}
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
            : 'absolute left-1/2 top-full z-[70] mt-2 hidden -translate-x-1/2 lg:block'
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
            {renderSegmentedThemeSwitcher()}
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
      className="sticky top-0 z-50 overflow-visible border-b"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      <nav className="public-shell relative">
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
                src="/brand/trailverse-logo-40.a8f681720be9.webp"
                srcSet="/brand/trailverse-logo-40.a8f681720be9.webp 1x, /brand/trailverse-logo-80.5ba3166e4f83.webp 2x, /brand/trailverse-logo-120.c31aee090dd3.webp 3x"
                width={40}
                height={40}
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

              <div className={`relative shrink-0 ${moreMenuOpen ? 'z-[70]' : ''}`}>
                {renderMoreButton({ active: isMoreActive(currentMoreNavItems), mobile: true })}
                {renderMoreDropdown('right', currentMoreNavItems)}
              </div>
            </div>

            <div className="hidden items-center justify-center gap-2 lg:flex">
              {primaryNavItems.map((item) => renderNavLink(item))}

              <div className={`relative ${moreMenuOpen ? 'z-[70]' : ''}`}>
                {renderMoreButton({ active: isMoreActive(moreNavItems) })}
                {renderMoreDropdown('center', moreNavItems)}
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center justify-end justify-self-end lg:flex lg:w-auto">
            <div className="flex items-center gap-3">
              {renderSegmentedThemeSwitcher()}
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
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
