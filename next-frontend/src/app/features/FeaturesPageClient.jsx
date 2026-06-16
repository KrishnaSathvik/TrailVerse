"use client";
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
      category: 'Check real-time conditions',
      icon: Cloud,
      description: 'See what is actually happening at a park before you drive there.',
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
          benefits: ['Ranger programs', 'Filter by date & park', 'Bookmark on this device', 'Official NPS links'],
        },
      ],
    },
    {
      category: 'Build your itinerary with Trailie',
      icon: Sparkles,
      description: 'Turn a rough trip idea into a practical day-by-day plan with live park context.',
      items: [
        {
          icon: Bot,
          title: 'Smart AI Routing',
          description: 'Trailie picks the best AI for each message — Claude for quick tips, OpenAI for structured itineraries. No toggles required.',
          benefits: ['Automatic provider selection', 'Streaming when signed in', 'Context-aware follow-ups', 'Trip history when signed in'],
        },
        {
          icon: Route,
          title: 'Intelligent Itinerary Generation',
          description: 'AI builds day-by-day plans from your dates, budget, group size, fitness level, and interests.',
          benefits: ['Personalized preferences', 'Budget & fitness matching', 'Day-by-day structure', 'Seasonal awareness'],
        },
        {
          icon: Mountain,
          title: 'Live NPS Data in AI Responses',
          description: 'Trailie weaves closures, events, and permit notes into your chat answers — so plans reflect what is open now.',
          benefits: ['Closure-aware answers', 'Event suggestions', 'Campground context', 'Visitor center hours'],
        },
        {
          icon: ArchiveRestore,
          title: 'Chat History & Archives',
          description: 'Signed-in trips auto-save to chat history so you can resume, refine, or archive finished plans.',
          benefits: ['Auto-save when signed in', 'Archive & restore', 'Full context preserved', 'Organized by trip'],
        },
        {
          icon: Microphone,
          title: 'Talk to Trailie (Voice)',
          description: 'Hands-free voice planning on most pages. Ask about weather, alerts, park picks, or comparisons — Trailie uses live NPS tools while you browse.',
          benefits: ['Hands-free on site', 'Park details & search', 'Compare & events tools', '3 free sessions, then sign up'],
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
          description: 'Open the plan workspace to turn AI day-by-day output into a visual timeline. Reorder stops, add custom activities, and edit details.',
          benefits: ['Visual day timeline', 'Drag to reorder', 'Add custom stops', 'Edit descriptions'],
        },
        {
          icon: Download,
          title: 'PDF Export',
          description: 'Export a saved itinerary as a clean, printable PDF for offline reference on the road (signed-in trips).',
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
          title: 'Offline-Ready PWA',
          description: 'Install TrailVerse as a PWA for app-like access. Cached pages and saved account data help when signal is spotty.',
          benefits: ['Install on device', 'Offline-friendly caching', 'Saved account sync', 'App-like experience'],
        },
      ],
    },
  ];

  const alsoAvailable = [
    {
      icon: MessageSquare,
      title: 'TrailVerse for ChatGPT',
      description: 'Use Trailie inside ChatGPT — plan trips, compare parks, check live weather and alerts, search parks, and find ranger programs across 470+ NPS sites.',
      href: '/chatgpt',
      cta: 'Install ChatGPT app',
      benefits: ['5 MCP tools', 'Multi-turn planning', 'Live NPS data', 'No TrailVerse account required'],
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
    {
      icon: Sparkles,
      title: "Smart AI + Live Data",
      description: "Trailie auto-routes each message to Claude or OpenAI based on what you're asking. Both are enriched with real-time NPS data \u2014 not just training data.",
      comparison: "Other apps: single AI, static data. TrailVerse: smart routing, live NPS."
    },
    {
      icon: GripVertical,
      title: "Plan to Itinerary Pipeline",
      description: "Go from AI chat to the plan workspace, then PDF export — without copying between separate apps.",
      comparison: "Other apps: chat only. TrailVerse: chat + workspace + export."
    },
    {
      icon: Mountain,
      title: "National Parks Specialist",
      description: "Deep coverage across 470+ NPS parks and sites with park-specific weather, alerts, events, and reviews. Not a generic travel app.",
      comparison: "General apps: broad coverage. TrailVerse: deep park expertise."
    },
    {
      icon: MessageCircle,
      title: "Persistent Conversations",
      description: "Signed-in trips auto-save to chat history. Come back days later and continue where you left off — full context preserved.",
      comparison: "Other apps: one-time chats. TrailVerse: resumable trip history."
    }
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden py-8 sm:py-12">
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 mb-4 sm:mb-6"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" style={{ color: 'var(--text-secondary)' }} />
            <span className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              How TrailVerse helps you plan
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Plan national park trips
            <span className="block" style={{ color: 'var(--accent-green)' }}>
              without juggling a dozen tabs
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            TrailVerse covers 470+ NPS parks and sites — research, live conditions, and Trailie trip planning in one place.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-12 sm:space-y-16">
            {outcomeSections.map((category, categoryIndex) => (
              <div key={categoryIndex} className="text-center">
                <div className="mb-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                    style={{ backgroundColor: 'rgba(67, 160, 106, 0.1)' }}
                  >
                    <category.icon className="h-8 w-8" style={{ color: 'var(--accent-green)' }} />
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                    {category.category}
                  </h2>
                  <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    {category.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="group">
                      <div className="rounded-2xl p-6 sm:p-8 transition-all duration-200 h-full flex flex-col items-center text-center"
                        style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                          style={{ backgroundColor: 'rgba(67, 160, 106, 0.1)' }}
                        >
                          <item.icon className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                        </div>

                        <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                          {item.title}
                        </h3>

                        <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {item.description}
                        </p>

                        <div className="flex flex-col items-center">
                          <ul className="space-y-2">
                            {item.benefits.map((benefit, benefitIndex) => (
                              <li key={benefitIndex} className="flex items-center gap-2 text-sm"
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
      <section className="py-8 sm:py-12" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Also Available Outside the Website
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              The same live park tools power Trailie in ChatGPT and Claude — handy when you already live in those apps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {alsoAvailable.map((item) => (
              <div
                key={item.href}
                className="rounded-2xl p-6 sm:p-8 flex flex-col h-full"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                  style={{ backgroundColor: 'rgba(67, 160, 106, 0.1)' }}
                >
                  <item.icon className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                </div>

                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  {item.title}
                </h3>

                <p className="mb-4 text-sm leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {item.description}
                </p>

                <ul className="space-y-2 mb-6">
                  {item.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
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
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Why TrailVerse Stands Out
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Built by a traveler who visited 17+ parks — not a generic travel aggregator
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {competitiveAdvantages.map((advantage, index) => (
              <div key={index} className="rounded-2xl p-6 sm:p-8"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                    style={{ backgroundColor: 'rgba(67, 160, 106, 0.1)' }}
                  >
                    <advantage.icon className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
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
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12 text-center"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Ready to plan your next trip?
            </h2>
            <p className="text-base mb-8 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Start with Trailie or explore the park directory. Free account, no credit card.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
    </>
  );
};

export default FeaturesPage;
