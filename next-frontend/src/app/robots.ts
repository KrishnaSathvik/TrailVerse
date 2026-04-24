import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/_next/',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/profile',
        '/dashboard',
        '/settings',
        '/admin',
        '/unsubscribe',
      ],
    },
    sitemap: 'https://www.nationalparksexplorerusa.com/sitemap.xml',
  };
}
