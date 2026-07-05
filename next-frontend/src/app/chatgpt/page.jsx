import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';
import { TrackedCtaLink, TrackedOutboundLink } from '@/components/distribution/DistributionTrackedLink';

const DIST_CHANNEL = 'chatgpt';

export const metadata = {
  title: 'TrailVerse for ChatGPT — Trailie NPS Trip Planner',
  description:
    'Install the TrailVerse ChatGPT app — live NPS data for 470+ sites plus AI trip planning for any US destination. Alerts, weather, compare, search, and events. No TrailVerse account required.',
  openGraph: {
    title: 'TrailVerse for ChatGPT — Trailie NPS Trip Planner',
    description:
      'Trailie in ChatGPT — 470+ NPS sites with live data, plus day-by-day trip planning for any US destination.',
    url: 'https://www.nationalparksexplorerusa.com/chatgpt',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse for ChatGPT' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrailVerse for ChatGPT — Trailie NPS Trip Planner',
    description:
      'Live NPS data and AI trip planning in ChatGPT — 470+ sites plus state parks, cities, and road trips.',
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
    description:
      'Day-by-day itineraries for any US destination — NPS parks, state parks, cities, and road trips — with constraint-aware planning and live context when available',
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
              Live data for <strong className="font-semibold text-white">470+ NPS parks and sites</strong> inside ChatGPT
              with <strong className="font-semibold text-white">Trailie</strong> — plus day-by-day trip planning for{' '}
              <strong className="font-semibold text-white">any US destination</strong>, including state parks, cities,
              and road trips.
            </p>

            <TrackedOutboundLink
              channel={DIST_CHANNEL}
              ctaId="hero_start_chat"
              label="Start chat"
              href={CHATGPT_APP_URL}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
              Start chat
            </TrackedOutboundLink>
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
                Your chat pulls from live National Park Service data — closures, weather, fees, and
                events — so answers reflect what&apos;s happening now, not old training data.
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
                    <TrackedOutboundLink
                      channel={DIST_CHANNEL}
                      ctaId="install_step_app_link"
                      label="TrailVerse app on ChatGPT"
                      href={CHATGPT_APP_URL}
                      className="font-semibold underline underline-offset-2"
                      style={{ color: 'var(--accent-green)' }}
                    >
                      TrailVerse app on ChatGPT
                    </TrackedOutboundLink>{' '}
                    (sign in if prompted)
                  </>,
                  <>Click <strong>Start chat</strong> on the app page</>,
                  <>
                    Ask for a trip plan, park details, a comparison, or upcoming ranger events
                  </>,
                  <>
                    Planning a state park or want the full website experience? Continue on{' '}
                    <TrackedCtaLink
                      channel={DIST_CHANNEL}
                      ctaId="install_step_plan_ai"
                      label="Trailie"
                      href="/plan-ai"
                      className="font-semibold underline underline-offset-2"
                    >
                      Trailie
                    </TrackedCtaLink>
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
                Requires a ChatGPT account with access to third-party apps. Free to use — save
                trips and use the Plan Workspace on TrailVerse.com.
              </p>

              <TrackedOutboundLink
                channel={DIST_CHANNEL}
                ctaId="install_start_chat"
                label="Start chat"
                href={CHATGPT_APP_URL}
                className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-green)' }}
              >
                <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
                Start chat
              </TrackedOutboundLink>

              <p className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Can&rsquo;t open the listing? Browse{' '}
                <TrackedOutboundLink
                  channel={DIST_CHANNEL}
                  ctaId="apps_directory_fallback"
                  label="ChatGPT Apps"
                  href={CHATGPT_APPS_DIRECTORY}
                  className="underline underline-offset-2"
                >
                  ChatGPT Apps
                </TrackedOutboundLink>{' '}
                and search <strong>TrailVerse</strong>, or type <strong>@TrailVerse</strong> in a new chat.
              </p>
            </div>

            <p className="text-center text-sm mt-8" style={{ color: 'var(--text-tertiary)' }}>
              Prefer Claude?{' '}
              <TrackedCtaLink
                channel={DIST_CHANNEL}
                ctaId="cross_link_mcp"
                label="Install TrailVerse via MCP for Claude"
                href="/mcp"
                className="underline underline-offset-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Install TrailVerse via MCP for Claude
              </TrackedCtaLink>
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
                  Free to use in ChatGPT with generous tool limits. Park details, search, compare,
                  and events cover the NPS catalog; Plan a trip also works for state parks, cities,
                  and road trips. For saved trips, PDF export, and the visual Plan Workspace, use{' '}
                  <TrackedCtaLink channel={DIST_CHANNEL} ctaId="faq_plan_ai" label="Trailie" href="/plan-ai" className="underline underline-offset-2">
                    Trailie
                  </TrackedCtaLink>{' '}
                  on the website.
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
                Open TrailVerse in ChatGPT — live NPS data from 470+ sites and trip planning for
                any US destination.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <TrackedOutboundLink
                  channel={DIST_CHANNEL}
                  ctaId="footer_start_chat"
                  label="Start chat"
                  href={CHATGPT_APP_URL}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
                  Start chat
                </TrackedOutboundLink>
                <TrackedCtaLink
                  channel={DIST_CHANNEL}
                  ctaId="footer_explore_parks"
                  label="Explore Parks"
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
                </TrackedCtaLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
