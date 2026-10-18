import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LandingSearchClient from './LandingSearchClient';
import LandingDailyFeedClient from './LandingDailyFeedClient';
import LandingPopularBlogsSection from '@/components/landing/LandingPopularBlogsSection';
import LandingPressMentions from '@/components/landing/LandingPressMentions';
import LandingTestimonialsClient from '@/components/testimonials/LandingTestimonialsClient';
import IconGlyph from '@/components/common/IconGlyph';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getBlogPostsServer } from '@/lib/blogApi';
import LandingHeroCta, { LandingExploreShortcuts } from './LandingHeroCta';
import LandingFeaturedParks from './LandingFeaturedParks';
import { getLandingDailyFeedServer, getLandingTestimonialsServer } from '@/lib/landingApi';
import { LANDING_SECTION, LANDING_SECTION_HEADER_MB, LANDING_SECTION_X } from '@/lib/landingLayout';
import {
  LANDING_HERO_BADGE,
  LANDING_HERO_HEADLINE,
  LANDING_HERO_META_DESCRIPTION,
  LANDING_HERO_SUBTITLE,
  LANDING_PAGE_TITLE,
} from '@/lib/landingHeroCopy';
import { ogImageMeta } from '@/lib/ogImages';

const landingOg = ogImageMeta('landing');

export const metadata = {
  title: LANDING_PAGE_TITLE,
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com',
  },
  description: LANDING_HERO_META_DESCRIPTION,
  openGraph: {
    title: LANDING_PAGE_TITLE,
    description: LANDING_HERO_META_DESCRIPTION,
    url: 'https://www.nationalparksexplorerusa.com',
    siteName: 'TrailVerse',
    type: 'website',
    images: landingOg.openGraphImages,
  },
  twitter: {
    card: 'summary_large_image',
    title: LANDING_PAGE_TITLE,
    description: LANDING_HERO_META_DESCRIPTION,
    images: landingOg.twitterImages,
  },
};

async function getAllParks() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/parks?all=true&nationalParksOnly=true&fields=parkCode,fullName,states,images`, {
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
  const [allParks, popularBlogsData, landingTestimonials, landingDailyFeed] = await Promise.all([
    getAllParks(),
    getBlogPostsServer({ limit: 2, page: 1, sortBy: 'views' }),
    getLandingTestimonialsServer(3),
    getLandingDailyFeedServer(),
  ]);
  const popularBlogs = popularBlogsData?.data || [];
  const featuredParks = featuredParkCodes
    .map((code) => allParks.find((park) => park.parkCode === code))
    .filter(Boolean);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <div className="public-shell">
          <section aria-labelledby="landing-hero-title" className="landing-hero relative z-10 w-full overflow-hidden">
            <Image
              src="/background23.png"
              alt=""
              fill
              priority
              className="object-cover object-center brightness-[0.92] saturate-[1.08]"
              sizes="(min-width: 1280px) 1216px, 100vw"
            />
            <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#071e17]/60 via-[#071e17]/70 to-[#071e17]/90" />
            <div className="relative z-10 flex h-full min-h-[22rem] flex-col justify-center px-4 py-10 sm:min-h-[24rem] sm:px-8 sm:py-12 lg:min-h-0 lg:py-8">
              <div className="mx-auto w-full max-w-3xl text-center">
                <p className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-white/85 sm:text-sm">
                  <IconGlyph name="Mountain" className="h-4 w-4 shrink-0 text-emerald-300" />
                  {LANDING_HERO_BADGE}
                </p>

                <h1
                  id="landing-hero-title"
                  className="mx-auto mb-4 max-w-[19ch] text-[2rem] font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.08] text-balance"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {LANDING_HERO_HEADLINE}
                </h1>

                <p className="mx-auto mb-6 max-w-[30ch] text-balance text-base leading-relaxed text-white/85 sm:mb-8 sm:max-w-xl sm:text-lg">
                  {LANDING_HERO_SUBTITLE}
                </p>

                <LandingHeroCta />
              </div>
            </div>
          </section>
        </div>

        <section aria-label="More ways to explore" className="py-4 sm:py-5">
          <div className="public-shell">
            <LandingExploreShortcuts />
          </div>
        </section>

        <section className="relative z-20 public-shell pt-6 sm:pt-8 pb-2" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="public-full">
            <div className="relative mx-auto w-full public-content">
              <LandingSearchClient />
            </div>
          </div>
        </section>

        <section className={`relative z-0 pt-6 sm:pt-8 pb-0 ${LANDING_SECTION_X}`} style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="public-full">
            <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${LANDING_SECTION_HEADER_MB}`}>
              <div>
                <div className="public-eyebrow" >
                  <IconGlyph name="Mountain" className="h-4 w-4" style={{ color: 'var(--icon-nature)' }} />
                  <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>Popular Destinations</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Start exploring</h2>
                <p className="text-base sm:text-lg mt-2 max-w-lg" style={{ color: 'var(--text-secondary)' }}>Iconic destinations loved by millions — click any park to dive in</p>
              </div>
              <Link href="/explore" className="hidden sm:flex items-center gap-1.5 font-semibold text-sm hover:underline flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--accent-green)' }}>
                View All Parks
                <IconGlyph name="ArrowRight" className="h-4 w-4" />
              </Link>
            </div>

            <LandingFeaturedParks parks={featuredParks} />

            <div className="mt-6 sm:hidden">
              <Link
                href="/explore"
                className="public-action w-full px-5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                View All 470+ Parks & Sites
              </Link>
            </div>
          </div>
        </section>

        <LandingDailyFeedClient initialDailyFeed={landingDailyFeed} />

        <LandingPopularBlogsSection posts={popularBlogs} />

        <LandingPressMentions />

        <LandingTestimonialsClient limit={3} initialTestimonials={landingTestimonials} />

        <div className="pt-4 pb-10 sm:pb-12 px-4 sm:px-6 text-center">
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
