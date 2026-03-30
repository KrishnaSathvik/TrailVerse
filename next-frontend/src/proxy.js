import { NextResponse } from 'next/server';

// Protected routes that require authentication
const protectedRoutes = ['/profile', '/dashboard', '/settings', '/plan-ai/new', '/home'];

// Auth routes where logged-in users shouldn't go
const publicOnlyRoutes = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function proxy(request) {
  const { pathname } = request.nextUrl;

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

  // 2. If accessing an auth route while already logged in, redirect to profile/home
  if (publicOnlyRoutes.some(route => pathname.startsWith(route))) {
    if (token) {
      return NextResponse.redirect(new URL('/profile', request.url));
    }
  }

  // Default: Allow request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/dashboard/:path*',
    '/settings/:path*',
    '/plan-ai/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/parks/:path*',
    '/home',
  ],
};
