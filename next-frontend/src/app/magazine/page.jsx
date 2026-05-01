export const metadata = {
  title: 'TrailVerse Magazine — Issue 01 | Spring 2026',
  description:
    'Explore every feature of TrailVerse — AI trip planning, interactive map, park comparisons, itinerary builder, daily nature feed, and more. 470+ national parks, one platform.',
  openGraph: {
    title: 'TrailVerse Magazine — Issue 01',
    description:
      'Your universe of national parks exploration. Trailie trip planner, interactive map, compare parks, itinerary builder, and more.',
    type: 'website',
  },
};

export default function MagazinePage() {
  return (
    <iframe
      src="/magazine.html"
      title="TrailVerse Magazine — Issue 01"
      style={{
        width: '100vw',
        height: '100dvh',
        border: 'none',
        display: 'block',
      }}
    />
  );
}
