import { notFound } from 'next/navigation';
import Link from 'next/link';
import { parkToSlug } from '@/utils/parkSlug';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://trailverse.onrender.com/api' : 'http://localhost:5001/api');

// Full US state name/code mapping
const STATE_MAP = {
  'alaska': { name: 'Alaska', code: 'AK' },
  'arizona': { name: 'Arizona', code: 'AZ' },
  'arkansas': { name: 'Arkansas', code: 'AR' },
  'california': { name: 'California', code: 'CA' },
  'colorado': { name: 'Colorado', code: 'CO' },
  'florida': { name: 'Florida', code: 'FL' },
  'hawaii': { name: 'Hawaii', code: 'HI' },
  'idaho': { name: 'Idaho', code: 'ID' },
  'kentucky': { name: 'Kentucky', code: 'KY' },
  'maine': { name: 'Maine', code: 'ME' },
  'michigan': { name: 'Michigan', code: 'MI' },
  'minnesota': { name: 'Minnesota', code: 'MN' },
  'montana': { name: 'Montana', code: 'MT' },
  'nevada': { name: 'Nevada', code: 'NV' },
  'new-mexico': { name: 'New Mexico', code: 'NM' },
  'north-dakota': { name: 'North Dakota', code: 'ND' },
  'ohio': { name: 'Ohio', code: 'OH' },
  'oregon': { name: 'Oregon', code: 'OR' },
  'south-dakota': { name: 'South Dakota', code: 'SD' },
  'tennessee': { name: 'Tennessee', code: 'TN' },
  'texas': { name: 'Texas', code: 'TX' },
  'utah': { name: 'Utah', code: 'UT' },
  'virginia': { name: 'Virginia', code: 'VA' },
  'washington': { name: 'Washington', code: 'WA' },
  'west-virginia': { name: 'West Virginia', code: 'WV' },
  'wyoming': { name: 'Wyoming', code: 'WY' },
  'north-carolina': { name: 'North Carolina', code: 'NC' },
  'south-carolina': { name: 'South Carolina', code: 'SC' },
  'indiana': { name: 'Indiana', code: 'IN' },
  'american-samoa': { name: 'American Samoa', code: 'AS' },
  'virgin-islands': { name: 'Virgin Islands', code: 'VI' },
};

async function getParksForState(stateCode) {
  try {
    const res = await fetch(`${BASE_URL}/parks?all=true&nationalParksOnly=true`, {
      next: { revalidate: 86400 }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data.filter(park =>
      park.states && park.states.toUpperCase().includes(stateCode.toUpperCase())
    );
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return Object.keys(STATE_MAP).map(stateCode => ({ stateCode }));
}

export async function generateMetadata({ params }) {
  const { stateCode } = await params;
  const state = STATE_MAP[stateCode];
  if (!state) return { title: '404 - Page Not Found | TrailVerse' };

  const parks = await getParksForState(state.code);
  const parkCount = parks.length;

  return {
    title: `${state.name} National Parks — All ${parkCount} Parks & Sites | TrailVerse`,
    description: `Explore all ${parkCount} national parks and sites in ${state.name}. Compare parks, plan trips with AI, check real-time weather, and find campgrounds. Updated for 2026.`,
    alternates: {
      canonical: `https://www.nationalparksexplorerusa.com/parks/state/${stateCode}`,
    },
    openGraph: {
      title: `${state.name} National Parks — ${parkCount} Parks & Sites`,
      description: `Explore all ${parkCount} national parks and sites in ${state.name} with AI trip planning, real-time weather, and campground info.`,
      url: `https://www.nationalparksexplorerusa.com/parks/state/${stateCode}`,
      siteName: 'TrailVerse',
      type: 'website',
    },
  };
}

export default async function StateParkPage({ params }) {
  const { stateCode } = await params;
  const state = STATE_MAP[stateCode];
  if (!state) notFound();

  const parks = await getParksForState(state.code);
  if (parks.length === 0) notFound();

  // Build ItemList schema
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `National Parks in ${state.name}`,
    description: `All national parks and sites in ${state.name}`,
    numberOfItems: parks.length,
    itemListElement: parks.map((park, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: park.fullName,
      url: `https://www.nationalparksexplorerusa.com/parks/${parkToSlug(park.fullName)}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <main className="pt-16">
          {/* Hero */}
          <section className="py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <nav className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                <Link href="/" style={{ color: 'var(--text-secondary)' }}>Home</Link>
                <span className="mx-2">/</span>
                <Link href="/explore" style={{ color: 'var(--text-secondary)' }}>Explore</Link>
                <span className="mx-2">/</span>
                <span style={{ color: 'var(--text-primary)' }}>{state.name}</span>
              </nav>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                National Parks in {state.name}
              </h1>
              <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
                {parks.length} national {parks.length === 1 ? 'park' : 'parks and sites'} — explore trails, campgrounds, weather, and plan your visit with AI.
              </p>
              <div className="flex gap-3 mt-6">
                <Button variant="success" size="sm" href="/plan-ai">Plan a {state.name} Trip with AI</Button>
                <Button variant="outline" size="sm" href="/explore">All Parks</Button>
              </div>
            </div>
          </section>

          {/* Park Grid */}
          <section className="pb-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {parks.map((park) => {
                  const slug = parkToSlug(park.fullName);
                  const image = park.images?.[0]?.url;
                  return (
                    <Link
                      key={park.parkCode}
                      href={`/parks/${slug}`}
                      className="group rounded-2xl overflow-hidden transition hover:shadow-lg"
                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      {image && (
                        <div className="h-40 overflow-hidden">
                          <img
                            src={image}
                            alt={`${park.fullName} — ${state.name} national park`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <h2 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
                          {park.fullName}
                        </h2>
                        {park.states && (
                          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                            {park.states}
                          </p>
                        )}
                        {park.description && (
                          <p className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                            {park.description?.replace(/<[^>]+>/g, '').substring(0, 100)}...
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
