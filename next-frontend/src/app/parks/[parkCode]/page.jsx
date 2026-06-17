import { notFound, permanentRedirect } from 'next/navigation';
import { getAllParkSlugs, getParkDetails, getParkDetailsBySlug } from '@/lib/parkApi';
import {
  buildParkMetaDescription,
  buildParkSeoLeadLine,
  formatStateList,
  getStateHubSlug,
  isTierAPark,
  sortRelatedParks,
} from '@/lib/parkSeo';
import { parkToSlug, findCorrectSlug } from '@/utils/parkSlug';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  getParkPlanningFaq,
  getParkPlanningSnapshot,
  hydratePlanningFaq,
} from '@/lib/parkPlanningContent';
import ParkSeoOverview from '@/components/seo/ParkSeoOverview';
import ParkDetailClient from './ParkDetailClient';
import { canonicalPageMetadata } from '@/lib/seo';

export const revalidate = 3600; // 1 hour — reduces crawler SSR fan-out; client tabs load lazily

export async function generateStaticParams() {
  try {
    const parkSlugs = await getAllParkSlugs();
    // Only generate slug URLs — code-based URLs (e.g. /parks/yell) are
    // handled dynamically and redirect to the canonical slug URL
    return parkSlugs.map(({ slug }) => ({ parkCode: slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params, searchParams }) {
  const { parkCode } = await params;
  const sp = searchParams ? await searchParams : undefined;
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
  const description = buildParkMetaDescription(park, slug);
  const image = park.images?.[0]?.url;
  const url = `https://www.nationalparksexplorerusa.com/parks/${slug}`;

  return {
    title: `${park.fullName} – Live Alerts, Crowd Calendar & Trailie | TrailVerse`,
    description,
    keywords: `${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping`,
    ...canonicalPageMetadata(`/parks/${slug}`, sp),
    openGraph: {
      title: `${park.fullName} – Alerts, Crowds & Trailie`,
      description,
      url,
      siteName: 'TrailVerse',
      images: [{ url: image, width: 1200, height: 630, alt: park.fullName }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${park.fullName} - TrailVerse`,
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
  const statesLabel = formatStateList(park.states);

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

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.nationalparksexplorerusa.com' },
      { '@type': 'ListItem', position: 2, name: 'Explore', item: 'https://www.nationalparksexplorerusa.com/explore' },
      ...(stateHubSlug
        ? [{
            '@type': 'ListItem',
            position: 3,
            name: statesLabel,
            item: `https://www.nationalparksexplorerusa.com/parks/state/${stateHubSlug}`,
          }]
        : []),
      {
        '@type': 'ListItem',
        position: stateHubSlug ? 4 : 3,
        name: park.fullName,
        item: parkUrl,
      },
    ],
  };

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [placeNode, breadcrumb],
  };

  // Fetch related parks (same state, different park) — cached 24h
  let relatedParks = [];
  if (park.states) {
    try {
      const allRes = await fetch(`${getApiBaseUrl()}/parks?all=true`, {
        next: { revalidate: 86400 },
      });
      if (allRes.ok) {
        const allJson = await allRes.json();
        const allParks = allJson.data || [];
        const parkStates = park.states.split(',').map((s) => s.trim());
        const candidates = allParks.filter(
          (p) =>
            p.parkCode !== park.parkCode &&
            parkStates.some((st) => p.states?.includes(st))
        );
        relatedParks = sortRelatedParks(candidates, park).slice(0, 4);
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
      next: { revalidate: 3600 },
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
      <ParkSeoOverview
        park={park}
        parkSlug={parkSlug}
        seoLeadLine={seoLeadLine}
        stateHubSlug={stateHubSlug}
        relatedParks={relatedParks}
      />
      <ParkDetailClient
        initialData={data}
        parkCode={parkCode}
        relatedParks={relatedParks}
        seoLeadLine={seoLeadLine}
        stateHubSlug={stateHubSlug}
        planningSnapshot={planningSnapshot}
        planningFaqItems={planningFaqItems}
      />
    </>
  );
}
