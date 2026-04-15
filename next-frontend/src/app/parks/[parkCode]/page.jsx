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
    return { title: '404 - Page Not Found | TrailVerse' };
  }

  const description = `Explore ${park.fullName} in ${park.states}. ${park.description?.substring(0, 150)}... Find activities, camping, weather, and plan your visit.`;
  const image = park.images?.[0]?.url;
  const slug = park.fullName.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  const url = `https://www.nationalparksexplorerusa.com/parks/${slug}`;

  return {
    title: `${park.fullName} – Live Alerts, Crowd Calendar & AI Trip Planner | TrailVerse`,
    description,
    keywords: `${park.fullName}, ${park.states} national park, visit ${park.fullName}, ${park.fullName} guide, ${park.fullName} hiking, ${park.fullName} camping`,
    alternates: { canonical: url },
    openGraph: {
      title: `${park.fullName} – Alerts, Crowds & AI Trip Planner`,
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

  const parkSlug = park.fullName.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  const parkUrl = `https://www.nationalparksexplorerusa.com/parks/${parkSlug}`;

  // All structured data below is built from our own server API data (trusted NPS source).
  // Values are server-rendered strings from the NPS API — not user input.
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
    url: parkUrl,
    sameAs: park.url,
  };

  // FAQ schema — dynamic answers from NPS data (trusted source, not user input)
  const faqItems = [];
  if (park.states) {
    faqItems.push({
      '@type': 'Question',
      name: `What state is ${park.fullName} in?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${park.fullName} is located in ${park.states}.${park.addresses?.[0]?.city ? ` The nearest city is ${park.addresses[0].city}, ${park.addresses[0].stateCode}.` : ''}`,
      },
    });
  }
  if (park.latitude && park.longitude) {
    faqItems.push({
      '@type': 'Question',
      name: `Where is ${park.fullName} located?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${park.fullName} is located at coordinates ${park.latitude}, ${park.longitude} in ${park.states}.${park.directionsInfo ? ` ${park.directionsInfo.substring(0, 200)}` : ''}`,
      },
    });
  }
  if (park.weatherInfo) {
    faqItems.push({
      '@type': 'Question',
      name: `What is the weather like at ${park.fullName}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: park.weatherInfo.substring(0, 300),
      },
    });
  }
  if (park.entranceFees?.length > 0) {
    const fee = park.entranceFees[0];
    const feeText = fee.cost && fee.cost !== '0.00' && fee.cost !== '0'
      ? `The ${fee.title || 'standard entrance fee'} for ${park.fullName} is $${fee.cost}.${fee.description ? ` ${fee.description.substring(0, 200)}` : ''}`
      : `Entrance to ${park.fullName} is free.`;
    faqItems.push({
      '@type': 'Question',
      name: `How much does it cost to visit ${park.fullName}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: feeText,
      },
    });
  }

  const faqSchema = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems,
  } : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
      <ParkDetailClient initialData={data} parkCode={parkCode} />
    </>
  );
}
