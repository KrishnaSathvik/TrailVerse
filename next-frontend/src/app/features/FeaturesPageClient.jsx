"use client";
import InfoPageHeader from '@/components/info/InfoPageHeader';

import Link from 'next/link';
import {
  Sparkles, Compass, MapPin, Calendar, Heart, BookOpen, Route,
  Star, Shield, Users, MessageCircle, MessageSquare, ArchiveRestore,
  CheckCircle, Bot, Mountain, Globe, Zap, Cloud, Sun, Moon,
  Sunrise, Sunset, Thermometer, ArrowsLeftRight, ExternalLink, Download,
  Share2, GripVertical, Edit2, Microphone, ArrowRight
} from '@components/icons';

const FeaturesPage = () => {
  const outcomeSections = [
    {
      category: 'Choose the right park',
      icon: Compass,
      description: 'Search and filter on Explore, browse by activity on Explore by Activity, then compare finalists before you book.',
      items: [
        {
          icon: MapPin,
          title: 'Park Explorer with Filters',
          description: 'Search the full NPS catalog on Explore with state filters and a National Parks toggle. Every park page pulls together photos, weather, alerts, and reviews.',
          benefits: ['State & search filters', 'Rich park pages', 'Browse by topic', 'Activity browse hub'],
        },
        {
          icon: Globe,
          title: 'Interactive Map',
          description: 'See parks, campgrounds, and places on one map. Click any marker for a preview or open the full park page.',
          benefits: ['Nationwide markers', 'Park name search', 'Campground & place layers', 'Park detail links'],
        },
        {
          icon: ArrowsLeftRight,
          title: 'Park Comparison Tool',
          description: 'Compare up to four parks side by side on fees, crowds, weather, parking, and activities.',
          benefits: ['Up to 4 parks', 'Side-by-side metrics', 'Popular matchups', 'Decision support'],
        },
      ],
    },
    {
      category: 'Check available conditions',
      icon: Cloud,
      description: 'Check available forecasts and official alerts, then confirm critical details with the park before leaving.',
      items: [
        {
          icon: Cloud,
          title: 'Real-Time Weather & Alerts',
          description: 'Current conditions and 5-day forecasts from OpenWeather, plus official NPS alerts for closures, safety warnings, and conditions.',
          benefits: ['Current conditions', '5-day forecasts', 'NPS alerts', 'Safety warnings'],
        },
        {
          icon: Calendar,
          title: 'Live NPS Events',
          description: 'Browse ranger programs, tours, and special events pulled from National Park Service data.',
          benefits: ['Ranger programs', 'Month & category filters', 'Bookmark on this device', 'Official NPS links'],
        },
      ],
    },
    {
      category: 'Build your itinerary with Trailie',
      icon: Sparkles,
      description: 'Turn a rough trip idea into a practical day-by-day plan. Guests get 5 completed Trailie messages in a 48-hour window for NPS catalog trips. Sign in for saved history, relevant web search, and broader outdoor planning.',
      items: [
        {
          icon: Bot,
          title: 'One Trailie assistant',
          description: 'One Trailie assistant for every message — quick tips and structured day-by-day itineraries alike. No model toggles required.',
          benefits: ['5 guest messages / 48 hours', 'No model selection needed', 'Streaming when signed in', 'Trip history when signed in'],
        },
        {
          icon: Route,
          title: 'Trailie day-by-day itineraries',
          description: 'Trailie builds day-by-day plans from your dates, budget, group size, fitness level, and interests — NPS catalog as a guest, broader outdoor destinations when signed in.',
          benefits: ['Personalized preferences', 'Budget & fitness matching', 'Day-by-day structure', 'State parks when signed in'],
        },
        {
          icon: Mountain,
          title: 'Live NPS data in Trailie',
          description: 'Trailie weaves closures, events, and permit notes into chat — catalog data for all guests; signed-in users also get live web search for state parks and current local conditions.',
          benefits: ['Closure-aware answers', 'Live web search (signed in)', 'State-park planning (signed in)', 'Visitor center hours'],
        },
        {
          icon: ArchiveRestore,
          title: 'Chat History & Archives',
          description: 'Signed-in trips auto-save to chat history so you can resume, refine, or archive finished plans.',
          benefits: ['Auto-save when signed in', 'Archive & restore', 'Saved conversation history', 'Organized by trip'],
        },
        {
          icon: Microphone,
          title: 'Talk to Trailie (Voice)',
          description: 'Hands-free voice planning on most pages. Ask about weather, alerts, park picks, or comparisons — Trailie uses live NPS tools while you browse.',
          benefits: ['Hands-free on site', 'Park details & search', 'Compare & events tools', '3 guest sessions / 24 hours'],
        },
      ],
    },
    {
      category: 'Save, export, and share',
      icon: Download,
      description: 'Keep your plan usable offline and easy to share with travel companions.',
      items: [
        {
          icon: GripVertical,
          title: 'Drag-and-Drop Itinerary Builder',
          description: 'Open the plan workspace to turn Trailie day-by-day output into a visual timeline. Reorder stops, add custom activities, and edit details.',
          benefits: ['Visual day timeline', 'Drag to reorder', 'Add custom stops', 'Edit descriptions'],
        },
        {
          icon: Download,
          title: 'PDF Export',
          description: 'Download a generated itinerary as a printable PDF for offline reference on the road.',
          benefits: ['Print-ready format', 'Day-by-day layout', 'Offline reference', 'One-click export'],
        },
        {
          icon: Share2,
          title: 'Trip Sharing',
          description: 'Generate a public share link from a saved trip so friends can view your plan without signing in.',
          benefits: ['Public share URLs', 'No login to view', 'Itinerary & chat visible', 'Account required to share'],
        },
      ],
    },
    {
      category: 'Track your park journey',
      icon: Heart,
      description: 'Save favorites, log visits, and learn from real traveler reviews.',
      items: [
        {
          icon: Heart,
          title: 'Favorites & Collections',
          description: 'Save parks and blog posts to your profile. Bookmark events on the Events page for quick access on this device.',
          benefits: ['Favorite parks', 'Saved blog posts', 'Visited parks tracker', 'Organized profile'],
        },
        {
          icon: CheckCircle,
          title: 'Visited Parks Tracker',
          description: 'Mark parks visited with dates and notes to build your personal park passport.',
          benefits: ['Mark parks visited', 'Add visit dates', 'Memory notes', 'Progress tracking'],
        },
        {
          icon: Star,
          title: 'Photo Reviews & Guides',
          description: 'Read and write park reviews with photos, plus browse expert guides and blog categories.',
          benefits: ['Photo reviews', 'Star ratings', 'Travel guides', 'Community tips'],
        },
        {
          icon: Globe,
          title: 'Installable Web App',
          description: 'Install TrailVerse for app-like access. Some assets and park data may be cached, but chat, account requests, and current conditions need a connection. Download your itinerary before traveling.',
          benefits: ['Install on device', 'Limited local caching', 'Online account features', 'App-like experience'],
        },
      ],
    },
  ];

  const alsoAvailable = [
    {
      icon: MessageSquare,
      title: 'TrailVerse for ChatGPT',
      description: 'Use five tools inside ChatGPT to plan trips, find NPS sites and events, compare parks, and check available conditions. Planning can use relevant web evidence beyond the NPS catalog. No TrailVerse account is required.',
      href: '/chatgpt',
      cta: 'Install ChatGPT app',
      benefits: ['5 MCP tools (NPS-focused)', 'Multi-turn planning', 'Live NPS catalog data', 'Broader planning when evidence is available'],
    },
    {
      icon: Bot,
      title: 'TrailVerse MCP for Claude',
      description: 'Connect Claude Desktop or claude.ai to the same live park data via our MCP server — plan trips, compare parks, and pull real-time conditions without leaving Claude.',
      href: '/mcp',
      cta: 'Connect in Claude',
      benefits: ['Custom MCP connector', 'Same 5 tools as ChatGPT', 'Live weather & alerts', 'Developer-friendly setup'],
    },
  ];

  const competitiveAdvantages = [
    { icon: Cloud, title: 'Conditions can change', description: 'Forecasts, closures, fees, and schedules depend on the source and its update time. Crowd guidance is not a live visitor count.', comparison: 'Confirm critical details with official park sources.' },
    { icon: GripVertical, title: 'Take a copy with you', description: 'Use the workspace to refine your itinerary and download a PDF before losing reception. Installing the app does not make every feature available offline.', comparison: 'Chat and current conditions need internet access.' },
    { icon: Share2, title: 'Share deliberately', description: 'A public trip link lets anyone with the link view the shared itinerary and conversation. Check the content before sending it.', comparison: 'Keep sensitive information out of shared trips.' },
    { icon: MessageCircle, title: 'Choose where to plan', description: 'Website guest chat, signed-in planning, voice, and connected apps have different access and usage limits. External chats do not automatically sync to website history.', comparison: 'Use a website account for saved trips and the workspace.' },
  ];

  return (
    <main className="info-page">
      <InfoPageHeader title="Plan national park trips without juggling a dozen tabs" description={<>
            TrailVerse covers 470+ NPS parks and sites — research, live conditions, and Trailie in one place.
            Browse without an account; sign in for saved trips, relevant web search, and broader outdoor planning.
          </>}>
        <div className="info-note">            <strong style={{ color: 'var(--text-primary)' }}>Trailie on the website:</strong>{' '}
            Guests get 5 completed messages in a 48-hour window for NPS catalog planning. A free account unlocks
            chat, saved trips, live web search, and state-park itineraries.</div>
      </InfoPageHeader>

      {/* Features Grid */}
      <section className="info-section">
        <div className="w-full">
          <div className="space-y-12 sm:space-y-16">
            {outcomeSections.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <div className="mb-12">
                  <div className="info-icon">
                    <category.icon className="h-8 w-8"  />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                    {category.category}
                  </h2>
                  <p className="text-lg max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
                    {category.description}
                  </p>
                </div>

                <div className="info-card-grid">
                  {category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="group">
                      <div className="public-editorial-section py-6 h-full"
                        style={{
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div className="info-icon">
                          <item.icon className="h-6 w-6"  />
                        </div>

                        <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                          {item.title}
                        </h3>

                        <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {item.description}
                        </p>

                        <div className="flex flex-col items-start">
                          <ul className="space-y-2">
                            {item.benefits.map((benefit, benefitIndex) => (
                              <li key={benefitIndex} className="flex items-start gap-2 text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                <CheckCircle className="h-4 w-4 flex-shrink-0"
                                  style={{ color: 'var(--accent-green)' }}
                                />
                                <span>{benefit}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Also Available — ChatGPT & Claude */}
      <section className="info-section" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="w-full">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              Also Available Outside the Website
            </h2>
            <p className="text-lg max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              The same NPS-focused Trailie tools power ChatGPT and Claude — handy when you already live in those apps.
              Connected-app planning can also use relevant web evidence. Website account history and the editable workspace are separate.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            {alsoAvailable.map((item) => (
              <div
                key={item.href}
                className="public-editorial-section py-6 h-full"
                style={{
                  borderColor: 'var(--border)',
                }}
              >
                <div className="info-icon">
                  <item.icon className="h-6 w-6"  />
                </div>

                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  {item.title}
                </h3>

                <p className="mb-4 text-sm leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {item.description}
                </p>

                <ul className="space-y-2 mb-6">
                  {item.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <CheckCircle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={item.href}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition"
                  style={{
                    backgroundColor: 'var(--accent-green)',
                    color: 'white',
                  }}
                >
                  {item.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competitive Advantages */}
      <section className="info-section">
        <div className="w-full">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              Know before you plan
            </h2>
            <p className="text-lg max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Useful planning tools, with clear limits on data, access, and sharing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
            {competitiveAdvantages.map((advantage, index) => (
              <div key={index} className="info-panel"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="info-icon">
                    <advantage.icon className="h-6 w-6"  />
                  </div>

                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                      {advantage.title}
                    </h3>
                    <p className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {advantage.description}
                    </p>
                    <div className="text-sm font-medium"
                      style={{ color: 'var(--accent-green)' }}
                    >
                      {advantage.comparison}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="info-section">
        <div className="w-full">
          <div className="info-panel"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Ready to plan your next trip?
            </h2>
            <p className="text-base mb-8 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Start with Trailie or explore the park directory. Free account, no credit card.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="/plan-ai"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition"
                style={{ backgroundColor: 'var(--accent-green)' }}
              >
                <Sparkles className="h-4 w-4" />
                Try Trailie
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <Compass className="h-4 w-4" />
                Explore Parks
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default FeaturesPage;
