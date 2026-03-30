import { notFound } from 'next/navigation';
import { getAllParkCodes, getParkDetails } from '@/lib/parkApi';
import ParkDetailClient from './ParkDetailClient';

export const revalidate = 1800;

export async function generateStaticParams() {
  try {
    const codes = await getAllParkCodes();
    return codes.map((parkCode) => ({ parkCode }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { parkCode } = await params;
  const data = await getParkDetails(parkCode);

  if (!data?.park) {
    return { title: 'Park Not Found - TrailVerse' };
  }

  const { park } = data;
  const description = `Explore ${park.fullName} in ${park.states}. ${park.description?.substring(0, 150)}... Find activities, camping, weather, and plan your visit.`;
  const image = park.images?.[0]?.url;
  const url = `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`;

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
  const data = await getParkDetails(parkCode);

  if (!data?.park) {
    notFound();
  }

  const { park } = data;

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
    url: `https://www.nationalparksexplorerusa.com/parks/${park.parkCode}`,
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
