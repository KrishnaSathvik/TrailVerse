import Image from 'next/image';
import IntegrationDetails from '@/components/info/IntegrationDetails';
import { INTEGRATION_CAPABILITIES } from '@/data/integrationCapabilities';
import InfoPageHeader, { InfoSectionLabel } from '@/components/info/InfoPageHeader';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';
import { TrackedCtaLink, TrackedOutboundLink } from '@/components/distribution/DistributionTrackedLink';

const DIST_CHANNEL = 'chatgpt';

export const metadata = {
  title: 'TrailVerse for ChatGPT — Trailie NPS Trip Planner',
  description:
    'Install the TrailVerse ChatGPT app — live NPS data for 470+ sites plus AI trip planning for US destinations beyond the NPS catalog. Alerts, weather, compare, search, and events. No TrailVerse account required.',
  openGraph: {
    title: 'TrailVerse for ChatGPT — Trailie NPS Trip Planner',
    description:
      'Trailie in ChatGPT — 470+ NPS sites with live data, plus day-by-day trip planning for US destinations beyond the NPS catalog.',
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

const CHATGPT_PLUGIN_DIRECTORY = 'https://chatgpt.com/plugins';
/** Published app page — OpenAI dashboard → View in Directory */
const CHATGPT_APP_URL =
  process.env.NEXT_PUBLIC_CHATGPT_APP_URL ||
  'https://chatgpt.com/plugins/plugin_asdk_app_69e9c67943c08191a37c464b803ebdbe';

const tools = INTEGRATION_CAPABILITIES;

const examplePrompts = [
  'Plan a 5-day trip to Yellowstone in September with my fianc\u00e9e',
  'Is Going-to-the-Sun Road open right now?',
  'Compare Zion and Grand Canyon for a family trip in June',
  'What national parks are in Washington state?',
  'Are there star parties at Bryce this month?',
  'Plan a 3-day photography road trip through Utah\u2019s parks',
];


export default function ChatGPTPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main className="info-page">
        <InfoPageHeader eyebrow="Integrations" icon="Globe" iconColor="var(--icon-discovery)" title="TrailVerse for ChatGPT" description={<>
              Live data for <strong className="font-semibold text-[var(--text-primary)]">470+ NPS parks and sites</strong> inside ChatGPT
              with <strong className="font-semibold text-[var(--text-primary)]">Trailie</strong> — plus day-by-day trip planning for{' '}
              <strong className="font-semibold text-[var(--text-primary)]">US destinations beyond the NPS catalog</strong>, including state parks, cities,
              and road trips.
            </>}>
            <TrackedOutboundLink
              channel={DIST_CHANNEL}
              ctaId="hero_start_chat"
              label="Open in ChatGPT"
              href={CHATGPT_APP_URL}
              className="public-action public-action-secondary gap-2 px-6 text-sm font-semibold"
            >
              <Image src="/brand/chatgpt.png" alt="" width={24} height={24} className="rounded bg-white p-0.5" />
              Open in ChatGPT
            </TrackedOutboundLink>
        </InfoPageHeader>

        <section className="info-section">
          <div className="w-full">
            <div className="mb-8">
              <InfoSectionLabel>Current NPS Data</InfoSectionLabel>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Five tools for your trip
              </h2>
              <p className="text-lg public-content" style={{ color: 'var(--text-secondary)' }}>
                Ask for park information or a trip plan, then refine your dates, pace, or interests. Tool results can use current sources when available; generated answers still need checking before you travel.
              </p>
            </div>

            <div className="info-card-grid">
              {tools.map((tool) => (
                <div
                  key={tool.title}
                  className="info-panel space-y-4"
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

        <section id="install" className="info-section scroll-mt-20">
          <div className="public-content">
            <div className="mb-8">
              <InfoSectionLabel>Setup</InfoSectionLabel>
              <h2
                className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Get Started in ChatGPT
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                No API keys or connectors to configure &mdash; install the app and start asking.
              </p>
            </div>

            <div
              className="info-panel"
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
                  <>Choose <strong>Install plugin</strong> on the listing, then start a chat</>,
                  <>
                    Ask for a trip plan, park details, a comparison, or upcoming ranger events
                  </>,
                  <>
                    Want saved trips or the full website experience? Continue on{' '}
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
                Requires a ChatGPT account with app access. Availability can depend on your plan, region, or workspace settings. Website trip history and the plan workspace are separate.
              </p>

              <TrackedOutboundLink
                channel={DIST_CHANNEL}
                ctaId="install_start_chat"
                label="Open in ChatGPT"
                href={CHATGPT_APP_URL}
                className="mt-6 public-action public-action-secondary gap-2 px-6 text-sm font-semibold"
              >
                <IconGlyph name="ArrowRight" className="h-4 w-4" />
                Open in ChatGPT
              </TrackedOutboundLink>

              <p className="mt-4 text-sm"><a href="https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt" className="underline" target="_blank" rel="noopener noreferrer">ChatGPT app access and data settings</a></p>
              <p className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Can&rsquo;t open the listing? Browse{' '}
                <TrackedOutboundLink
                  channel={DIST_CHANNEL}
                  ctaId="apps_directory_fallback"
                  label="ChatGPT plugins"
                  href={CHATGPT_PLUGIN_DIRECTORY}
                  className="underline underline-offset-2"
                >
                  ChatGPT plugins
                </TrackedOutboundLink>{' '}
                and search <strong>TrailVerse</strong>, or type <strong>@TrailVerse</strong> in a new chat.
              </p>
            </div>

            <p className="text-left text-sm mt-8" style={{ color: 'var(--text-tertiary)' }}>
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
              <p className="text-lg public-content" style={{ color: 'var(--text-secondary)' }}>
                Once the app is open, try asking ChatGPT any of these.
              </p>
            </div>

            <div className="info-card-grid">
              {examplePrompts.map((prompt) => (
                <div
                  key={prompt}
                  className="info-panel space-y-4"
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

        <IntegrationDetails host="ChatGPT" />

        <section className="info-section">
          <div className="w-full">
            <div
              className="info-panel space-y-4"
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
                Open TrailVerse in ChatGPT — live NPS data from 470+ sites and trip planning for
                US destinations beyond the NPS catalog.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <TrackedOutboundLink
                  channel={DIST_CHANNEL}
                  ctaId="footer_start_chat"
                  label="Open in ChatGPT"
                  href={CHATGPT_APP_URL}
                  className="public-action public-action-secondary gap-2 px-6 text-sm font-semibold"
                >
                  <IconGlyph name="ArrowRight" className="h-4 w-4" />
                  Open in ChatGPT
                </TrackedOutboundLink>
                <TrackedCtaLink
                  channel={DIST_CHANNEL}
                  ctaId="footer_explore_parks"
                  label="Explore Parks"
                  href="/explore"
                  className="public-action public-action-secondary px-6 text-sm font-semibold"
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
