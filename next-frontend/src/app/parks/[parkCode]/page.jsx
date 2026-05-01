import { notFound, permanentRedirect } from 'next/navigation';
import { getAllParkSlugs, getParkDetails, getParkDetailsBySlug } from '@/lib/parkApi';
import { parkToSlug } from '@/utils/parkSlug';
import { getApiBaseUrl } from '@/lib/apiBase';
import ParkDetailClient from './ParkDetailClient';

export const revalidate = 300; // 5 minutes — park data includes dynamic NPS content

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

export async function generateMetadata({ params }) {
  const { parkCode } = await params;
  // If parkCode is longer than 4 chars, it's a slug — look up by slug
  const data = parkCode.length > 4
    ? await getParkDetailsBySlug(parkCode)
    : await getParkDetails(parkCode);

  // getParkDetails returns the park object directly (or { park } in some routes)
  const park = data?.park || data;
  if (!park?.fullName) {
    return { title: '404 - Page Not Found | TrailVerse' };
  }

  const description = `Explore ${park.fullName} in ${park.states}. ${park.description?.substring(0, 150)}... Find activities, camping, weather, and plan your visit.`;
  const image = park.images?.[0]?.url;
  const slug = parkToSlug(park.fullName);
  const url = `https://www.nationalparksexplorerusa.com/parks/${slug}`;

  return {
    title: `${park.fullName} – Live Alerts, Crowd Calendar & Trailie | TrailVerse`,
    description,
    keywords: `${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping`,
    alternates: { canonical: url },
    openGraph: {
      title: `${park.fullName} – Alerts, Crowds & Trailie`,
      description,
      url,
      siteName: 'TrailVerse',
      images: image ? [{ url: image, width: 1200, height: 630, alt: park.fullName }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${park.fullName} - TrailVerse`,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function ParkPage({ params }) {
  const { parkCode } = await params;
  // If parkCode is longer than 4 chars, it's a slug — look up by slug
  const data = parkCode.length > 4
    ? await getParkDetailsBySlug(parkCode)
    : await getParkDetails(parkCode);

  const park = data?.park || data;
  if (!park?.fullName) {
    notFound();
  }

  const parkSlug = parkToSlug(park.fullName);

  // Redirect short code URLs (e.g. /parks/yell) to canonical slug URL
  if (parkCode !== parkSlug) {
    permanentRedirect(`/parks/${parkSlug}`);
  }

  const parkUrl = `https://www.nationalparksexplorerusa.com/parks/${parkSlug}`;

  // All structured data below is built from our own server API data (trusted NPS source).
  // Values are server-rendered strings from the NPS API — not user input.
  const touristAttraction = {
    '@type': 'TouristAttraction',
    name: park.fullName,
    description: park.description,
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

  const structuredData = { '@context': 'https://schema.org', ...touristAttraction };

  // Fetch related parks (same state, different park) — cached 24h
  let relatedParks = [];
  if (park.states) {
    try {
      const allRes = await fetch(`${getApiBaseUrl()}/parks?all=true&nationalParksOnly=true`, {
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
        // Shuffle and pick up to 4
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        relatedParks = candidates.slice(0, 4);
      }
    } catch {
      // Non-critical — just skip related parks
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ParkDetailClient initialData={data} parkCode={parkCode} relatedParks={relatedParks} />
    </>
  );
}
