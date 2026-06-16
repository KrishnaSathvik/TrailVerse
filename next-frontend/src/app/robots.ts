import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        // Block JSON data routes only — allow /_next/static/ so Googlebot can render pages
        // and read X-Robots-Tag: noindex on chunk URLs (robots.txt block prevents that).
        '/_next/data/',
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
