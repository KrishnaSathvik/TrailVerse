import { notFound, permanentRedirect } from 'next/navigation';
import { getParkDetails, getParkDetailsBySlug, PARK_PAGE_REVALIDATE_SECONDS } from '@/lib/parkApi';
import {
  buildParkMetaDescription,
  buildParkPageTitle,
  buildParkSeoLeadLine,
  getStateHubSlug,
  isTierAPark,
} from '@/lib/parkSeo';
import { parkToSlug, findCorrectSlug } from '@/utils/parkSlug';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  getParkPlanningFaq,
  getParkPlanningSnapshot,
  hydratePlanningFaq,
} from '@/lib/parkPlanningContent';
import ParkDetailClient from './ParkDetailClient';
import { canonicalPageMetadata } from '@/lib/seo';

/** Segment config must be a build-time literal (not imported). Sync with PARK_PAGE_REVALIDATE_SECONDS. */
export const revalidate = 604800;

/** Server-formatted so the client hydrates the identical "as of" string. */
const AS_OF_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/Los_Angeles',
});

export async function generateStaticParams() {
  // Generate each park once on demand, then serve its ISR cache. Building every
  // park at once exhausts the public API rate limit and can create false 404s.
  return [];
}

export async function generateMetadata({ params }) {
  const { parkCode } = await params;
  // If parkCode is longer than 4 chars, it's a slug — look up by slug
  let data = parkCode.length > 4
    ? await getParkDetailsBySlug(parkCode)
    : await getParkDetails(parkCode);

  // getParkDetails returns the park object directly (or { park } in some routes)
  let park = data?.park || data;

  // If slug lookup failed, try corrected slug for metadata
  if (!park?.fullName && parkCode.length > 4) {
    const correctedSlug = findCorrectSlug(parkCode);
    if (correctedSlug) {
      data = await getParkDetailsBySlug(correctedSlug);
      park = data?.park || data;
    }
  }

  if (!park?.fullName) {
    return { title: '404 - Page Not Found | TrailVerse' };
  }

  const slug = parkToSlug(park.fullName);
  const title = buildParkPageTitle(park);
  const description = buildParkMetaDescription(park, slug);
  const image = park.images?.[0]?.url;
  const url = `https://www.nationalparksexplorerusa.com/parks/${slug}`;

  return {
    title,
    description,
    keywords: `${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping`,
    ...canonicalPageMetadata(`/parks/${slug}`),
    openGraph: {
      title,
      description,
      url,
      siteName: 'TrailVerse',
      images: [{ url: image, width: 1200, height: 630, alt: park.fullName }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function ParkPage({ params }) {
  const { parkCode } = await params;
  // If parkCode is longer than 4 chars, it's a slug — look up by slug
  let data = parkCode.length > 4
    ? await getParkDetailsBySlug(parkCode)
    : await getParkDetails(parkCode);

  let park = data?.park || data;

  // If slug lookup failed, try correcting common slug errors (e.g. missing "and")
  // and 301 redirect to the canonical URL instead of 404-ing
  if (!park?.fullName && parkCode.length > 4) {
    const correctedSlug = findCorrectSlug(parkCode);
    if (correctedSlug) {
      permanentRedirect(`/parks/${correctedSlug}`);
    }
  }

  if (!park?.fullName) {
    notFound();
  }

  const parkSlug = parkToSlug(park.fullName);

  // Redirect short code URLs (e.g. /parks/yell) to canonical slug URL
  if (parkCode !== parkSlug) {
    permanentRedirect(`/parks/${parkSlug}`);
  }

  const parkUrl = `https://www.nationalparksexplorerusa.com/parks/${parkSlug}`;
  const stateHubSlug = getStateHubSlug(park.states);
  const seoLeadLine = buildParkSeoLeadLine(park, parkSlug);

  // All structured data below is built from our own server API data (trusted NPS source).
  const placeNode = {
    '@type': isTierAPark(parkSlug) ? 'NationalPark' : 'TouristAttraction',
    name: park.fullName,
    description: buildParkMetaDescription(park, parkSlug),
    image: park.images?.[0]?.url,
    address: {
      '@type': 'PostalAddress',
      addressLocality: park.addresses?.[0]?.city,
      addressRegion: park.addresses?.[0]?.stateCode,
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: park.latitude,
      longitude: park.longitude,
    },
    url: parkUrl,
    sameAs: park.url,
  };

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [placeNode],
  };

  // Related parks for "You Might Also Like" — slim payload (~2 KB vs 3.66 MB all-parks)
  let relatedParks = [];
  if (park.states) {
    try {
      const relatedRes = await fetch(
        `${getApiBaseUrl()}/parks/${park.parkCode}/related?limit=4`,
        { next: { revalidate: 86400 } }
      );
      if (relatedRes.ok) {
        const relatedJson = await relatedRes.json();
        relatedParks = relatedJson.data || [];
      }
    } catch {
      // Non-critical — just skip related parks
    }
  }

  let planningSnapshot = getParkPlanningSnapshot(park, parkSlug);
  const alertCount = Array.isArray(data?.alerts) ? data.alerts.length : 0;
  const permitCount = Array.isArray(data?.permits) ? data.permits.length : 0;
  let planningFaqItems = getParkPlanningFaq(park, parkSlug, planningSnapshot, alertCount, { permitCount });

  try {
    const planningRes = await fetch(`${getApiBaseUrl()}/parks/${park.parkCode}/planning`, {
      next: { revalidate: PARK_PAGE_REVALIDATE_SECONDS },
    });
    if (planningRes.ok) {
      const planningJson = await planningRes.json();
      const planningData = planningJson.data;
      if (planningData?.snapshot) {
        planningSnapshot = planningData.snapshot;
        planningFaqItems = hydratePlanningFaq(planningData.faqItems ?? [], park, parkSlug);
      }
    }
  } catch {
    // Non-critical — keep park-field fallback computed above
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ParkDetailClient
        initialData={data}
        parkCode={parkCode}
        relatedParks={relatedParks}
        seoLeadLine={seoLeadLine}
        stateHubSlug={stateHubSlug}
        planningSnapshot={planningSnapshot}
        planningFaqItems={planningFaqItems}
        dataAsOfLabel={AS_OF_FORMAT.format(new Date())}
      />
    </>
  );
}
