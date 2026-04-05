import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';

const API_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://trailverse.onrender.com/api'
    : 'http://localhost:5001/api');

async function getSharedTrip(shareId) {
  try {
    const res = await fetch(`${API_URL}/trips/shared/${shareId}`, {
      next: { revalidate: 3600 }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) return { title: 'Trip Not Found | TrailVerse' };

  return {
    title: `${trip.title || 'Trip Plan'} | TrailVerse`,
    description: `Check out this ${trip.parkName || 'national park'} trip plan created with TrailVerse AI trip planner.`,
    openGraph: {
      title: trip.title || 'Shared Trip Plan',
      description: `A ${trip.parkName || 'national park'} trip plan made with TrailVerse AI`,
      url: `https://www.nationalparksexplorerusa.com/plan-ai/shared/${shareId}`,
      siteName: 'TrailVerse',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: trip.title || 'Shared Trip Plan',
      description: `A ${trip.parkName || 'national park'} trip plan made with TrailVerse AI`,
    },
    robots: { index: true, follow: true },
  };
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  } catch { return null; }
}

export default async function SharedTripPage({ params }) {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);
  if (!trip) notFound();

  const formData = trip.formData || {};
  const plan = trip.plan;
  const hasDays = plan?.days && plan.days.length > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="pt-16">

        {/* Hero */}
        <section
          className="py-12 px-4 sm:px-6 lg:px-8"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <nav className="text-xs mb-4 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <Link href="/" style={{ color: 'var(--text-tertiary)' }}>Home</Link>
              <span>/</span>
              <Link href="/plan-ai" style={{ color: 'var(--text-tertiary)' }}>Plan AI</Link>
              <span>/</span>
              <span style={{ color: 'var(--text-secondary)' }}>Shared Trip</span>
            </nav>

            {/* Shared badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-4"
              style={{ backgroundColor: 'rgba(67, 160, 106, 0.1)', color: 'var(--accent-green)' }}>
              <span>🔗</span>
              <span>Shared Trip Plan</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              {trip.title || `${trip.parkName || 'National Park'} Trip Plan`}
            </h1>

            {trip.parkName && (
              <p className="text-lg mb-4" style={{ color: 'var(--text-secondary)' }}>
                {trip.parkName}
              </p>
            )}

            {/* Trip meta chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              {formData.startDate && (
                <span className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  📅 {formatDate(formData.startDate)}
                  {formData.endDate ? ` → ${formatDate(formData.endDate)}` : ''}
                </span>
              )}
              {formData.groupSize && (
                <span className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  👥 {formData.groupSize}
                </span>
              )}
              {formData.budget && (
                <span className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  💰 {formData.budget}
                </span>
              )}
              {formData.fitnessLevel && (
                <span className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  🥾 {formData.fitnessLevel}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Structured Day Summary */}
        {hasDays && (
          <section className="py-8 px-4 sm:px-6 lg:px-8" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Itinerary Overview
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plan.days.map((day) => (
                  <div
                    key={day.id}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-green)' }}>
                      {day.label}
                    </p>
                    <ul className="space-y-1.5">
                      {(day.stops || []).slice(0, 5).map((stop) => (
                        <li key={stop.id} className="flex items-start gap-2">
                          <span className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>•</span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {stop.name}
                          </span>
                        </li>
                      ))}
                      {(day.stops || []).length > 5 && (
                        <li className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          +{day.stops.length - 5} more stops
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Highlights */}
              {plan.highlights?.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Trip Highlights
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {plan.highlights.map((h, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full text-xs"
                        style={{ backgroundColor: 'rgba(67,160,106,0.08)', color: 'var(--accent-green)', border: '1px solid rgba(67,160,106,0.2)' }}
                      >
                        ✓ {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Full Conversation */}
        {trip.conversation && trip.conversation.length > 0 && (
          <section className="py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Full Trip Plan
              </h2>
              <div className="space-y-4">
                {trip.conversation.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-2xl rounded-2xl px-4 py-3 text-sm"
                      style={{
                        backgroundColor: msg.role === 'user'
                          ? 'var(--accent-green)'
                          : 'var(--surface)',
                        color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                        border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.6'
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div
              className="rounded-2xl p-8"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Plan your own trip with TrailVerse AI
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Free AI trip planner for all 470+ US national parks — real-time weather, live park alerts, and personalized itineraries.
              </p>
              <Link
                href="/plan-ai"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition"
                style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}
              >
                Start Planning Free →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
