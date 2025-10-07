import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Compass, Menu, X, User, LogOut, Sparkles } from 'lucide-react';
import ThemeSwitcher from './ThemeSwitcher';

const Header = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { isDark } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/explore', label: 'Explore' },
    { path: '/plan-ai', label: 'Plan AI' },
    { path: '/events', label: 'Events' },
    { path: '/blog', label: 'Blog' },
    { path: '/map', label: 'Map' },
    { path: '/compare', label: 'Compare' },
  ];

  // Add Profile to nav items for authenticated users
  const allNavItems = isAuthenticated ? [...navItems, { path: '/profile', label: 'Profile' }] : navItems;

  const isActive = (path) => location.pathname === path;

  return (
    <header 
      className="relative backdrop-blur-xl border-b sticky top-0 z-50"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)'
      }}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <img 
              src="/logo.png" 
              alt="TrailVerse Logo" 
              className="h-10 w-10 rounded-xl object-contain transition-transform group-hover:scale-105"
            />
            <span className="text-xl font-bold tracking-tighter" style={{ color: 'var(--text-primary)' }}>
              TrailVerse
            </span>
          </Link>

          {/* Desktop Navigation Pills - Show for all users */}
          <div className="hidden md:flex items-center gap-2">
            {allNavItems.map((item) => {
              // For unauthenticated users, make nav items non-clickable
              if (!isAuthenticated) {
                return (
                  <span
                    key={item.path}
                    className="px-4 py-2 rounded-full text-sm font-medium transition cursor-not-allowed opacity-60"
                    style={{
                      color: 'var(--text-tertiary)'
                    }}
                    title="Sign up to access this feature"
                  >
                    {item.label}
                  </span>
                );
              }
              
              // For authenticated users, make nav items clickable
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    isActive(item.path)
                      ? 'ring-1'
                      : 'hover:bg-white/5'
                  }`}
                  style={{
                    backgroundColor: isActive(item.path) ? 'var(--surface)' : 'transparent',
                    borderColor: isActive(item.path) ? 'var(--border)' : 'transparent',
                    color: isActive(item.path) ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeSwitcher compact />
            
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.role === 'admin' && (
                  <Link
                    to="/admin/dashboard"
                    className="text-sm font-medium transition"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Admin
                  </Link>
                )}
                <div className="flex items-center gap-2 px-3 py-2 rounded-full ring-1"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium">{user?.name}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-3 py-2 rounded-full transition"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                  style={{
                    backgroundColor: isDark ? '#FFFFFF' : '#059669',
                    color: isDark ? '#1A1F21' : '#FFFFFF'
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)'
            }}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
            ) : (
              <Menu className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
            )}
          </button>
        </div>

        {/* Mobile Nav Panel */}
        {mobileMenuOpen && (
          <div 
            className="md:hidden border-t mt-2 pt-2 pb-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="grid gap-2">
              {/* Theme Switcher */}
              <div className="flex items-center justify-center px-4 py-2">
                <ThemeSwitcher compact />
              </div>
              
              {/* Navigation Items - Show for all users */}
              {allNavItems.map((item) => {
                // For unauthenticated users, make nav items non-clickable
                if (!isAuthenticated) {
                  return (
                    <span
                      key={item.path}
                      className="px-4 py-3 rounded-xl text-sm font-medium transition cursor-not-allowed opacity-60"
                      style={{
                        color: 'var(--text-tertiary)'
                      }}
                      title="Sign up to access this feature"
                    >
                      {item.label}
                    </span>
                  );
                }
                
                // For authenticated users, make nav items clickable
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition ${
                      isActive(item.path) ? 'ring-1' : ''
                    }`}
                    style={{
                      backgroundColor: isActive(item.path) ? 'var(--surface)' : 'transparent',
                      borderColor: isActive(item.path) ? 'var(--border)' : 'transparent',
                      color: isActive(item.path) ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              
              {/* Auth buttons for mobile */}
              <div className={`flex items-center justify-between gap-2 ${isAuthenticated ? 'pt-2' : ''}`}>
                {isAuthenticated ? (
                  <div className="flex items-center justify-center w-full">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-full ring-1"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <User className="h-4 w-4" />
                      <span className="text-sm font-medium">{user?.name}</span>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        setMobileMenuOpen(false);
                      }}
                      className="ml-3 py-2 text-sm font-medium transition"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 w-full">
                    <Link
                      to="/login"
                      className="text-sm font-medium transition"
                      style={{ color: 'var(--text-secondary)' }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Link
                      to="/signup"
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                      style={{
                        backgroundColor: isDark ? '#FFFFFF' : '#059669',
                        color: isDark ? '#1A1F21' : '#FFFFFF'
                      }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Sparkles className="h-4 w-4" />
                      Get started
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;