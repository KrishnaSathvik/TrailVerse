import { notFound } from 'next/navigation';
import Link from 'next/link';
import { parkToSlug } from '@/utils/parkSlug';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://trailverse.onrender.com/api' : 'http://localhost:5001/api');

// Full US state/territory name/code mapping
const STATE_MAP = {
  'alabama': { name: 'Alabama', code: 'AL' },
  'alaska': { name: 'Alaska', code: 'AK' },
  'arizona': { name: 'Arizona', code: 'AZ' },
  'arkansas': { name: 'Arkansas', code: 'AR' },
  'california': { name: 'California', code: 'CA' },
  'colorado': { name: 'Colorado', code: 'CO' },
  'connecticut': { name: 'Connecticut', code: 'CT' },
  'delaware': { name: 'Delaware', code: 'DE' },
  'district-of-columbia': { name: 'District of Columbia', code: 'DC' },
  'florida': { name: 'Florida', code: 'FL' },
  'georgia': { name: 'Georgia', code: 'GA' },
  'hawaii': { name: 'Hawaii', code: 'HI' },
  'idaho': { name: 'Idaho', code: 'ID' },
  'illinois': { name: 'Illinois', code: 'IL' },
  'indiana': { name: 'Indiana', code: 'IN' },
  'iowa': { name: 'Iowa', code: 'IA' },
  'kansas': { name: 'Kansas', code: 'KS' },
  'kentucky': { name: 'Kentucky', code: 'KY' },
  'louisiana': { name: 'Louisiana', code: 'LA' },
  'maine': { name: 'Maine', code: 'ME' },
  'maryland': { name: 'Maryland', code: 'MD' },
  'massachusetts': { name: 'Massachusetts', code: 'MA' },
  'michigan': { name: 'Michigan', code: 'MI' },
  'minnesota': { name: 'Minnesota', code: 'MN' },
  'mississippi': { name: 'Mississippi', code: 'MS' },
  'missouri': { name: 'Missouri', code: 'MO' },
  'montana': { name: 'Montana', code: 'MT' },
  'nebraska': { name: 'Nebraska', code: 'NE' },
  'nevada': { name: 'Nevada', code: 'NV' },
  'new-hampshire': { name: 'New Hampshire', code: 'NH' },
  'new-jersey': { name: 'New Jersey', code: 'NJ' },
  'new-mexico': { name: 'New Mexico', code: 'NM' },
  'new-york': { name: 'New York', code: 'NY' },
  'north-carolina': { name: 'North Carolina', code: 'NC' },
  'north-dakota': { name: 'North Dakota', code: 'ND' },
  'ohio': { name: 'Ohio', code: 'OH' },
  'oklahoma': { name: 'Oklahoma', code: 'OK' },
  'oregon': { name: 'Oregon', code: 'OR' },
  'pennsylvania': { name: 'Pennsylvania', code: 'PA' },
  'rhode-island': { name: 'Rhode Island', code: 'RI' },
  'south-carolina': { name: 'South Carolina', code: 'SC' },
  'south-dakota': { name: 'South Dakota', code: 'SD' },
  'tennessee': { name: 'Tennessee', code: 'TN' },
  'texas': { name: 'Texas', code: 'TX' },
  'utah': { name: 'Utah', code: 'UT' },
  'vermont': { name: 'Vermont', code: 'VT' },
  'virginia': { name: 'Virginia', code: 'VA' },
  'washington': { name: 'Washington', code: 'WA' },
  'west-virginia': { name: 'West Virginia', code: 'WV' },
  'wisconsin': { name: 'Wisconsin', code: 'WI' },
  'wyoming': { name: 'Wyoming', code: 'WY' },
  'american-samoa': { name: 'American Samoa', code: 'AS' },
  'guam': { name: 'Guam', code: 'GU' },
  'puerto-rico': { name: 'Puerto Rico', code: 'PR' },
  'virgin-islands': { name: 'Virgin Islands', code: 'VI' },
};

async function getParksForState(stateCode) {
  try {
    const res = await fetch(`${BASE_URL}/parks?all=true`, {
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
    title: `${state.name} National Parks & Sites — All ${parkCount} NPS Sites | TrailVerse`,
    description: `Explore all ${parkCount} National Park Service sites in ${state.name} — national parks, monuments, historic sites & more. Compare parks, plan trips with AI, check real-time weather, and find campgrounds.`,
    alternates: {
      canonical: `https://www.nationalparksexplorerusa.com/parks/state/${stateCode}`,
    },
    openGraph: {
      title: `${state.name} National Parks & Sites — ${parkCount} NPS Sites`,
      description: `Explore all ${parkCount} National Park Service sites in ${state.name} — national parks, monuments, historic sites & more. AI trip planning, real-time weather, and campground info.`,
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
    name: `National Parks & Sites in ${state.name}`,
    description: `All National Park Service sites in ${state.name}`,
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
                National Parks & Sites in {state.name}
              </h1>
              <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
                {parks.length} National Park Service {parks.length === 1 ? 'site' : 'sites'} — explore trails, campgrounds, weather, and plan your visit with AI.
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
