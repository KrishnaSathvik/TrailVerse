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
];

const examplePrompts = [
  'Plan a 5-day trip to Yellowstone in September with my fianc\u00e9e',
  'What national parks are in Colorado?',
  'Compare Zion and Grand Canyon for a family trip in June',
  'Are there any road closures at Acadia right now?',
  'Find ranger programs at Grand Canyon this weekend',
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
              Plan trips, compare parks, check live weather and alerts, find ranger programs &mdash;
              all 63 US national parks, right inside Claude. TrailVerse connects Claude to live
              National Park Service data so your trip planning is grounded in real-time conditions,
              not outdated training data.
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
              <SectionBadge>5 Live Tools</SectionBadge>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                What You Get
              </h2>
              <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Five tools that give Claude real-time access to National Park Service data,
                weather, events, and AI trip planning.
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

        {/* Screenshot */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div
              className="rounded-3xl overflow-hidden backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
              }}
            >
              {/* Replace placeholder with: <Image src="/mcp-screenshot.png" alt="TrailVerse tools in Claude" width={1200} height={675} className="w-full h-auto" /> */}
              <div
                className="flex items-center justify-center py-32 px-8"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <div className="text-center">
                  <IconGlyph name="Camera" className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    Screenshot coming soon
                  </p>
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
                    <>Paste the URL below</>,
                    <>Done &mdash; TrailVerse tools appear in your conversation</>,
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
                  When you use a TrailVerse tool, Claude sends only the tool parameters (park name,
                  state, dates) to our server. No conversation history, personal info, or Claude
                  account data is transmitted.
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
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
