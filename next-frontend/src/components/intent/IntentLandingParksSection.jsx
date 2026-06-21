import { fetchIntentLandingParks } from '@/lib/intentLandingApi';
import { getIntentLandingCanonicalUrl } from '@/data/intentLandings';
import { parkToSlug } from '@/utils/parkSlug';
import IntentTopMatches from '@/components/intent/IntentTopMatches';

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
export default async function IntentLandingParksSection({ landing }) {
  const { parks } = await fetchIntentLandingParks(landing);
  const collectionSchema = buildCollectionSchema(landing, parks);

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
      <IntentTopMatches landing={landing} initialParks={parks} />
    </>
  );
}
