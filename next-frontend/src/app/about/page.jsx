import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'trailverseteam@gmail.com';

const stats = [
  { value: '17', label: 'Parks Visited', detail: 'Across 23 states', icon: 'Mountain' },
  { value: '379', label: 'Reviews Written', detail: '67M+ views', icon: 'MapPin' },
  { value: '6,589', label: 'Photos Shared', detail: '64.5M+ views', icon: 'Camera' },
  { value: '6', label: 'Years Experience', detail: 'And counting', icon: 'Award' },
];

const skills = [
  {
    icon: 'Camera',
    title: 'Astrophotography',
    description: 'Nikon Z6ii photographer specializing in night sky and landscape photography'
  },
  {
    icon: 'MapPin',
    title: 'Travel Expert',
    description: 'Google Maps Level 8 contributor with 379+ detailed park reviews'
  },
  {
    icon: 'Mountain',
    title: 'National Parks',
    description: '17+ National Parks explored across the United States'
  },
  {
    icon: 'Sparkles',
    title: 'Content Creation',
    description: 'Sharing park experiences through photography and detailed reviews'
  }
];

const socialLinks = [
  ['Globe', 'Astro by Krishna', 'https://www.astrobykrishna.com', 'Astrophotography Portfolio'],
  ['Instagram', 'Instagram', 'https://instagram.com/astrobykrishna', '@astrobykrishna'],
  ['Facebook', 'Facebook', 'https://www.facebook.com/Gitam2015', 'Travel Community'],
  ['Camera', 'Pexels', 'https://www.pexels.com/@astrobykrishna/', 'Free Photography'],
  ['Image', '500px', 'https://500px.com/p/astrobykrishna?view=photos', 'Photography Portfolio'],
  ['Image', 'Unsplash', 'https://unsplash.com/@astrobykrishna', '25+ Astrophotography shots'],
  ['Play', 'TikTok', 'https://www.tiktok.com/@travelswithkrishna', '@travelswithkrishna'],
  ['Pinterest', 'Pinterest', 'https://pin.it/2N6K1Iz', 'Travel Inspiration'],
  ['Map', 'Google Maps Level 8', 'https://www.google.com/maps/contrib/118219629305553937668', 'Level 8 • 67M+ views'],
  ['Mail', 'Email', `mailto:${contactEmail}`, contactEmail],
];

const productHighlights = [
  ['Sparkles', 'Dual AI Trip Planning', 'Build itineraries around your dates, pace, interests, and travel style. Your saved chat history lets you return to a plan and keep refining it instead of starting over.'],
  ['MapPin', 'Interactive Maps', 'Explore parks visually, compare destinations, and find nearby essentials without bouncing between separate map tools and park pages.'],
  ['Calendar', 'Live Events & Weather', 'See real-time NPS events, current conditions, forecasts, alerts, and closures so your plan reflects what is actually happening on the ground.'],
  ['Mountain', 'Community Reviews & Blog', 'Read practical guides, browse real reviews, and learn from actual visits instead of relying only on generic roundup articles.'],
  ['Camera', 'Smart Features & Tracking', 'Save parks, events, and trip history, compare destinations side by side, and keep your planning synced across devices.'],
  ['Globe', 'Offline-Ready', 'Install TrailVerse and keep key trip details accessible when your signal disappears in the park.'],
];

function SectionBadge({ children }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6"
      style={{
        backgroundColor: 'var(--surface-hover)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </span>
    </div>
  );
}

function CTAButton({ href, children, secondary = false, external = false }) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
      style={{
        backgroundColor: secondary ? 'var(--surface)' : 'var(--bg-secondary)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow)'
      }}
    >
      {children}
    </Link>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="pt-3 pb-16 px-4 sm:pt-8 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div
              className="rounded-3xl overflow-hidden backdrop-blur"
              style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
            >
              <div className="p-8 sm:p-12">
                <div className="max-w-4xl mx-auto">
                  <SectionBadge>Krishna&apos;s Story Behind TrailVerse</SectionBadge>
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>
                    Hey, I&apos;m Krishna
                  </h1>
                  <p className="text-lg leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
                    I&apos;m Krishna, a Nikon Z6ii astrophotographer and Google Maps Level 8 contributor who has explored 17 National Parks across 23 states. TrailVerse is the all-in-one trip planning tool I always wished existed while planning my own park adventures.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <CTAButton href="/plan-ai"><span className="inline-flex items-center gap-2"><IconGlyph name="Sparkles" className="h-4 w-4" />Try the AI Trip Planner</span></CTAButton>
                    <CTAButton href="/explore" secondary><span className="inline-flex items-center gap-2"><IconGlyph name="Compass" className="h-4 w-4" />Explore Parks</span></CTAButton>
                    <CTAButton href="https://www.instagram.com/travelswithkrishna/" secondary external><span className="inline-flex items-center gap-2"><IconGlyph name="Instagram" className="h-4 w-4" />Follow Me</span></CTAButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl p-8 sm:p-12 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="text-center mb-8">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>My Story</h2>
              </div>
              <div className="space-y-6 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <p>TrailVerse started from the way I already travel: planning deeply, documenting everything, and sharing what actually helps once you&apos;re on the road. Over time, that turned into thousands of Google Maps contributions, park visits across the country, and a clearer idea of what travelers really need in one place.</p>
                <p>As a Google Maps Level 8 reviewer, I&apos;ve spent years writing detailed reviews, sharing photos, and leaving practical notes about what&apos;s worth your time. That experience shaped TrailVerse into something grounded in real visits, not just scraped data or generic travel advice.</p>
                <p>I built TrailVerse to make national park planning feel modern and useful: AI trip planning, interactive maps, saved chats, live NPS events, weather, blogs, and community reviews all working together. The goal is simple: help you spend less time juggling tabs and more time planning a trip you&apos;re actually excited about.</p>
                <p>The best outcome is when someone opens TrailVerse, finds the right park, builds a better itinerary, and heads out feeling more prepared and more inspired than they would have otherwise.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>My Journey by Numbers</h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>17 parks, thousands of miles, and one big idea: TrailVerse</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl p-6 text-center backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--accent-green)' }}>
                    <IconGlyph name={stat.icon} className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{stat.label}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{stat.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>What I Do</h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>The mix of travel experience, photography, and product building behind TrailVerse</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {skills.map((skill) => (
                <div key={skill.title} className="rounded-2xl p-6 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--accent-green)' }}>
                    <IconGlyph name={skill.icon} className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{skill.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{skill.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="rounded-2xl p-8 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="text-center mb-8">
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
                    className="flex items-center gap-4 p-4 rounded-xl transition hover:bg-white/5"
                    style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
                  >
                    <IconGlyph name={iconName} className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
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

        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="flex items-center justify-center gap-4 mb-8">
                <div className="relative">
                  <Image src="/logo.png" alt="TrailVerse Logo" width={64} height={64} className="h-16 w-16 rounded-2xl object-contain" />
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-green)' }}>
                    <IconGlyph name="Sparkles" className="h-3 w-3 text-white" />
                  </div>
                </div>
                <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-forest-400 to-forest-600 bg-clip-text text-transparent">
                  Why I Built TrailVerse
                </h2>
              </div>
              <p className="text-xl max-w-4xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                TrailVerse is my attempt to turn real travel experience into a better planning product for people who love parks, road trips, and meaningful outdoor travel.
              </p>
            </div>

            <div className="max-w-6xl mx-auto mb-16">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6" style={{ backgroundColor: 'var(--accent-green-light)', borderWidth: '1px', borderColor: 'var(--accent-green)' }}>
                    <IconGlyph name="Mountain" className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>Why I Built It</span>
                  </div>
                  <h3 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Making trip planning feel less fragmented</h3>
                  <div className="space-y-4 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <p>After visiting 17 parks and sharing thousands of reviews and photos on Google Maps, I kept running into the same problem: trip planning was scattered across too many apps and too many tabs.</p>
                    <p>TrailVerse brings those pieces together with AI planning, maps, weather, events, reviews, and saved history so you can go from idea to itinerary without losing context.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ['470+', 'Parks & Sites'],
                    ['Smart', 'Trip Planning'],
                    ['Real-time', 'Weather & Events'],
                    ['Community', 'Driven Reviews']
                  ].map(([value, label], index) => (
                    <div key={label} className="rounded-2xl p-6 backdrop-blur" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: index === 1 ? 'var(--accent-blue)' : index === 2 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
                        <IconGlyph name={index === 0 ? 'Sparkles' : index === 1 ? 'MapPin' : index === 2 ? 'Camera' : 'Award'} className="h-5 w-5 text-white" />
                      </div>
                      <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="max-w-6xl mx-auto mb-16">
              <div className="text-center mb-12">
                <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Why TrailVerse?</h3>
                <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  Built by a traveler, for travelers. The strongest parts of TrailVerse are the ones I wanted myself while planning park trips.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {productHighlights.map(([iconName, title, description], index) => (
                  <div key={title} className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: index % 3 === 1 ? 'var(--accent-blue)' : index % 3 === 2 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
                      <IconGlyph name={iconName} className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h4>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="max-w-4xl mx-auto mt-20">
              <div className="rounded-3xl p-8 text-center sm:p-10" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
                <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Ready to plan your next trip?</h3>
                <p className="text-base leading-7 mb-8" style={{ color: 'var(--text-secondary)' }}>
                  Start with TrailVerse AI if you want help shaping an itinerary, or jump into Explore if you want to compare parks first.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <CTAButton href="/plan-ai"><span className="inline-flex items-center gap-2"><IconGlyph name="Sparkles" className="h-4 w-4" />Try the AI Trip Planner</span></CTAButton>
                  <CTAButton href="/explore" secondary><span className="inline-flex items-center gap-2"><IconGlyph name="Compass" className="h-4 w-4" />Start Exploring Parks</span></CTAButton>
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
