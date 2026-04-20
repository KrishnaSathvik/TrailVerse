import path from 'path';
import { fileURLToPath } from 'url';
import { withSerwist } from '@serwist/turbopack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  async redirects() {
    return [
      { source: '/parks/acad', destination: '/parks/acadia-national-park', permanent: true },
      { source: '/parks/arch', destination: '/parks/arches-national-park', permanent: true },
      { source: '/parks/badl', destination: '/parks/badlands-national-park', permanent: true },
      { source: '/parks/bibe', destination: '/parks/big-bend-national-park', permanent: true },
      { source: '/parks/bisc', destination: '/parks/biscayne-national-park', permanent: true },
      { source: '/parks/blca', destination: '/parks/black-canyon-of-the-gunnison-national-park', permanent: true },
      { source: '/parks/brca', destination: '/parks/bryce-canyon-national-park', permanent: true },
      { source: '/parks/cany', destination: '/parks/canyonlands-national-park', permanent: true },
      { source: '/parks/care', destination: '/parks/capitol-reef-national-park', permanent: true },
      { source: '/parks/cave', destination: '/parks/carlsbad-caverns-national-park', permanent: true },
      { source: '/parks/chis', destination: '/parks/channel-islands-national-park', permanent: true },
      { source: '/parks/cong', destination: '/parks/congaree-national-park', permanent: true },
      { source: '/parks/crla', destination: '/parks/crater-lake-national-park', permanent: true },
      { source: '/parks/cuva', destination: '/parks/cuyahoga-valley-national-park', permanent: true },
      { source: '/parks/deva', destination: '/parks/death-valley-national-park', permanent: true },
      { source: '/parks/dena', destination: '/parks/denali-national-park-and-preserve', permanent: true },
      { source: '/parks/drto', destination: '/parks/dry-tortugas-national-park', permanent: true },
      { source: '/parks/ever', destination: '/parks/everglades-national-park', permanent: true },
      { source: '/parks/gaar', destination: '/parks/gates-of-the-arctic-national-park-and-preserve', permanent: true },
      { source: '/parks/glac', destination: '/parks/glacier-national-park', permanent: true },
      { source: '/parks/glba', destination: '/parks/glacier-bay-national-park-and-preserve', permanent: true },
      { source: '/parks/grba', destination: '/parks/great-basin-national-park', permanent: true },
      { source: '/parks/grca', destination: '/parks/grand-canyon-national-park', permanent: true },
      { source: '/parks/grsa', destination: '/parks/great-sand-dunes-national-park-and-preserve', permanent: true },
      { source: '/parks/grsm', destination: '/parks/great-smoky-mountains-national-park', permanent: true },
      { source: '/parks/grte', destination: '/parks/grand-teton-national-park', permanent: true },
      { source: '/parks/guad', destination: '/parks/guadalupe-mountains-national-park', permanent: true },
      { source: '/parks/hale', destination: '/parks/haleakala-national-park', permanent: true },
      { source: '/parks/havo', destination: '/parks/hawaii-volcanoes-national-park', permanent: true },
      { source: '/parks/hosp', destination: '/parks/hot-springs-national-park', permanent: true },
      { source: '/parks/indu', destination: '/parks/indiana-dunes-national-park', permanent: true },
      { source: '/parks/isro', destination: '/parks/isle-royale-national-park', permanent: true },
      { source: '/parks/jotr', destination: '/parks/joshua-tree-national-park', permanent: true },
      { source: '/parks/katm', destination: '/parks/katmai-national-park-and-preserve', permanent: true },
      { source: '/parks/kefj', destination: '/parks/kenai-fjords-national-park', permanent: true },
      { source: '/parks/kova', destination: '/parks/kobuk-valley-national-park', permanent: true },
      { source: '/parks/lacl', destination: '/parks/lake-clark-national-park-and-preserve', permanent: true },
      { source: '/parks/lavo', destination: '/parks/lassen-volcanic-national-park', permanent: true },
      { source: '/parks/maca', destination: '/parks/mammoth-cave-national-park', permanent: true },
      { source: '/parks/meve', destination: '/parks/mesa-verde-national-park', permanent: true },
      { source: '/parks/mora', destination: '/parks/mount-rainier-national-park', permanent: true },
      { source: '/parks/noca', destination: '/parks/north-cascades-national-park', permanent: true },
      { source: '/parks/olym', destination: '/parks/olympic-national-park', permanent: true },
      { source: '/parks/pefo', destination: '/parks/petrified-forest-national-park', permanent: true },
      { source: '/parks/pinn', destination: '/parks/pinnacles-national-park', permanent: true },
      { source: '/parks/redw', destination: '/parks/redwood-national-and-state-parks', permanent: true },
      { source: '/parks/romo', destination: '/parks/rocky-mountain-national-park', permanent: true },
      { source: '/parks/sagu', destination: '/parks/saguaro-national-park', permanent: true },
      { source: '/parks/sequ', destination: '/parks/sequoia-national-park', permanent: true },
      { source: '/parks/shen', destination: '/parks/shenandoah-national-park', permanent: true },
      { source: '/parks/thro', destination: '/parks/theodore-roosevelt-national-park', permanent: true },
      { source: '/parks/voya', destination: '/parks/voyageurs-national-park', permanent: true },
      { source: '/parks/whsa', destination: '/parks/white-sands-national-park', permanent: true },
      { source: '/parks/wica', destination: '/parks/wind-cave-national-park', permanent: true },
      { source: '/parks/wrst', destination: '/parks/wrangell-st-elias-national-park-and-preserve', permanent: true },
      { source: '/parks/yell', destination: '/parks/yellowstone-national-park', permanent: true },
      { source: '/parks/yose', destination: '/parks/yosemite-national-park', permanent: true },
      { source: '/parks/zion', destination: '/parks/zion-national-park', permanent: true },
      { source: '/parks/npsa', destination: '/parks/national-park-of-american-samoa', permanent: true },
      { source: '/parks/viis', destination: '/parks/virgin-islands-national-park', permanent: true },
      { source: '/parks/neri', destination: '/parks/new-river-gorge-national-park-and-preserve', permanent: true },

      // Old Vite-era routes that Google indexed
      { source: '/park/:slug', destination: '/parks/:slug', permanent: true },
      { source: '/plan', destination: '/plan-ai', permanent: true },
      { source: '/trip-planner', destination: '/plan-ai', permanent: true },
      { source: '/search', destination: '/explore', permanent: true },
      { source: '/parks', destination: '/explore', permanent: true },
      { source: '/activity', destination: '/explore', permanent: true },

      // Partial park name redirects (Google indexed without full slug)
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
