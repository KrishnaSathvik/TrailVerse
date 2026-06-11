import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/_next/',
        '/_next/static/',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/profile',
        '/home',
        '/dashboard',
        '/settings',
        '/admin',
        '/unsubscribe',
        '/chat-history',
        '/offline',
        '/verify-email',
        '/plan-ai/shared/',
        '/plan-ai/guest/',
      ],
    },
    sitemap: 'https://www.nationalparksexplorerusa.com/sitemap.xml',
  };
}
