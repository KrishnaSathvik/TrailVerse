import { notFound } from 'next/navigation';
import { getAllParkSlugs, getParkDetails, getParkDetailsBySlug } from '@/lib/parkApi';
import ParkDetailClient from './ParkDetailClient';

export const revalidate = 300; // 5 minutes — park data includes dynamic NPS content

export async function generateStaticParams() {
  try {
    const parkSlugs = await getAllParkSlugs();
    // Return both slug and code so both /parks/yellowstone-national-park
    // and /parks/yell generate during build (needed until redirects fully propagate)
    return parkSlugs.flatMap(({ code, slug }) => [
      { parkCode: slug },
      { parkCode: code },
    ]);
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
    return { title: 'Park Not Found - TrailVerse' };
  }

  const description = `Explore ${park.fullName} in ${park.states}. ${park.description?.substring(0, 150)}... Find activities, camping, weather, and plan your visit.`;
  const image = park.images?.[0]?.url;
  const slug = park.fullName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  const url = `https://www.nationalparksexplorerusa.com/parks/${slug}`;

  return {
    title: `${park.fullName} - Complete Guide & Travel Information | TrailVerse`,
    description,
    keywords: `${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping`,
    alternates: { canonical: url },
    openGraph: {
      title: `${park.fullName} - Complete Guide & Travel Information`,
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

  // Structured data is built from our own server API data (trusted source)
  const structuredData = {
    '@context': 'https://schema.org',
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
    url: `https://www.nationalparksexplorerusa.com/parks/${park.fullName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()}`,
    sameAs: park.url,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ParkDetailClient initialData={data} parkCode={parkCode} />
    </>
  );
}
