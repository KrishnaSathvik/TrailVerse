import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LandingSearchClient from './LandingSearchClient';
import LandingDailyFeedClient from './LandingDailyFeedClient';
import LandingPopularBlogsSection from '@/components/landing/LandingPopularBlogsSection';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import IconGlyph from '@/components/common/IconGlyph';
import { parkToSlug } from '@/utils/parkSlug';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getBlogPostsServer } from '@/lib/blogApi';
import { BROWSE_HUB_NAV_LABEL, BROWSE_HUB_PATH } from '@/lib/browseHub';
import {
  LANDING_HERO_BADGE,
  LANDING_HERO_HEADLINE,
  LANDING_HERO_HEADLINE_ACCENT,
  LANDING_HERO_META_DESCRIPTION,
  LANDING_HERO_SUBTITLE,
  LANDING_HERO_PRIMARY_CTA,
  LANDING_PAGE_TITLE,
} from '@/lib/landingHeroCopy';

export const metadata = {
  title: LANDING_PAGE_TITLE,
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com',
  },
  description: LANDING_HERO_META_DESCRIPTION,
  openGraph: {
    title: LANDING_PAGE_TITLE,
    description: LANDING_HERO_META_DESCRIPTION,
  },
  twitter: {
    title: LANDING_PAGE_TITLE,
    description: LANDING_HERO_META_DESCRIPTION,
  },
};

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
  const [allParks, popularBlogsData] = await Promise.all([
    getAllParks(),
    getBlogPostsServer({ limit: 2, page: 1, sortBy: 'views' }),
  ]);
  const popularBlogs = popularBlogsData?.data || [];
  const featuredParks = featuredParkCodes
    .map((code) => allParks.find((park) => park.parkCode === code))
    .filter(Boolean);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="relative z-10 w-full overflow-hidden min-h-[28rem] sm:min-h-[32rem] lg:min-h-[36rem]">
          <Image
            src="/background23.png"
            alt=""
            fill
            priority
            className="object-cover brightness-[0.92] saturate-[1.08]"
            style={{ objectPosition: 'center 40%' }}
            sizes="100vw"
          />
          <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
          <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,transparent_0%,rgba(0,0,0,0.35)_100%)]" />
          <div className="relative z-10 flex min-h-[inherit] w-full flex-col items-center justify-center px-4 py-14 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
            <div className="w-full max-w-3xl mx-auto text-center">
              <p className="animate-fade-in mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm">
                <IconGlyph name="Mountain" className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-green)' }} />
                {LANDING_HERO_BADGE}
              </p>

              <h1
                className="animate-fade-in mb-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl leading-[1.1]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {LANDING_HERO_HEADLINE}
                <span className="block text-[var(--accent-green)]">{LANDING_HERO_HEADLINE_ACCENT}</span>
              </h1>

              <p className="animate-fade-in mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-white/80 text-balance sm:text-base">
                {LANDING_HERO_SUBTITLE}
              </p>

              <div className="animate-fade-in flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/plan-ai"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:brightness-110"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <IconGlyph name="Sparkles" className="h-4 w-4" style={{ color: '#fff' }} />
                  {LANDING_HERO_PRIMARY_CTA}
                </Link>
                <Link
                  href={BROWSE_HUB_PATH}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/15"
                >
                  <IconGlyph name="Compass" className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                  {BROWSE_HUB_NAV_LABEL}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-20 px-4 sm:px-6 lg:px-10 xl:px-12 pt-6 sm:pt-8 pb-2" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-[92rem] mx-auto">
            <div className="relative mx-auto w-full max-w-3xl">
              <LandingSearchClient />
            </div>
          </div>
        </section>

        <section className="relative z-0 pt-8 sm:pt-10 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-10 xl:px-12" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
              {featuredParks.map((park, index) => {
                const parkSlug = parkToSlug(park.fullName);
                const parkUrl = `/parks/${parkSlug}`;
                const planUrl = `/plan-ai?park=${encodeURIComponent(park.parkCode)}&name=${encodeURIComponent(park.fullName)}`;

                return (
                  <article
                    key={park.parkCode}
                    className="group relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                    style={{ aspectRatio: '16/11', boxShadow: 'var(--shadow-lg)' }}
                  >
                    <Image
                      src={park.images?.[0]?.url || '/og-image-trailverse.jpg'}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                      priority={index < 2}
                    />
                    <Link
                      href={parkUrl}
                      className="absolute inset-0 z-[1]"
                      aria-label={`View ${park.fullName}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none z-[2]" />
                    <div className="absolute bottom-0 left-0 right-0 z-10 p-5 sm:p-6 pointer-events-none">
                      <div className="flex items-center gap-2 mb-2">
                        <IconGlyph name="MapPin" className="h-3.5 w-3.5 text-white/70" />
                        <span className="text-xs font-medium text-white/70 uppercase tracking-wider">{park.states}</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-semibold text-white leading-tight">{park.fullName}</h3>
                      <div className="mt-3 pointer-events-auto">
                        <Link
                          href={planUrl}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                          style={{ backgroundColor: 'var(--accent-green)' }}
                        >
                          <IconGlyph name="Sparkles" className="h-3.5 w-3.5" />
                          Plan with Trailie
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 sm:hidden">
              <Link
                href="/explore"
                className="w-full inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                View All 470+ Parks & Sites
              </Link>
            </div>
          </div>
        </section>

        <LandingDailyFeedClient />

        <LandingPopularBlogsSection posts={popularBlogs} />

        <TestimonialsSection limit={3} />

        <div className="pb-16 sm:pb-20 px-4 sm:px-6 text-center">
          <Link
            href="/testimonials"
            className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            style={{ color: 'var(--accent-green)' }}
          >
            Read all traveler stories
            <IconGlyph name="ArrowRight" className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
