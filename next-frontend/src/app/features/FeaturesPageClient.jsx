"use client";
import Link from 'next/link';
import {
  Sparkles, Compass, MapPin, Calendar, Heart, BookOpen, Route,
  Star, Shield, Users, MessageCircle, MessageSquare, ArchiveRestore,
  CheckCircle, Bot, Mountain, Globe, Zap, Cloud, Sun, Moon,
  Sunrise, Sunset, Thermometer, Eye, ExternalLink, Download,
  Share2, GripVertical, Edit2
} from '@components/icons';

const FeaturesPage = () => {
  const features = [
    {
      category: "AI Trip Planning",
      icon: Sparkles,
      description: "Plan smarter with dual AI providers, live park data, and persistent conversations",
      items: [
        {
          icon: Bot,
          title: "Dual AI Chat — Claude Sonnet 4.6 & GPT-4.1",
          description: "Switch between Anthropic Claude Sonnet 4.6 and OpenAI GPT-4.1 mid-conversation. Each provider brings a different style — use both to get the best plan.",
          benefits: ["Switch providers anytime", "Streaming responses", "Context-aware follow-ups", "Persistent chat history"]
        },
        {
          icon: Route,
          title: "Intelligent Itinerary Generation",
          description: "AI builds day-by-day itineraries based on your dates, budget, group size, fitness level, and interests. Plans include timing, directions, and lodging.",
          benefits: ["Personalized to your preferences", "Budget & fitness matching", "Day-by-day structure", "Seasonal awareness"]
        },
        {
          icon: Mountain,
          title: "Live NPS Data in AI Responses",
          description: "AI responses are enriched with real-time data from the National Park Service — alerts, closures, events, and conditions pulled directly from NPS APIs.",
          benefits: ["Real-time park alerts", "Active closures & cautions", "Campground status", "Visitor center hours"]
        },
        {
          icon: ArchiveRestore,
          title: "Chat History & Archives",
          description: "Every conversation auto-saves. Resume any trip plan, archive finished ones, and restore them with full context preserved.",
          benefits: ["Auto-save conversations", "Archive & restore", "Full context preserved", "Organized by trip"]
        }
      ]
    },
    {
      category: "Itinerary Builder & Export",
      icon: Calendar,
      description: "Turn AI plans into visual, shareable, exportable itineraries",
      items: [
        {
          icon: GripVertical,
          title: "Drag-and-Drop Itinerary Builder",
          description: "Your AI-generated plan converts into a visual timeline. Drag stops between days, reorder activities, add custom stops, and edit details.",
          benefits: ["Visual day timeline", "Drag to reorder", "Add custom stops", "Edit descriptions"]
        },
        {
          icon: Download,
          title: "PDF Export",
          description: "Export any trip plan as a clean, printable PDF. Includes day-by-day itinerary, stop details, and trip metadata — perfect for offline use.",
          benefits: ["Print-ready format", "Day-by-day layout", "Offline reference", "One-click export"]
        },
        {
          icon: Share2,
          title: "Trip Sharing",
          description: "Generate a public share link for any saved trip. Friends and travel companions can view your full plan — read-only, no account needed.",
          benefits: ["Public share URLs", "No login required to view", "Full plan visible", "Social media ready"]
        }
      ]
    },
    {
      category: "Explore & Discover",
      icon: Compass,
      description: "Browse 470+ parks with maps, weather, alerts, and comparison tools",
      items: [
        {
          icon: MapPin,
          title: "Park Explorer with Filters",
          description: "Browse all 470+ NPS units. Filter by state, activities, and amenities. Each park page includes details, photos, weather, events, and reviews.",
          benefits: ["470+ destinations", "Advanced filtering", "Rich park pages", "Activity-based search"]
        },
        {
          icon: Globe,
          title: "Interactive Map & Park Explorer",
          description: "Interactive map of all 470+ parks with search and filtering. Click any park to see details, alerts, weather, and plan your visit with the AI trip planner.",
          benefits: ["470+ park markers", "Search & filter parks", "Click for park details", "Directions via Google Maps"]
        },
        {
          icon: Cloud,
          title: "Real-Time Weather & Alerts",
          description: "Current conditions and 5-day forecasts from OpenWeather. Plus official NPS alerts about road closures, safety warnings, and park conditions.",
          benefits: ["Current conditions", "5-day forecasts", "NPS alerts", "Safety warnings"]
        },
        {
          icon: Eye,
          title: "Park Comparison Tool",
          description: "Compare up to 4 parks side-by-side. See activities, weather, ratings, and features in a single view to pick the right destination.",
          benefits: ["Up to 4 parks", "Side-by-side metrics", "Feature highlights", "Decision support"]
        }
      ]
    },
    {
      category: "Your Personal Journey",
      icon: Heart,
      description: "Track visits, save favorites, and build your National Park record",
      items: [
        {
          icon: Heart,
          title: "Favorites & Collections",
          description: "Save parks, blog articles, and NPS events to your favorites. Everything you save lives in one organized collection on your profile.",
          benefits: ["Favorite parks", "Save events locally", "Visited parks tracker", "Organized profile"]
        },
        {
          icon: CheckCircle,
          title: "Visited Parks Tracker",
          description: "Mark parks as visited with dates and memories. Build your personal National Park passport and track your adventure progress.",
          benefits: ["Mark parks visited", "Add visit dates", "Memory notes", "Progress tracking"]
        },
        {
          icon: Users,
          title: "Profile & Avatar System",
          description: "Choose from 1,000+ auto-generated avatars or upload your own photo. Your profile tracks reviews, favorites, visited parks, and trip history.",
          benefits: ["1000+ avatar combos", "Photo upload", "Review history", "Contribution stats"]
        }
      ]
    },
    {
      category: "Blog & Community",
      icon: BookOpen,
      description: "Expert guides, community reviews, and real traveler insights",
      items: [
        {
          icon: BookOpen,
          title: "Blog with Categories & Authors",
          description: "In-depth park guides, hiking tips, photography advice, and travel planning. Browse by category, read author bios, and engage with comments.",
          benefits: ["Category browsing", "Author bio cards", "Rich text articles", "Markdown import"]
        },
        {
          icon: Star,
          title: "Photo Reviews",
          description: "Write reviews with up to 5 photos per park. Read authentic experiences from real visitors to help plan your own trips.",
          benefits: ["Up to 5 photos", "Star ratings", "Authentic feedback", "Community-driven"]
        },
        {
          icon: MessageSquare,
          title: "Comments & Discussions",
          description: "Comment on blog posts, like comments, and share testimonials. Join the community discussion around park guides and travel tips.",
          benefits: ["Blog comments", "Like comments", "Testimonials", "Community engagement"]
        }
      ]
    },
    {
      category: "Platform & Performance",
      icon: Zap,
      description: "Fast, reliable, secure, and works offline",
      items: [
        {
          icon: Globe,
          title: "Offline-Ready PWA",
          description: "Install TrailVerse on your device. Access cached park data, saved trips, and favorites even without cell service in the park.",
          benefits: ["Install on device", "Offline access", "Cached content", "App-like experience"]
        },
        {
          icon: Zap,
          title: "Real-Time Sync",
          description: "Favorites, reviews, and trip plans sync instantly across all devices. Start on desktop, continue on mobile.",
          benefits: ["Multi-device sync", "Instant updates", "Cross-platform", "Seamless"]
        },
        {
          icon: Shield,
          title: "Secure & Fast",
          description: "Encrypted authentication, bcrypt passwords, HTTPS everywhere. Smart caching for lightning-fast loading on every page.",
          benefits: ["Encrypted auth", "Fast loading", "Privacy controls", "Protected data"]
        }
      ]
    },
  ];

  const competitiveAdvantages = [
    {
      icon: Sparkles,
      title: "Dual AI + Live Data",
      description: "Choose between Claude and GPT-4, mid-conversation. Both are enriched with real-time NPS data — not just training data.",
      comparison: "Other apps: single AI, static data. TrailVerse: dual AI, live NPS."
    },
    {
      icon: GripVertical,
      title: "Plan to Itinerary Pipeline",
      description: "Go from AI chat to drag-and-drop itinerary to PDF export in one flow. No copy-pasting between apps.",
      comparison: "Other apps: chat only. TrailVerse: chat + builder + export."
    },
    {
      icon: Mountain,
      title: "National Parks Specialist",
      description: "Deep coverage of all 470+ NPS units with park-specific weather, alerts, events, and reviews. Not a generic travel app.",
      comparison: "General apps: broad coverage. TrailVerse: deep park expertise."
    },
    {
      icon: MessageCircle,
      title: "Persistent Conversations",
      description: "Every AI conversation auto-saves. Come back days later and continue exactly where you left off — full context preserved.",
      comparison: "Other apps: one-time chats. TrailVerse: evolving conversations."
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
              Complete Feature Set
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Everything You Need for
            <span className="block" style={{ color: 'var(--accent-green)' }}>
              National Park Adventures
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            AI trip planning with Claude & GPT-4, drag-and-drop itinerary builder, PDF export, interactive maps, real-time weather, and community reviews — all in one platform for 470+ parks.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-12 sm:space-y-16">
            {features.map((category, categoryIndex) => (
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

      {/* Competitive Advantages */}
      <section className="py-8 sm:py-12" style={{ backgroundColor: 'var(--surface)' }}>
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
              Start with the AI trip planner or browse 470+ parks. Free account, no credit card.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/plan-ai"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition"
                style={{ backgroundColor: 'var(--accent-green)' }}
              >
                <Sparkles className="h-4 w-4" />
                Try the AI Trip Planner
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
