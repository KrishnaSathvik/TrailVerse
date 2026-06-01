import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import EventsPageClient from './EventsPageClient';
import { getDefaultEventMonthRange, getEventsServer } from '@/lib/eventsApi';

export default async function EventsPage() {
  const { dateStart, dateEnd } = getDefaultEventMonthRange();

  const [eventsPayload, summaryPayload] = await Promise.all([
    getEventsServer({
      upcoming: 'true',
      dateStart,
      dateEnd,
      limit: 150,
    }),
    getEventsServer({
      summary: 'true',
      upcoming: 'true',
      dateStart,
      dateEnd,
    }),
  ]);

  const initialData = {
    dateStart,
    dateEnd,
    events: eventsPayload.data || [],
    summary: {
      count: summaryPayload.count || 0,
      meta: summaryPayload.meta || {},
    },
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <EventsPageClient initialData={initialData} />
      <Footer />
    </div>
  );
}
