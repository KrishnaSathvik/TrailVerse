import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LandingSearchClient from './LandingSearchClient';
import LandingDailyFeedClient from './LandingDailyFeedClient';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import IconGlyph from '@/components/common/IconGlyph';
import { getApiBaseUrl } from '@/lib/apiBase';

async function getAllParks() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/parks?all=true&nationalParksOnly=true`, {
      next: { revalidate: 86400 }
    });

    if (!response.ok) return [];

    const payload = await response.json();
    return payload?.data || [];
  } catch {
    return [];
  }
}

const featuredParkCodes = ['yell', 'yose', 'grca', 'zion', 'glac', 'acad'];

export default async function LandingPage() {
  const allParks = await getAllParks();
  const featuredParks = featuredParkCodes
    .map((code) => allParks.find((park) => park.parkCode === code))
    .filter(Boolean);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="relative z-30 w-full overflow-x-hidden overflow-y-visible" style={{ minHeight: 'calc(100dvh - 64px)' }}>
          <Image
            src="/background23.png"
            alt=""
            fill
            priority
            className="object-cover"
            style={{ objectPosition: 'center 25%' }}
            sizes="100vw"
          />
          <div className="absolute inset-0 z-[1] bg-black/50" />
          <div className="relative z-10 w-full flex flex-col items-center justify-center px-4 sm:px-6 lg:px-10 xl:px-12 pt-[2.75rem] sm:pt-32 lg:pt-40 pb-20 sm:pb-32 lg:pb-40">
            <div className="w-full max-w-6xl mx-auto text-center">
              <div className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 backdrop-blur-md mb-8 sm:mb-10 shadow-lg bg-black/30 border border-white/10">
                <IconGlyph name="Route" className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: 'var(--accent-green)' }} />
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-white/90" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>470+ Parks. One Platform.</span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-tight mb-6 sm:mb-8 text-white w-full text-center" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, lineHeight: '0.95', textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 0 30px rgba(0,0,0,0.4)' }}>
                Discover America&apos;s <br className="hidden sm:block" />
                <span style={{ color: 'var(--accent-green)', textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 0 30px rgba(0,0,0,0.4)' }}>National Parks.</span>
              </h1>

              <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-medium leading-relaxed text-white max-w-3xl mx-auto mb-2" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                Explore 470+ parks and sites with real-time weather, interactive maps, community reviews, and smart trip planning.
              </p>
              <p className="text-base sm:text-lg lg:text-xl font-medium text-white/90 max-w-3xl mx-auto mb-10 sm:mb-12" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                Your next adventure starts here.
              </p>

              <LandingSearchClient parks={allParks} />

              <p className="text-sm sm:text-base text-white/90 font-medium mb-4" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
                Start exploring now — browse every park, check live weather, compare destinations, and plan your next trip.
              </p>

              <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
                <Link href="/plan-ai" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 backdrop-blur-md" style={{ backgroundColor: 'var(--accent-green)' }}>
                  <IconGlyph name="Sparkles" className="h-4 w-4" style={{ color: '#fff' }} />
                  Plan with AI
                </Link>
                <Link href="/explore" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white/90 transition-all hover:bg-black/60 bg-black/40 border border-white/10 backdrop-blur-md">
                  <IconGlyph name="Compass" className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                  Browse All Parks
                </Link>
                <Link href="/map" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white/90 transition-all hover:bg-black/60 bg-black/40 border border-white/10 backdrop-blur-md">
                  <IconGlyph name="Map" className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                  Interactive Map
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-0 py-16 sm:py-20 px-4 sm:px-6 lg:px-10 xl:px-12" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-[92rem] mx-auto">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 ring-1" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <IconGlyph name="Mountain" className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
                  <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>Popular Destinations</span>
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Start exploring</h2>
                <p className="text-base sm:text-lg mt-2 max-w-lg" style={{ color: 'var(--text-secondary)' }}>Iconic destinations loved by millions — click any park to dive in</p>
              </div>
              <Link href="/explore" className="hidden sm:flex items-center gap-1.5 font-semibold text-sm hover:underline flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--accent-green)' }}>
                View All Parks
                <IconGlyph name="ArrowRight" className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {featuredParks.map((park, index) => (
                <Link
                  key={park.parkCode}
                  href={`/parks/${park.parkCode}`}
                  className="group block relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{ aspectRatio: '16/11', boxShadow: 'var(--shadow-lg)' }}
                >
                  <Image
                    src={park.images?.[0]?.url || '/og-image-trailverse.jpg'}
                    alt={park.fullName}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    priority={index < 2}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <IconGlyph name="MapPin" className="h-3.5 w-3.5 text-white/70" />
                      <span className="text-xs font-medium text-white/70 uppercase tracking-wider">{park.states}</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-white leading-tight mb-1">{park.fullName}</h3>
                    <p className="text-sm text-white/60 line-clamp-2 hidden sm:block">{park.description?.substring(0, 100)}...</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 sm:hidden">
              <Link
                href="/explore"
                className="w-full inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                View All 470+ Parks
              </Link>
            </div>
          </div>
        </section>

        <LandingDailyFeedClient />

        <TestimonialsSection featured limit={6} />
      </main>

      <Footer />
    </div>
  );
}
