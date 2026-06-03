import { NextResponse } from 'next/server';

// Protected routes that require authentication
const protectedRoutes = ['/profile', '/chat-history', '/dashboard', '/settings', '/home'];

// Auth routes where logged-in users shouldn't go
const publicOnlyRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

const REDIRECT_TTL_MS = 5 * 60 * 1000;
let cachedBlogRedirects = null;
let cachedBlogRedirectsAt = 0;
let cachedPublicSettings = null;
let cachedPublicSettingsAt = 0;

function apiBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://127.0.0.1:5001/api';
  return configured.replace(/\/api\/?$/, '');
}

async function getBlogSlugRedirects() {
  const now = Date.now();
  if (cachedBlogRedirects && now - cachedBlogRedirectsAt < REDIRECT_TTL_MS) {
    return cachedBlogRedirects;
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/api/blogs/slug-redirects`);
    if (!response.ok) {
      return cachedBlogRedirects || {};
    }
    const payload = await response.json();
    cachedBlogRedirects = payload?.data || {};
    cachedBlogRedirectsAt = now;
    return cachedBlogRedirects;
  } catch {
    return cachedBlogRedirects || {};
  }
}

async function getPublicSettings() {
  const now = Date.now();
  if (cachedPublicSettings && now - cachedPublicSettingsAt < REDIRECT_TTL_MS) {
    return cachedPublicSettings;
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/api/settings/public`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      return cachedPublicSettings || null;
    }
    const payload = await response.json();
    cachedPublicSettings = payload?.data || null;
    cachedPublicSettingsAt = now;
    return cachedPublicSettings;
  } catch {
    return cachedPublicSettings || null;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/blog/') && pathname !== '/blog') {
    const slug = pathname.replace(/^\/blog\//, '').split('/')[0];
    if (slug) {
      const redirects = await getBlogSlugRedirects();
      const targetSlug = redirects[slug];
      if (targetSlug && targetSlug !== slug) {
        const url = request.nextUrl.clone();
        url.pathname = `/blog/${targetSlug}`;
        return NextResponse.redirect(url, 308);
      }
    }
  }

  const token = request.cookies.get('trailverse_auth_token')?.value;

  // Maintenance mode (skip admin + offline fallback)
  const isAdminPath = pathname === '/admin/login' || pathname.startsWith('/admin');
  if (!isAdminPath && pathname !== '/offline') {
    const publicSettings = await getPublicSettings();
    if (publicSettings?.maintenanceMode) {
      const url = new URL('/offline', request.url);
      url.searchParams.set('maintenance', '1');
      return NextResponse.redirect(url);
    }
  }

  // Admin UI requires auth cookie (role checked client-side via AdminRoute)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!token) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!token) {
      const url = new URL('/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (publicOnlyRoutes.some((route) => pathname.startsWith(route))) {
    if (token) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/chat-history/:path*',
    '/dashboard/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/parks/:path*',
    '/home',
    '/blog/:path*',
    '/admin',
    '/admin/:path*',
    '/offline',
  ],
};
