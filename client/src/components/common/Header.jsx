import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Menu, X, LogOut, Sparkles } from 'lucide-react';
import ThemeSwitcher from './ThemeSwitcher';
import Button from './Button';

const Header = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header 
      className="relative backdrop-blur-xl border-b sticky top-0 z-50"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)'
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

          {/* Desktop Navigation Pills - Show only for authenticated users */}
          {isAuthenticated && (
            <div className="hidden md:flex items-center gap-2">
              {allNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
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
          )}

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeSwitcher showLabel />
            
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.role === 'admin' && (
                  <Link
                    to="/admin/dashboard"
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
                  to="/login"
                  className="text-sm font-medium transition"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                  onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                >
                  Sign in
                </Link>
                <Button
                  onClick={() => navigate('/signup')}
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
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
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
              
              {/* Navigation Items - Show only for authenticated users */}
              {isAuthenticated && allNavItems.map((item) => (
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
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              
              {/* Auth buttons for mobile */}
              <div className={`flex items-center justify-between gap-2 ${isAuthenticated ? 'pt-2' : ''}`}>
                {isAuthenticated ? (
                  <div className="flex items-center justify-center w-full">
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-full transition"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                      onMouseLeave={(e) => e.target.style.color = 'var(--text-tertiary)'}
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="text-sm font-medium">Logout</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 w-full">
                    <Link
                      to="/login"
                      className="text-sm font-medium transition"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                      onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Button
                      onClick={() => {
                        navigate('/signup');
                        setMobileMenuOpen(false);
                      }}
                      variant="secondary"
                      size="sm"
                      icon={Sparkles}
                    >
                      Get started
                    </Button>
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