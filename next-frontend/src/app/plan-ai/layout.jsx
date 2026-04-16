export const metadata = {
  title: 'AI National Park Trip Planner – Compare Parks, Build Itineraries | TrailVerse',
  description:
    'Plan trips across all 470+ U.S. national parks with AI. Use live NPS data, weather, and crowd insights to compare parks, build day-by-day itineraries, and export your trip plan.',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/plan-ai' },
  openGraph: {
    title: 'AI National Park Trip Planner – TrailVerse',
    description:
      'Generate national park itineraries with live alerts, campgrounds, weather, and crowd insight for all 470+ U.S. parks.',
    url: 'https://www.nationalparksexplorerusa.com/plan-ai',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — AI Trip Planner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI National Park Trip Planner – TrailVerse',
    description:
      'Plan smarter national park trips with live NPS data and AI-powered itineraries.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — all values are hardcoded string literals (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'TrailVerse AI National Park Trip Planner',
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Web',
      url: 'https://www.nationalparksexplorerusa.com/plan-ai',
      description:
        'AI trip planner for all 470+ U.S. national parks. Uses live NPS data, weather, and structured itineraries to help you plan your perfect park visit.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      publisher: {
        '@type': 'Organization',
        name: 'TrailVerse',
        url: 'https://www.nationalparksexplorerusa.com',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is there a free AI trip planner for U.S. national parks?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. TrailVerse offers a free AI trip planner that covers all 470+ U.S. national parks and sites. It uses live NPS data, real-time weather, and crowd insights to generate personalized day-by-day itineraries. No account is required for your first 5 messages.',
          },
        },
        {
          '@type': 'Question',
          name: 'What data does the AI national park trip planner use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The planner pulls live data from the National Park Service API including current alerts, closures, operating hours, entrance fees, campground availability, and weather forecasts. It combines this with AI models (GPT-4.1 and Claude) to build realistic itineraries.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I plan a multi-park road trip with this tool?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. You can ask the AI to plan trips across multiple parks. Describe your starting point, travel dates, group size, and interests, and it will suggest a route with day-by-day stops, drive times, and activities at each park.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I export or share my national park itinerary?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'With a free account you can save trips, use the drag-and-drop itinerary builder to customize your plan, export it as a PDF, and share a link with travel companions.',
          },
        },
      ],
    },
  ],
});

export default function PlanAILayout({ children }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {children}
    </>
  );
}
