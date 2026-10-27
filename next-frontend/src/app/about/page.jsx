import InfoPageHeader from '@/components/info/InfoPageHeader';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';
import FeaturedStoryCard from '@/components/common/FeaturedStoryCard';
import { NPS_DISCLAIMER } from '@/lib/npsDisclaimer';
import { HELLO_EMAIL } from '@/lib/publicEmails';

export const metadata = {
  title: 'About Krishna — The Story Behind TrailVerse',
  description:
    'TrailVerse was built by Krishna, a traveler and photographer inspired by national park adventures. Learn the story behind the platform and the experience that shaped it.',
  openGraph: {
    title: 'About Krishna — The Story Behind TrailVerse',
    description: 'TrailVerse was built by Krishna, a traveler and photographer inspired by national park adventures. Learn the story behind the platform.',
    url: 'https://www.nationalparksexplorerusa.com/about',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — About' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Krishna — The Story Behind TrailVerse',
    description: 'TrailVerse was built by Krishna, a traveler and photographer inspired by national park adventures.',
    images: ['/og-image-trailverse.jpg'],
  },
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/about',
  },
};

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || HELLO_EMAIL;

const skills = [
  {
    icon: 'Camera',
    title: 'Astrophotography',
    description: 'Nikon Z6ii photographer specializing in night sky and landscape photography'
  },
  {
    icon: 'MapPin',
    title: 'Travel Expert',
    description: 'Sharing practical reviews and photographs from personal travels'
  },
  {
    icon: 'Mountain',
    title: 'National Parks',
    description: 'Exploring national parks and sharing what helps travelers prepare'
  },
  {
    icon: 'Sparkles',
    title: 'Content Creation',
    description: 'Sharing park experiences through photography and detailed reviews'
  }
];

const socialLinks = [
  ['Globe', 'Astro by Krishna', 'https://www.astrobykrishna.com', 'Astrophotography Portfolio'],
  ['Instagram', 'TrailVerse Instagram', 'https://www.instagram.com/trailverseapp/', '@trailverseapp'],
  ['Instagram', 'Instagram', 'https://instagram.com/astrobykrishna', '@astrobykrishna'],
  ['Facebook', 'Facebook', 'https://www.facebook.com/travelswithkrishna/', 'Travel Community'],
  ['Camera', 'Pexels', 'https://www.pexels.com/@astrobykrishna/', 'Free Photography'],
  ['Image', '500px', 'https://500px.com/p/astrobykrishna?view=photos', 'Photography Portfolio'],
  ['Image', 'Unsplash', 'https://unsplash.com/@astrobykrishna', 'Astrophotography collection'],
  ['Play', 'TikTok', 'https://www.tiktok.com/@travelswithkrishna', '@travelswithkrishna'],
  ['Pinterest', 'Pinterest', 'https://pin.it/2N6K1Iz', 'Travel Inspiration'],
  ['Map', 'Google Maps', 'https://www.google.com/maps/contrib/118219629305553937668', 'Travel reviews and photographs'],
  ['Mail', 'Email', `mailto:${contactEmail}`, contactEmail],
];

const productHighlights = [
  ['Sparkles', 'Trailie Trip Planning', 'Build itineraries around your dates, pace, interests, and travel style. When signed in, your saved chat history lets you return to a plan and keep refining it instead of starting over.'],
  ['MapPin', 'Interactive Maps', 'Explore parks visually, compare destinations, and find nearby essentials without bouncing between separate map tools and park pages.'],
  ['Calendar', 'Live Events & Weather', 'Check NPS events, available weather forecasts, and official alerts together. Confirm closures, permits, and schedules with the park before traveling.'],
  ['Mountain', 'Community Reviews & Blog', 'Read practical guides, browse real reviews, and learn from actual visits instead of relying only on generic roundup articles.'],
  ['Camera', 'Smart Features & Tracking', 'Keep favorite parks and signed-in trip history in your account. Event bookmarks stay in the browser where you saved them.'],
  ['Globe', 'Prepare for the Road', 'Download an itinerary PDF before leaving. The installable web app caches some resources, but chat and current conditions need a connection.'],
];


function CTAButton({ href, children, secondary = false, external = false }) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`public-action ${secondary ? 'public-action-secondary' : 'public-action-primary'} gap-2 px-6 text-sm font-semibold`}
    >
      {children}
    </Link>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main className="info-page">
        <InfoPageHeader eyebrow="About TrailVerse" icon="Mountain" iconColor="var(--icon-nature)" title="Hey, I’m Krishna" description={<>
                    I built TrailVerse to help travelers avoid the messy part of park planning: scattered tabs, outdated conditions, confusing alerts, and half-finished itineraries.
                  </>}>


                            <div className="flex flex-col sm:flex-row gap-4">
                    <CTAButton href="/plan-ai"><span className="inline-flex items-center gap-2"><IconGlyph name="Sparkles" className="h-4 w-4" />Try Trailie</span></CTAButton>
                    <CTAButton href="/explore" secondary><span className="inline-flex items-center gap-2"><IconGlyph name="Compass" className="h-4 w-4" />Explore Parks</span></CTAButton>
                    <CTAButton href="https://www.instagram.com/travelswithkrishna/" secondary external><span className="inline-flex items-center gap-2"><IconGlyph name="Instagram" className="h-4 w-4" />Follow Me</span></CTAButton>
                  </div>
        </InfoPageHeader>

        <section className="info-section">
          <div className="w-full">
            <div className="public-editorial-section py-6 h-full" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-8">
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>My Story</h2>
              </div>
              <div className="public-content space-y-6 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
<p className="text-lg leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                    I&apos;m Krishna, an astrophotographer and traveler who enjoys exploring national parks. TrailVerse is the all-in-one trip planning tool I always wished existed while planning my own park adventures.
                  </p>
<p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-tertiary)' }}>
                    {NPS_DISCLAIMER}
                  </p>
                <p>TrailVerse started from the way I already travel: planning deeply, documenting everything, and sharing what actually helps once you&apos;re on the road. Over time, that turned into thousands of Google Maps contributions, park visits across the country, and a clearer idea of what travelers really need in one place.</p>
                <p>As a traveler and reviewer, I&apos;ve spent years writing detailed reviews, sharing photos, and leaving practical notes about what&apos;s worth your time. That experience shaped TrailVerse into something grounded in real visits, not just scraped data or generic travel advice.</p>
                <p>I built TrailVerse to make national park planning feel modern and useful: Trailie outdoor trip planning, interactive maps, saved chats, live NPS events, weather, blogs, and community reviews all working together. The goal is simple: help you spend less time juggling tabs and more time planning a trip you&apos;re actually excited about.</p>
                <p>The best outcome is when someone opens TrailVerse, finds the right park, builds a better itinerary, and heads out feeling more prepared and more inspired than they would have otherwise.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="info-section" aria-labelledby="featured-story-heading">
          <div className="w-full">
            <FeaturedStoryCard />
          </div>
        </section>

        <section className="info-section">
          <div className="w-full">
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>What I Do</h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>The mix of travel experience, photography, and product building behind TrailVerse</p>
            </div>
            <div className="info-card-grid">
              {skills.map((skill) => (
                <div key={skill.title} className="public-editorial-section py-6 h-full" style={{ borderColor: 'var(--border)' }}>
                  <div className="info-icon">
                    <IconGlyph name={skill.icon} className="h-6 w-6 text-current" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{skill.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{skill.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="info-section">
          <div className="w-full">
            <div className="public-editorial-section py-6 h-full" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-8">
                <h3 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Connect With Me</h3>
                <p className="text-base" style={{ color: 'var(--text-secondary)' }}>Follow my adventures and connect with me across platforms</p>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {socialLinks.map(([iconName, label, href, description]) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith('mailto:') ? undefined : '_blank'}
                    rel={href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                    className="flex items-start gap-4 p-4 rounded-xl transition hover:bg-white/5"
                    style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
                  >
                    <IconGlyph name={iconName} className="h-6 w-6 shrink-0" style={{ color: 'var(--accent-green)' }} />
                    <div>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="info-section">
          <div className="w-full">
            <div className="text-left mb-16">
              <div className="flex items-center gap-4 mb-8">
                <div className="relative">
                  <Image src="/logo.png" alt="TrailVerse Logo" width={64} height={64} className="h-16 w-16 rounded-2xl object-contain" />
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-green)' }}>
                    <IconGlyph name="Sparkles" className="h-3 w-3 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
                  Why I Built TrailVerse
                </h2>
              </div>
              <p className="text-xl w-full leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                TrailVerse is my attempt to turn real travel experience into a better planning product for people who love parks, road trips, and meaningful outdoor travel.
              </p>
            </div>

            <div className="w-full mb-16">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: 'var(--accent-green-light)', borderWidth: '1px', borderColor: 'var(--accent-green)' }}>
                    <IconGlyph name="Mountain" className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>Why I Built It</span>
                  </div>
                  <h3 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Making trip planning feel less fragmented</h3>
                  <div className="space-y-4 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <p>While visiting parks and sharing reviews and photos, I kept running into the same problem: trip planning was scattered across too many apps and too many tabs.</p>
                    <p>TrailVerse brings those pieces together with AI planning, maps, weather, events, reviews, and saved history so you can go from idea to itinerary without losing context.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    ['470+', 'Parks & Sites'],
                    ['Smart', 'Trip Planning'],
                    ['Real-time', 'Weather & Events'],
                    ['Community', 'Driven Reviews']
                  ].map(([value, label], index) => (
                    <div key={label} className="public-editorial-section py-6 h-full" style={{ borderColor: 'var(--border)' }}>
                      <div className="info-icon">
                        <IconGlyph name={index === 0 ? 'Sparkles' : index === 1 ? 'MapPin' : index === 2 ? 'Camera' : 'Award'} className="h-5 w-5 text-current" />
                      </div>
                      <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="w-full mb-16">
              <div className="mb-8">
                <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Why TrailVerse?</h3>
                <p className="text-lg public-content" style={{ color: 'var(--text-secondary)' }}>
                  Built by a traveler, for travelers. The strongest parts of TrailVerse are the ones I wanted myself while planning park trips.
                </p>
              </div>
              <div className="info-card-grid">
                {productHighlights.map(([iconName, title, description]) => (
                  <div key={title} className="info-panel h-full">
                    <div className="info-icon">
                      <IconGlyph name={iconName} className="h-6 w-6 text-current" />
                    </div>
                    <h4 className="text-xl font-semibold leading-snug mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h4>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full mt-20">
              <div className="public-editorial-section py-6 h-full" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Ready to plan your next trip?</h3>
                <p className="text-base leading-7 mb-8" style={{ color: 'var(--text-secondary)' }}>
                  Start with TrailVerse AI if you want help shaping an itinerary, or jump into Explore if you want to compare parks first.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <CTAButton href="/plan-ai"><span className="inline-flex items-center gap-2"><IconGlyph name="Sparkles" className="h-4 w-4" />Try Trailie</span></CTAButton>
                  <CTAButton href="/explore" secondary><span className="inline-flex items-center gap-2"><IconGlyph name="Compass" className="h-4 w-4" />Start Exploring Parks</span></CTAButton>
                  <CTAButton href="/magazine" secondary><span className="inline-flex items-center gap-2"><IconGlyph name="Mountain" className="h-4 w-4" />Read the Magazine</span></CTAButton>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
