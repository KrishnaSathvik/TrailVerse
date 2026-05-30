import { NextResponse } from 'next/server';

// Protected routes that require authentication
const protectedRoutes = ['/profile', '/chat-history', '/dashboard', '/settings', '/plan-ai/new', '/home'];

// Auth routes where logged-in users shouldn't go
const publicOnlyRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

const REDIRECT_TTL_MS = 5 * 60 * 1000;
let cachedBlogRedirects = null;
let cachedBlogRedirectsAt = 0;

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

  // We'll read the token from cookies (which will be set by the client on login)
  const token = request.cookies.get('trailverse_auth_token')?.value;

  // 1. If accessing a protected route without a token, redirect to login
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!token) {
      const url = new URL('/login', request.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  // 2. If accessing an auth route while already logged in, redirect to home
  if (publicOnlyRoutes.some(route => pathname.startsWith(route))) {
    if (token) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
  }

  // Default: Allow request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/chat-history/:path*',
    '/dashboard/:path*',
    '/settings/:path*',
    '/plan-ai/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/parks/:path*',
    '/home',
    '/blog/:path*',
  ],
};
