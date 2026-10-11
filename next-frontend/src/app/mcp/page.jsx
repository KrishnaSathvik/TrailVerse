import IntegrationDetails from '@/components/info/IntegrationDetails';
import { INTEGRATION_CAPABILITIES } from '@/data/integrationCapabilities';
import InfoPageHeader, { InfoSectionLabel } from '@/components/info/InfoPageHeader';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';
import {
  McpConnectorCopyButton,
  TrackedCtaLink,
} from '@/components/distribution/DistributionTrackedLink';

const DIST_CHANNEL = 'mcp';

export const metadata = {
  title: 'TrailVerse for Claude — MCP Integration',
  description:
    'Connect Claude to TrailVerse — live NPS data for 470+ sites plus AI trip planning for US destinations beyond the NPS catalog. Alerts, weather, compare, search, and events via MCP.',
  openGraph: {
    title: 'TrailVerse for Claude — MCP Integration',
    description:
      'Trailie in Claude — 470+ NPS sites with live data, plus day-by-day trip planning for US destinations beyond the NPS catalog.',
    url: 'https://www.nationalparksexplorerusa.com/mcp',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse MCP for Claude' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrailVerse for Claude — MCP Integration',
    description:
      'Live NPS data and AI trip planning in Claude — 470+ sites plus state parks, cities, and road trips.',
    images: ['/og-image-trailverse.jpg'],
  },
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/mcp',
  },
};

const tools = INTEGRATION_CAPABILITIES;

const examplePrompts = [
  'Plan a 5-day trip to Yellowstone in September with my fianc\u00e9e',
  'Plan a 3-day Valley of Fire State Park trip for easy hikes and photography',
  'Compare Zion and Grand Canyon for a family trip in June',
  'What national parks are in Washington state?',
  'Are there star parties at Bryce this month?',
  'Plan a San Diego weekend with beach time and a day in Joshua Tree',
];

const MCP_URL = 'https://trailverse-mcp.onrender.com/mcp';


export default function MCPPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main className="info-page">
        {/* Hero */}
        <InfoPageHeader title="TrailVerse for Claude" description={<>
              Connect Claude to live National Park Service data for all 470+ NPS sites &mdash; plus
              day-by-day trip planning for US destinations beyond the NPS catalog.
            </>}>
            <TrackedCtaLink
              channel={DIST_CHANNEL}
              ctaId="hero_install"
              label="Install in Claude"
              href="#install"
              className="inline-flex items-center gap-2 public-action rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
              Install in Claude
            </TrackedCtaLink>
        </InfoPageHeader>

        {/* Five tools for your trip — 5 Tool Cards */}
        <section className="info-section">
          <div className="w-full">
            <div className="mb-8">
              <InfoSectionLabel>Live NPS Data &amp; US Planning</InfoSectionLabel>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Five tools for your trip
              </h2>
              <p className="text-lg max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
                Five MCP tools on the same server as the ChatGPT app. Park details, search, compare,
                and events cover the <strong>NPS catalog</strong>; Plan a trip also works for{' '}
                <strong>state parks, cities, and road trips</strong> using relevant sources when available. Coverage varies, and generated details need checking.
              </p>
            </div>

            <div className="info-card-grid">
              {tools.map((tool) => (
                <div
                  key={tool.title}
                  className="public-editorial-section py-6 space-y-4"
                  style={{
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="info-icon">
                    <IconGlyph name={tool.icon} className="h-6 w-6 text-current" />
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
        <section className="info-section">
          <div className="w-full">
            <div className="mb-8">
              <InfoSectionLabel>See It in Action</InfoSectionLabel>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Example conversations
              </h2>
              <p className="text-lg max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
                These screenshots illustrate earlier conversations, not current park conditions. Dates, closures, weather, and event listings shown here may have changed.
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
            <div className="mt-16">
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

            {/* Search & Park Details */}
            <div className="mt-16">
              <h3
                className="text-xl font-semibold mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                Search &amp; Park Details
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
                    src="/mcp-searchpark.png"
                    alt="Claude listing all 17 NPS sites in Washington state — Mount Rainier, North Cascades, Olympic, and more"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Browse parks by state
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Ask &ldquo;what parks are in Washington state?&rdquo; and browse matching NPS sites &mdash;
                      ranked with insider takes on what makes each one worth visiting.
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
                    src="/mcp-parkdetails.png"
                    alt="Claude pulling live details for Olympic National Park — three ecosystems, 44°F weather, road closures, and fire impacts"
                    className="w-full h-auto"
                  />
                  <div className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Deep dive on any park
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      &ldquo;Tell me more about Olympic&rdquo; pulls live weather, active road closures,
                      fire impacts, and current conditions &mdash; not stale training data.
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
          <div className="w-full">
            <div className="mb-8">
              <InfoSectionLabel>Setup</InfoSectionLabel>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Connect TrailVerse
              </h2>
            </div>

            <p className="mb-6 text-sm text-[var(--text-secondary)]">Setup labels and access can change. <a className="underline" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noopener noreferrer">Claude’s official connector guide</a> has the current instructions. No TrailVerse account or personal API key is required.</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Claude.ai */}
              <div
                className="info-panel"
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
                  Claude web and desktop
                </p>

                <ol className="space-y-4">
                  {[
                    <>Open <strong>Customize</strong> &rarr; <strong>Connectors</strong></>,
                    <>Choose <strong>Add</strong>, then <strong>Add custom connector</strong></>,
                    <>Name: <strong>TrailVerse</strong>, URL: paste from below</>,
                    <>Complete setup, then enable TrailVerse for the conversation. Managed workspaces may require an owner to add it first.</>,
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
                  Claude currently supports remote custom connectors on Free and paid plans; Free is limited to one custom connector. Workspace permissions can restrict access. See the official setup guide above.
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
                <McpConnectorCopyButton
                  mcpUrl={MCP_URL}
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    color: '#fff',
                  }}
                >
                  Copy connector URL
                </McpConnectorCopyButton>
              </div>

              {/* Claude Code */}
              <div
                className="info-panel"
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
                  Tool availability depends on the scope you choose when adding the server and your Claude Code permissions.
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

            <p className="text-left text-sm mt-8" style={{ color: 'var(--text-tertiary)' }}>
              TrailVerse tool usage is rate-limited; your host app’s access rules also apply. Save trips and use the Plan Workspace on{' '}
              <TrackedCtaLink
                channel={DIST_CHANNEL}
                ctaId="install_plan_ai"
                label="TrailVerse.com"
                href="/plan-ai"
                className="underline underline-offset-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                TrailVerse.com
              </TrackedCtaLink>
              . Using ChatGPT instead?{' '}
              <TrackedCtaLink
                channel={DIST_CHANNEL}
                ctaId="cross_link_chatgpt"
                label="Open the TrailVerse ChatGPT app"
                href="/chatgpt"
                className="underline underline-offset-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Open the TrailVerse ChatGPT app
              </TrackedCtaLink>
            </p>
          </div>
        </section>

        {/* Example Prompts */}
        <section className="info-section">
          <div className="w-full">
            <div className="mb-8">
              <InfoSectionLabel>Try It</InfoSectionLabel>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Example Prompts
              </h2>
              <p className="text-lg max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
                Once installed, try asking Claude any of these.
              </p>
            </div>

            <div className="info-card-grid">
              {examplePrompts.map((prompt) => (
                <div
                  key={prompt}
                  className="public-editorial-section py-6 space-y-4"
                  style={{
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
        <IntegrationDetails host="Claude" />

        {/* Footer CTA */}
        <section className="info-section">
          <div className="w-full">
            <div
              className="public-editorial-section py-6 space-y-4"
              style={{
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
                Install TrailVerse in Claude — live NPS data from 470+ sites and trip planning for
                US destinations beyond the NPS catalog.
              </p>
              <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
                Using ChatGPT instead?{' '}
                <TrackedCtaLink
                  channel={DIST_CHANNEL}
                  ctaId="footer_cross_link_chatgpt"
                  label="Open the TrailVerse ChatGPT app"
                  href="/chatgpt"
                  className="underline underline-offset-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Open the TrailVerse ChatGPT app
                </TrackedCtaLink>
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <TrackedCtaLink
                  channel={DIST_CHANNEL}
                  ctaId="footer_install"
                  label="Install Now"
                  href="#install"
                  className="inline-flex items-center gap-2 public-action rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <IconGlyph name="ArrowRight" className="h-4 w-4 text-white" />
                  Install Now
                </TrackedCtaLink>
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
                    boxShadow: 'none',
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
