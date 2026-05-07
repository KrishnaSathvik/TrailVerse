import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';

export const metadata = {
  title: 'TrailVerse for Claude — MCP Integration',
  description:
    'Connect Claude to live National Park Service data. Plan trips, compare parks, check weather and alerts, find ranger programs — all 63 US national parks, right inside Claude.',
  openGraph: {
    title: 'TrailVerse for Claude — MCP Integration',
    description:
      'Plan trips, compare parks, check live weather and alerts, find ranger programs — all 63 US national parks, right inside Claude.',
    url: 'https://www.nationalparksexplorerusa.com/mcp',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse MCP for Claude' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrailVerse for Claude — MCP Integration',
    description:
      'Plan trips, compare parks, check live weather and alerts — all 63 US national parks, right inside Claude.',
    images: ['/og-image-trailverse.jpg'],
  },
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/mcp',
  },
};

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
    description: 'Full park info: weather, entrance fees, hours, active closures',
    accent: 'var(--accent-blue)',
  },
  {
    icon: 'Scales',
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
    icon: 'Chat',
    title: 'Multi-Turn Planning',
    description: 'Refine and extend plans across messages \u2014 "now add day 4" just works',
    accent: 'var(--accent-orange)',
  },
];

const examplePrompts = [
  'Plan a 5-day trip to Yellowstone in September with my fianc\u00e9e',
  'Is Going-to-the-Sun Road open right now?',
  'Compare Zion and Grand Canyon for a family trip in June',
  'What\u2019s the weather at Glacier this week?',
  'Are there star parties at Bryce this month?',
  'Plan a 3-day photography road trip through Utah\u2019s parks',
];

const MCP_URL = 'https://trailverse-mcp.onrender.com/mcp';

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

export default function MCPPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        {/* Hero */}
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
                MCP Integration
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
              TrailVerse for Claude
            </h1>

            <p className="text-lg sm:text-xl leading-relaxed mb-10 text-white/90 max-w-3xl mx-auto">
              Connect Claude to live National Park Service data. Real alerts, real weather,
              real itineraries &mdash; for all 63 parks.
            </p>

            <a
              href="#install"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
              Install in Claude
            </a>
          </div>
        </section>

        {/* What You Get — 5 Tool Cards */}
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
                TrailVerse connects Claude to live National Park Service data so your trip
                planning is grounded in real-time conditions, not outdated training data.
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

        {/* See It in Action */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <SectionBadge>See It in Action</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Real Conversations, Real Data
              </h2>
              <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                TrailVerse gives Claude live park data &mdash; road closures, weather,
                crowds, fees &mdash; so every answer is grounded in what&rsquo;s actually happening.
              </p>
            </div>

            {/* Plan a Trip */}
            <div className="mb-16">
              <h3
                className="text-xl font-semibold mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                Plan a Trip
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <img
                    src="/mcp-screenshot1.png"
                    alt="Claude checking live Yosemite conditions — road closures and seasonal alerts before building the itinerary"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Live conditions check
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Claude pulls real-time road closures and alerts before planning &mdash; Tioga Road
                      and Glacier Point Road are closed, so it routes around them automatically.
                    </p>
                  </div>
                </div>

                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <img
                    src="/mcp-screenshot2.png"
                    alt="Completed itinerary with packing list, driving warnings, and Google Maps links for each day"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Actionable itinerary
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Packing lists based on real weather, driving time warnings, and
                      Google Maps links for each day of your trip.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compare Parks */}
            <div>
              <h3
                className="text-xl font-semibold mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                Compare Parks
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <img
                    src="/mcp-compare1.png"
                    alt="Side-by-side comparison of Death Valley and Joshua Tree — live weather, crowds, fees, and activities"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Side-by-side with live data
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Real-time temperature, crowd levels, entry fees, and top activities
                      pulled from both parks at once.
                    </p>
                  </div>
                </div>

                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <img
                    src="/mcp-compare2.png"
                    alt="Detailed recommendation on which park is better with kids — trail suggestions, heat risk, and wow factor"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Opinionated recommendation
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Not just data &mdash; Claude picks the better option for your situation
                      with kid-friendly trails, heat risk, and specific reasons why.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Find Events */}
            <div className="mt-16">
              <h3
                className="text-xl font-semibold mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                Find Events
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <img
                    src="/mcp-events2.png"
                    alt="Grand Canyon events next week — daily ranger programs and special events with times and locations"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Ranger programs and special events
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Daily ranger talks, guided rim walks, comedy nights, and film screenings &mdash;
                      with times, locations, and whether they&rsquo;re free.
                    </p>
                  </div>
                </div>

                <div
                  className="rounded-2xl overflow-hidden"
                  style={{
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <img
                    src="/mcp-events1.png"
                    alt="Death Valley events — no scheduled programs, with contextual advice about heat, self-guided options, and astrophotography"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Context when there&rsquo;s nothing scheduled
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      No events? Claude explains why and suggests what you can still do &mdash;
                      self-guided stops, dark sky windows, and heat safety tips.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Install */}
        <section id="install" className="py-16 px-4 sm:px-6 lg:px-8 scroll-mt-20">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <SectionBadge>Setup</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Install in Under a Minute
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Claude.ai */}
              <div
                className="rounded-2xl p-6 sm:p-8 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                }}
              >
                <h3
                  className="text-xl font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Claude.ai
                </h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
                  Pro / Max / Team / Enterprise
                </p>

                <ol className="space-y-4">
                  {[
                    <>Open <strong>Settings</strong> &rarr; <strong>Connectors</strong></>,
                    <>Click &ldquo;Add custom connector&rdquo;</>,
                    <>Name: <strong>TrailVerse</strong>, URL: paste from below</>,
                    <>Click Add &mdash; TrailVerse tools appear in your conversation</>,
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
                <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                  Requires Pro, Max, Team, or Enterprise plan. Free plan users cannot add custom connectors.
                </p>

                <div
                  className="mt-6 rounded-lg px-4 py-3 font-mono text-sm select-all"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {MCP_URL}
                </div>
              </div>

              {/* Claude Code */}
              <div
                className="rounded-2xl p-6 sm:p-8 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                }}
              >
                <h3
                  className="text-xl font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Claude Code
                </h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
                  CLI
                </p>

                <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Run this command in your terminal to add TrailVerse as a user-scoped MCP server:
                </p>

                <div
                  className="rounded-lg px-4 py-3 font-mono text-sm select-all overflow-x-auto"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  claude mcp add --transport http trailverse {MCP_URL} --scope user
                </div>

                <p className="text-sm mt-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  After adding, TrailVerse tools will be available in every Claude Code session.
                  You can verify with:
                </p>

                <div
                  className="mt-3 rounded-lg px-4 py-3 font-mono text-sm select-all"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  claude mcp list
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Example Prompts */}
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
                Once installed, try asking Claude any of these.
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

        {/* Privacy */}
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
                  What leaves Claude
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  When you use a TrailVerse tool, Claude sends the tool parameters (park name,
                  state, dates, your trip request) to our server. For multi-turn trip planning,
                  the messages within that planning session are sent to enable follow-ups like
                  &ldquo;now add day 4.&rdquo; Sessions expire after 2 hours. No Claude account
                  data, billing info, or unrelated conversation history is transmitted.
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
                  Free to use. Trip planning is rate-limited to 5 requests per 48 hours;
                  park details, search, compare, and events have generous shared limits.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
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
                Install TrailVerse in Claude and start planning your next national park trip
                with live data.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="#install"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
                  Install Now
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
              <p className="text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
                Built by{' '}
                <a
                  href="https://x.com/latentengineer_"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  @latentengineer_
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
