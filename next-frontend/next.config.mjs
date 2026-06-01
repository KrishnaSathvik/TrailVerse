import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { withSerwist } from '@serwist/turbopack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-generate redirects from park-slugs.json for ALL 470+ NPS sites
const parkSlugsData = JSON.parse(
  readFileSync(new URL('./src/data/park-slugs.json', import.meta.url), 'utf-8')
);

function nameToSlug(fullName) {
  return fullName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  async redirects() {
    // Short-code → slug redirects for ALL parks (e.g. /parks/yell → /parks/yellowstone-national-park)
    const parkRedirects = parkSlugsData
      .filter(p => p.parkCode && p.fullName)
      .map(p => ({
        source: `/parks/${p.parkCode}`,
        destination: `/parks/${nameToSlug(p.fullName)}`,
        permanent: true,
      }));

    return [
      ...parkRedirects,

      // Legacy route redirects (old Vite-era routes that Google indexed)
      { source: '/park/:slug', destination: '/parks/:slug', permanent: true },
      { source: '/plan', destination: '/plan-ai', permanent: true },
      { source: '/trip-planner', destination: '/plan-ai', permanent: true },
      { source: '/search', destination: '/explore', permanent: true },
      { source: '/parks', destination: '/explore', permanent: true },
      { source: '/activity', destination: '/explore', permanent: true },

      // Guide slug rename (2026 metadata pack)
      {
        source: '/guides/national-park-planning-in-chatgpt',
        destination: '/guides/plan-national-parks-in-chatgpt',
        permanent: true,
      },
      {
        source: '/guides/how-to-check-if-a-national-park-is-open',
        destination: '/guides/how-to-compare-national-parks-on-trailverse',
        permanent: true,
      },

      // Crowd calendar — canonical URL without .html
      { source: '/reports/when-to-go', destination: '/reports/when-to-go.html', permanent: true },
      { source: '/reports/when-to-go/', destination: '/reports/when-to-go.html', permanent: true },
      { source: '/reports/national-parks-2025', destination: '/reports/national-parks-2025.html', permanent: true },
      { source: '/reports/national-parks-2025/', destination: '/reports/national-parks-2025.html', permanent: true },

      // Partial park name redirects (common searches Google indexed without full slug)
      { source: '/parks/yellowstone', destination: '/parks/yellowstone-national-park', permanent: true },
      { source: '/parks/yosemite', destination: '/parks/yosemite-national-park', permanent: true },
      { source: '/parks/grand-canyon', destination: '/parks/grand-canyon-national-park', permanent: true },
      { source: '/parks/glacier', destination: '/parks/glacier-national-park', permanent: true },
      { source: '/parks/acadia', destination: '/parks/acadia-national-park', permanent: true },
      { source: '/parks/rocky-mountain', destination: '/parks/rocky-mountain-national-park', permanent: true },
      { source: '/parks/olympic', destination: '/parks/olympic-national-park', permanent: true },
      { source: '/parks/denali', destination: '/parks/denali-national-park-and-preserve', permanent: true },
      { source: '/parks/everglades', destination: '/parks/everglades-national-park', permanent: true },
      { source: '/parks/joshua-tree', destination: '/parks/joshua-tree-national-park', permanent: true },
      { source: '/parks/death-valley', destination: '/parks/death-valley-national-park', permanent: true },
      { source: '/parks/bryce-canyon', destination: '/parks/bryce-canyon-national-park', permanent: true },
      { source: '/parks/arches', destination: '/parks/arches-national-park', permanent: true },
      { source: '/parks/mount-rainier', destination: '/parks/mount-rainier-national-park', permanent: true },
      { source: '/parks/sequoia', destination: '/parks/sequoia-national-park', permanent: true },
      { source: '/parks/great-smoky-mountains', destination: '/parks/great-smoky-mountains-national-park', permanent: true },
      { source: '/parks/shenandoah', destination: '/parks/shenandoah-national-park', permanent: true },
      { source: '/parks/badlands', destination: '/parks/badlands-national-park', permanent: true },
      { source: '/parks/big-bend', destination: '/parks/big-bend-national-park', permanent: true },
      { source: '/parks/crater-lake', destination: '/parks/crater-lake-national-park', permanent: true },
      { source: '/parks/canyonlands', destination: '/parks/canyonlands-national-park', permanent: true },
      { source: '/parks/capitol-reef', destination: '/parks/capitol-reef-national-park', permanent: true },
      { source: '/parks/redwood', destination: '/parks/redwood-national-and-state-parks', permanent: true },
      { source: '/parks/mesa-verde', destination: '/parks/mesa-verde-national-park', permanent: true },
      { source: '/parks/carlsbad-caverns', destination: '/parks/carlsbad-caverns-national-park', permanent: true },
      { source: '/parks/channel-islands', destination: '/parks/channel-islands-national-park', permanent: true },
      { source: '/parks/haleakala', destination: '/parks/haleakala-national-park', permanent: true },
      { source: '/parks/hawaii-volcanoes', destination: '/parks/hawaii-volcanoes-national-park', permanent: true },
      { source: '/parks/grand-teton', destination: '/parks/grand-teton-national-park', permanent: true },
      { source: '/parks/white-sands', destination: '/parks/white-sands-national-park', permanent: true },
      { source: '/parks/pinnacles', destination: '/parks/pinnacles-national-park', permanent: true },
      { source: '/parks/hot-springs', destination: '/parks/hot-springs-national-park', permanent: true },
      { source: '/parks/mammoth-cave', destination: '/parks/mammoth-cave-national-park', permanent: true },
      { source: '/parks/wind-cave', destination: '/parks/wind-cave-national-park', permanent: true },
      { source: '/parks/saguaro', destination: '/parks/saguaro-national-park', permanent: true },
      { source: '/parks/congaree', destination: '/parks/congaree-national-park', permanent: true },
      { source: '/parks/indiana-dunes', destination: '/parks/indiana-dunes-national-park', permanent: true },
      { source: '/parks/petrified-forest', destination: '/parks/petrified-forest-national-park', permanent: true },
      { source: '/parks/lassen-volcanic', destination: '/parks/lassen-volcanic-national-park', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  async rewrites() {
    const backendOrigin = process.env.NODE_ENV === 'production'
      ? 'https://trailverse.onrender.com'
      : 'http://localhost:5001';

    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendOrigin}/uploads/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5001',
      },
      {
        protocol: 'https',
        hostname: 'trailverse.onrender.com',
      },
      {
        protocol: 'https',
        hostname: '*.nps.gov',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
  },
};

export default withSerwist(nextConfig);
