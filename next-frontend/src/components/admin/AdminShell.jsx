'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AdminRoute from '@components/admin/AdminRoute';
import {
  Layout,
  BarChart,
  FileText,
  MessageSquare,
  Users,
  Plus,
  LogOut,
  Menu,
  X,
} from '@components/icons';
import { useToast } from '@/context/ToastContext';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: Layout, exact: true },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart },
  { href: '/admin/content', label: 'Content', icon: FileText },
  { href: '/admin/community', label: 'Community', icon: MessageSquare },
  { href: '/admin/users', label: 'Users', icon: Users },
];

function isNavActive(pathname, href, exact) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const AdminShell = ({ title, subtitle, actions, children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const authService = (await import('@/services/authService')).default;
      authService.logout();
      showToast('Logged out successfully', 'success');
      router.push('/admin/login');
    } catch {
      showToast('Logout failed', 'error');
    }
  };

  const navLink = (item) => {
    const Icon = item.icon;
    const active = isNavActive(pathname, item.href, item.exact);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileNavOpen(false)}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition"
        style={{
          backgroundColor: active ? 'var(--accent-green)' : 'transparent',
          color: active ? 'white' : 'var(--text-secondary)',
        }}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <AdminRoute>
      <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {/* Desktop sidebar */}
        <aside
          className="hidden lg:flex lg:flex-col lg:w-60 xl:w-64 border-r flex-shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <Link href="/admin" className="block">
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                TrailVerse
              </span>
              <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Admin
              </span>
            </Link>
          </div>
          <nav className="flex-1 p-3 space-y-1">{NAV_ITEMS.map(navLink)}</nav>
        </aside>

        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className="sticky top-0 z-20 border-b backdrop-blur-xl"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="lg:hidden p-2 rounded-xl"
                  style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-primary)' }}
                  onClick={() => setMobileNavOpen((open) => !open)}
                  aria-label="Toggle admin navigation"
                >
                  {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div className="min-w-0">
                  {title && (
                    <h1 className="text-lg sm:text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-sm truncate hidden sm:block" style={{ color: 'var(--text-secondary)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {actions}
                <Link
                  href="/admin/blog/new"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">New Post</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    color: 'var(--text-secondary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>

            {mobileNavOpen && (
              <nav
                className="lg:hidden border-t px-3 py-3 space-y-1"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
              >
                {NAV_ITEMS.map(navLink)}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </nav>
            )}
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24">{children}</main>
        </div>
      </div>
    </AdminRoute>
  );
};

export default AdminShell;
