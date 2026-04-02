import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import EventsPageClient from './EventsPageClient';

export default function EventsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <EventsPageClient />
      <Footer />
    </div>
  );
}
