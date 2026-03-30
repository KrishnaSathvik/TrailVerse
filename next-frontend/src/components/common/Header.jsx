import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { Menu, X, LogOut, Sparkles } from '@components/icons';
import ThemeSwitcher from './ThemeSwitcher';
import Button from './Button';

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

  // Add Profile to nav items for authenticated users
  const allNavItems = isAuthenticated ? [...navItems, { path: '/profile', label: 'Profile' }] : navItems;
  
  // For unauthenticated users, show only public pages (exclude Daily Feed and Profile)
  const publicNavItems = navItems.filter(item => 
    item.path !== '/home' && item.path !== '/profile'
  );
  const mobileNavItems = isAuthenticated ? allNavItems : publicNavItems;

  const isActive = (path) => pathname === path;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

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
          <div className="flex min-w-0 items-center gap-3 md:contents">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition"
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
            <Link href="/" className="flex min-w-0 items-center gap-3 group md:mr-0 mr-auto md:flex-none">
              <img 
                src="/logo.png" 
                alt="TrailVerse Logo" 
                className="hidden h-10 w-10 shrink-0 rounded-xl object-contain transition-transform group-hover:scale-105 md:block"
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
          <div className="hidden md:flex items-center gap-2">
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
          <div className="hidden md:flex items-center gap-3">
            <ThemeSwitcher showLabel />
            
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.role === 'admin' && (
                  <Link
                    href="/admin/dashboard"
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
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium transition"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                  onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                >
                  Sign in
                </Link>
                <Button
                  onClick={() => router.push('/signup')}
                  variant="secondary"
                  size="sm"
                  icon={Sparkles}
                >
                  Get started
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
        </div>
      </nav>

      {mobileMenuOpen && (
      <div
        className="md:hidden fixed inset-0 z-[2147483647] transition-all duration-300 pointer-events-auto overflow-hidden"
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
          className="fixed inset-0 h-screen min-h-screen w-screen overflow-hidden overscroll-none transition-transform duration-300 ease-out translate-x-0"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderRight: 'none',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)'
          }}
        >
          <div className="flex h-full flex-col">
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
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
              </div>

              <button
                type="button"
                onClick={closeMobileMenu}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition"
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
              className="flex-1 overflow-y-auto px-4 py-5"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="mb-5 flex items-center justify-start px-2">
                <ThemeSwitcher showLabel />
              </div>

              <div className="grid gap-2">
                {mobileNavItems.map((item) => (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={closeMobileMenu}
                    className={`block w-full px-4 py-3 rounded-2xl text-left text-sm font-medium transition ${isActive(item.path) ? 'ring-1' : ''}`}
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
              className="border-t px-4 py-4"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-primary)'
              }}
            >
              {isAuthenticated ? (
                <div className="grid gap-2">
                  {user?.role === 'admin' && (
                    <Link
                      href="/admin/dashboard"
                      onClick={closeMobileMenu}
                      className="w-full px-4 py-3 rounded-2xl text-left text-sm font-medium transition"
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
                    className="flex w-full items-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition"
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
              ) : (
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      router.push('/login');
                    }}
                    className="w-full px-4 py-3 rounded-2xl text-left text-sm font-medium transition"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Sign in
                  </button>
                  <Button
                    onClick={() => {
                      closeMobileMenu();
                      router.push('/signup');
                    }}
                    variant="secondary"
                    size="sm"
                    icon={Sparkles}
                    className="w-full justify-center"
                  >
                    Get started
                  </Button>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
      )}
    </header>
  );
};

export default Header;
