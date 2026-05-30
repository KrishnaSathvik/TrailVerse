import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';

export const metadata = {
  title: 'TrailVerse for ChatGPT — National Park Planner App',
  description:
    'Install the TrailVerse ChatGPT app to plan trips, compare parks, check live weather and alerts, and find ranger programs across 470+ NPS sites.',
  openGraph: {
    title: 'TrailVerse for ChatGPT — National Park Planner App',
    description:
      'Plan trips, compare parks, check live weather and alerts — all 470+ NPS sites, right inside ChatGPT.',
    url: 'https://www.nationalparksexplorerusa.com/chatgpt',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse for ChatGPT' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrailVerse for ChatGPT — National Park Planner App',
    description:
      'Plan trips, compare parks, check live weather and alerts — all 470+ NPS sites, right inside ChatGPT.',
    images: ['/og-image-trailverse.jpg'],
  },
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/chatgpt',
  },
};

const CHATGPT_APPS_DIRECTORY = 'https://chatgpt.com/apps';
/** Published app page — OpenAI dashboard → View in Directory */
const CHATGPT_APP_URL =
  process.env.NEXT_PUBLIC_CHATGPT_APP_URL ||
  'https://chatgpt.com/apps/trailverse/asdk_app_69e9c67943c08191a37c464b803ebdbe';

const tools = [
  {
    icon: 'Map',
    title: 'Plan a Trip',
    description: 'AI-powered day-by-day itineraries with live alerts, weather, and crowd data',
    accent: 'var(--accent-green)',
  },
  {
    icon: 'Mountain',
    title: 'Park Details',
    description: 'Live weather, alerts, entrance fees, hours, campgrounds, permits, activities, and Google Maps',
    accent: 'var(--accent-blue)',
  },
  {
    icon: 'ArrowsLeftRight',
    title: 'Compare Parks',
    description: 'Side-by-side comparison of 2\u20134 parks on weather, crowds, fees, activities',
    accent: 'var(--accent-orange)',
  },
  {
    icon: 'Search',
    title: 'Search Parks',
    description: 'Find parks by state, activity, or name across all NPS sites',
    accent: 'var(--accent-green)',
  },
  {
    icon: 'Calendar',
    title: 'Find Events',
    description: 'Ranger programs, guided tours, and special events with dates and locations',
    accent: 'var(--accent-blue)',
  },
  {
    icon: 'MessageSquare',
    title: 'Multi-Turn Planning',
    description: 'Refine and extend plans across messages \u2014 "now add day 4" just works',
    accent: 'var(--accent-orange)',
  },
];

const examplePrompts = [
  'Plan a 5-day trip to Yellowstone in September with my fianc\u00e9e',
  'Is Going-to-the-Sun Road open right now?',
  'Compare Zion and Grand Canyon for a family trip in June',
  'What national parks are in Washington state?',
  'Are there star parties at Bryce this month?',
  'Plan a 3-day photography road trip through Utah\u2019s parks',
];

function SectionBadge({ children }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6"
      style={{
        backgroundColor: 'var(--surface-hover)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)' }}
      >
        {children}
      </span>
    </div>
  );
}

export default function ChatGPTPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        <section className="relative w-full min-h-[70vh] flex items-center justify-center">
          <div
            className="absolute inset-0 w-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: 'url(/background23.png)',
              filter: 'brightness(0.4)',
              width: '100vw',
              left: '50%',
              marginLeft: '-50vw',
            }}
          />
          <div
            className="absolute inset-0 w-full bg-gradient-to-b from-black/20 via-black/40 to-black/60"
            style={{ width: '100vw', left: '50%', marginLeft: '-50vw' }}
          />

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 ring-1 backdrop-blur mb-8 bg-white/10 border-white/20">
              <IconGlyph name="Sparkles" className="h-4 w-4 text-white" />
              <span className="text-xs font-medium uppercase tracking-wider text-white">
                ChatGPT App
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
              TrailVerse for ChatGPT
            </h1>

            <p className="text-lg sm:text-xl leading-relaxed mb-10 text-white/90 max-w-3xl mx-auto">
              Explore &amp; plan park trips in ChatGPT. Live NPS alerts, weather,
              and AI itineraries for 470+ parks &mdash; right from the official app listing.
            </p>

            <a
              href={CHATGPT_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
              Start chat
            </a>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <SectionBadge>Real-time NPS Data</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                What You Get
              </h2>
              <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                The TrailVerse ChatGPT app connects your conversation to live National Park
                Service data so planning stays grounded in current conditions, not stale training data.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tools.map((tool) => (
                <div
                  key={tool.title}
                  className="rounded-2xl p-6 backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: tool.accent }}
                  >
                    <IconGlyph name={tool.icon} className="h-6 w-6 text-white" />
                  </div>
                  <h3
                    className="text-xl font-semibold mb-3"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {tool.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {tool.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="install" className="py-16 px-4 sm:px-6 lg:px-8 scroll-mt-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <SectionBadge>Setup</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Get Started in ChatGPT
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                No API keys or connectors to configure &mdash; install the app and start asking.
              </p>
            </div>

            <div
              className="rounded-2xl p-6 sm:p-8 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
              }}
            >
              <ol className="space-y-4">
                {[
                  <>
                    Open the{' '}
                    <a
                      href={CHATGPT_APP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline underline-offset-2"
                      style={{ color: 'var(--accent-green)' }}
                    >
                      TrailVerse app on ChatGPT
                    </a>{' '}
                    (sign in if prompted)
                  </>,
                  <>Click <strong>Start chat</strong> on the app page</>,
                  <>
                    Ask for a trip plan, park details, a comparison, or upcoming ranger events
                  </>,
                  <>
                    For unlimited planning on the full site, continue at{' '}
                    <Link href="/plan-ai" className="font-semibold underline underline-offset-2">
                      Trailie AI Planner
                    </Link>
                  </>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: 'var(--accent-green)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {step}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
                Requires a ChatGPT account with access to third-party apps. Trip planning in the app
                is rate-limited; park search, details, compare, and events have generous limits.
              </p>

              <a
                href={CHATGPT_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-green)' }}
              >
                <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
                Start chat
              </a>

              <p className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Can&rsquo;t open the listing? Browse{' '}
                <a
                  href={CHATGPT_APPS_DIRECTORY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  ChatGPT Apps
                </a>{' '}
                and search <strong>TrailVerse</strong>, or type <strong>@TrailVerse</strong> in a new chat.
              </p>
            </div>

            <p className="text-center text-sm mt-8" style={{ color: 'var(--text-tertiary)' }}>
              Prefer Claude?{' '}
              <Link href="/mcp" className="underline underline-offset-2" style={{ color: 'var(--text-secondary)' }}>
                Install TrailVerse via MCP for Claude
              </Link>
            </p>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <SectionBadge>Try It</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Example Prompts
              </h2>
              <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Once the app is open, try asking ChatGPT any of these.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {examplePrompts.map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-2xl p-5 backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <p
                    className="text-sm leading-relaxed italic"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    &ldquo;{prompt}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <SectionBadge>Privacy</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Your Data, Transparently
              </h2>
            </div>

            <div
              className="rounded-3xl p-8 sm:p-10 backdrop-blur space-y-8"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
              }}
            >
              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  What leaves ChatGPT
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  When you use a TrailVerse tool, ChatGPT sends the tool parameters (park name,
                  state, dates, your trip request) to our server. For multi-turn trip planning,
                  messages within that planning session are sent so follow-ups like &ldquo;now add
                  day 4&rdquo; work. Sessions expire after 2 hours. No ChatGPT billing data or
                  unrelated chat history is transmitted.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  What we log
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  We log tool calls (park code, timestamp) for rate limiting and reliability
                  monitoring. No personally identifiable information is stored. Logs are retained
                  for 30 days.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Data source
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  All park data comes from the National Park Service API (nps.gov). Weather data
                  from OpenWeatherMap. We do not sell or share any data.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Limits
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Free to use in ChatGPT. Trip planning is rate-limited to 5 requests per 48 hours;
                  park details, search, compare, and events have generous shared limits. Unlimited
                  planning is available on{' '}
                  <Link href="/plan-ai" className="underline underline-offset-2">
                    nationalparksexplorerusa.com
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div
              className="rounded-3xl p-8 text-center sm:p-10"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
              }}
            >
              <h3
                className="text-3xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Ready to explore?
              </h3>
              <p
                className="text-base leading-7 mb-8"
                style={{ color: 'var(--text-secondary)' }}
              >
                Open TrailVerse in ChatGPT and start planning your next trip with live data
                from 470+ NPS sites.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={CHATGPT_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
                  Start chat
                </a>
                <Link
                  href="/explore"
                  className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <IconGlyph name="Compass" className="h-4 w-4" />
                    Explore Parks
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
