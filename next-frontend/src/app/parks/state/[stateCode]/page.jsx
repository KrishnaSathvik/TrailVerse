import { notFound } from 'next/navigation';
import { parkToSlug } from '@/utils/parkSlug';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import StateParkPageClient from './StateParkPageClient';
import { fetchNpsGuide } from '@/lib/discoverApi';
import { canonicalPageMetadata } from '@/lib/seo';
import { fetchParksForState, getStateHub } from '@/lib/stateHubs';
import { pickStateParkImage, shareImageFields } from '@/lib/shareParkImage';

export const revalidate = 86400;

export async function generateStaticParams() {
  // Warm on demand instead of competing for the public API quota during builds.
  return [];
}

export async function generateMetadata({ params }) {
  const { stateCode } = await params;
  const state = getStateHub(stateCode);
  if (!state) return { title: '404 - Page Not Found | TrailVerse' };

  const { ok, parks } = await fetchParksForState(state.code);
  const parkCount = ok ? parks.length : null;
  const canonicalPath = `/parks/state/${stateCode}`;
  const countLabel = parkCount == null ? 'NPS Sites' : `All ${parkCount} NPS Sites`;
  const share = shareImageFields(
    pickStateParkImage(ok ? parks : [], state.code, state.name),
    `${state.name} national parks`
  );

  return {
    title: `${state.name} National Parks & Sites — ${countLabel} | TrailVerse`,
    description: `Explore National Park Service sites in ${state.name} — national parks, monuments, historic sites & more. Compare parks, plan with Trailie, check real-time weather, and find campgrounds.`,
    ...canonicalPageMetadata(canonicalPath),
    openGraph: {
      title: `${state.name} National Parks & Sites — ${countLabel}`,
      description: `Explore ${parkCount == null ? 'all' : parkCount} National Park Service sites in ${state.name} — national parks, monuments, historic sites & more. Trailie trip planning, real-time weather, and campground info.`,
      url: `https://www.nationalparksexplorerusa.com${canonicalPath}`,
      siteName: 'TrailVerse',
      type: 'website',
      images: share.openGraphImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${state.name} National Parks & Sites — ${countLabel}`,
      description: `Explore National Park Service sites in ${state.name}.`,
      images: share.twitterImages,
    },
  };
}

function buildStateIntro(stateName, parks) {
  if (!parks.length) {
    return `National Park Service sites in ${stateName}. Browse the directory below when it is available, compare parks, and plan your trip with TrailVerse.`;
  }

  const sampleNames = parks
    .slice(0, 4)
    .map((park) => park.fullName)
    .filter(Boolean);

  let highlight = 'sites across the state';
  if (sampleNames.length === 1) {
    highlight = sampleNames[0];
  } else if (sampleNames.length === 2) {
    highlight = `${sampleNames[0]} and ${sampleNames[1]}`;
  } else if (sampleNames.length > 2) {
    highlight = `${sampleNames.slice(0, -1).join(', ')}, and ${sampleNames[sampleNames.length - 1]}`;
  }

  const countLabel = parks.length === 1 ? '1 National Park Service site' : `${parks.length} National Park Service sites`;

  return `From ${highlight}, ${countLabel} in ${stateName} offer trails, campgrounds, historic places, and ranger-led programs. Browse the full directory below, compare parks, and plan your trip with TrailVerse.`;
}

export default async function StateParkPage({ params }) {
  const { stateCode } = await params;
  const state = getStateHub(stateCode);
  if (!state) notFound();

  const { ok, parks } = await fetchParksForState(state.code);
  // Failed regeneration must keep the last successful page, not cache an empty directory.
  if (!ok) throw new Error(`Unable to load parks for ${state.code}`);
  const loadError = false;

  const [intro, npsGuide] = await Promise.all([
    Promise.resolve(buildStateIntro(state.name, parks)),
    fetchNpsGuide(state.name, stateCode).catch(() => null)
  ]);

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
        <main>
          {/* No Suspense boundary: the client tree no longer reads search params
              during prerender, so the directory renders straight into the HTML. */}
          <StateParkPageClient
            stateName={state.name}
            parks={parks}
            intro={intro}
            npsGuide={npsGuide}
            loadError={loadError}
          />
        </main>
        <Footer />
      </div>
    </>
  );
}
