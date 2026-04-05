export const metadata = {
  title: 'National Park Events & Ranger Programs | TrailVerse',
  description: 'Browse upcoming national park events, ranger programs, guided tours, and junior ranger activities. Filter by park, date, and activity type.',
  alternates: { canonical: 'https://www.nationalparksexplorerusa.com/events' },
  openGraph: {
    title: 'National Park Events & Ranger Programs | TrailVerse',
    description: 'Browse upcoming ranger programs, guided tours, and events at US national parks.',
    url: 'https://www.nationalparksexplorerusa.com/events',
    siteName: 'TrailVerse',
    type: 'website',
  },
};

export default function EventsLayout({ children }) {
  return children;
}
