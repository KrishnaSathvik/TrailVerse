import { fetchIntentLandingParks } from '@/lib/intentLandingApi';
import { getIntentLandingCanonicalUrl } from '@/data/intentLandings';
import { parkToSlug } from '@/utils/parkSlug';
import IntentTopMatches from '@/components/intent/IntentTopMatches';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

function buildCollectionSchema(landing, parks) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: landing.title,
    description: landing.metaDescription,
    url: getIntentLandingCanonicalUrl(landing),
    dateModified: landing.updatedAt,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: parks.length,
      itemListElement: parks.slice(0, 12).map((park, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: park.fullName,
        url: `https://www.nationalparksexplorerusa.com/parks/${parkToSlug(park.fullName)}`,
      })),
    },
  };
}

/** Async server section — park search + JSON-LD; wrapped in Suspense on the page. */
/**
 * A transient API failure (e.g. a 502 while Render redeploys the same merge)
 * must not fail the whole Vercel build. At BUILD time we render without parks:
 * IntentTopMatches then loads them in the browser, and hourly ISR replaces the
 * page with a server-rendered list. At RUNTIME the error is rethrown so ISR
 * keeps serving the last good page instead of caching an empty one.
 */
async function loadParks(landing) {
  try {
    return (await fetchIntentLandingParks(landing)).parks;
  } catch (error) {
    if (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) throw error;
    console.warn(`[intent landing] ${landing.path || landing.searchQuery}: parks unavailable at build (${error.message}); rendering client fallback`);
    return [];
  }
}

export default async function IntentLandingParksSection({ landing }) {
  const parks = await loadParks(landing);
  const collectionSchema = buildCollectionSchema(landing, parks);

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
      <IntentTopMatches landing={landing} initialParks={parks} />
    </>
  );
}
