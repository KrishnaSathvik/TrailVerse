import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import { useTheme } from '../context/ThemeContext';
import { 
  Sparkles, Compass, MapPin, Calendar, Heart, BookOpen, Route,
  Star, Shield, Users, MessageCircle, MessageSquare, ArchiveRestore,
  CheckCircle, Bot, Mountain, Globe, Zap, Cloud, Sun, Moon, 
  Sunrise, Sunset, Thermometer, Eye, Cookie
} from '@components/icons';

const FeaturesPage = () => {
  const navigate = useNavigate();
  useTheme();

  const features = [
    {
      category: "AI-Powered Trip Planning",
      icon: Sparkles,
      description: "Revolutionary AI assistance for your National Park adventures",
      items: [
        {
          icon: Bot,
          title: "Smart AI Chat Assistant",
          description: "Get personalized recommendations from Claude or ChatGPT. Ask questions about trails, weather, accommodations, and more.",
          benefits: ["Real-time conversation", "Multiple AI providers", "Context-aware responses", "Persistent chat history"]
        },
        {
          icon: Route,
          title: "Intelligent Itinerary Planning",
          description: "AI creates custom itineraries based on your preferences, group size, budget, and fitness level.",
          benefits: ["Personalized recommendations", "Budget optimization", "Fitness level matching", "Group size consideration"]
        },
        {
          icon: ArchiveRestore,
          title: "Conversation History & Archives",
          description: "All your AI conversations are automatically saved. Archive completed trips and restore them anytime with full context.",
          benefits: ["Auto-save conversations", "Archive & restore trips", "Trip history", "Seamless continuation"]
        }
      ]
    },
    {
      category: "Explore & Discover",
      icon: Mountain,
      description: "Find your perfect National Park with powerful search and real-time information",
      items: [
        {
          icon: MapPin,
          title: "Interactive Park Explorer",
          description: "Browse 470+ National Parks, Monuments, and Historic Sites with advanced filtering by state, activities, and amenities. Available on all devices.",
          benefits: ["470+ destinations", "Advanced filtering", "Activity-based search", "Mobile-friendly"]
        },
        {
          icon: Globe,
          title: "Interactive Maps with Markers",
          description: "View all parks on Google Maps with clickable markers. Search parks, zoom in on locations, and get park details instantly.",
          benefits: ["Google Maps integration", "Park markers & search", "Click for details", "Works on all devices"]
        },
        {
          icon: Route,
          title: "Nearby Places & Directions",
          description: "Find nearby restaurants, lodging, gas stations with Google Places. Plan routes and get turn-by-turn directions between parks.",
          benefits: ["Nearby places search", "Route planning", "Turn-by-turn directions", "Distance calculations"],
          badge: "Desktop Only"
        },
        {
          icon: Cloud,
          title: "Weather & Park Alerts",
          description: "Real-time weather conditions, 5-day forecasts, and official NPS alerts about road closures, safety warnings, and park conditions.",
          benefits: ["Current weather", "5-day forecasts", "Park alerts", "Safety warnings"]
        },
        {
          icon: Compass,
          title: "Park Comparison Tool",
          description: "Compare up to 4 parks side-by-side with detailed metrics to find the perfect destination for your trip.",
          benefits: ["Side-by-side comparison", "Up to 4 parks", "Feature highlighting", "Decision support"]
        },
        {
          icon: Mountain,
          title: "Detailed Activity Information",
          description: "Explore comprehensive details about activities at each park. Click any activity from park details to learn more about hiking, camping, wildlife viewing, and more.",
          benefits: ["Activity deep-dives", "Trail information", "What to expect", "Preparation tips"]
        }
      ]
    },
    {
      category: "Your Personal Journey",
      icon: Calendar,
      description: "Track and organize your National Park adventures",
      items: [
        {
          icon: Heart,
          title: "Favorites & Collections",
          description: "Save parks, blogs, and events to your favorites. Organize everything you love in one place and build your personalized collection.",
          benefits: ["Favorite parks", "Save blog articles", "Bookmark events", "Organized collections"]
        },
        {
          icon: CheckCircle,
          title: "Visited Parks Tracker",
          description: "Mark parks as visited with dates and memories. Keep a record of your adventures and build your National Park passport.",
          benefits: ["Mark parks visited", "Add visit dates", "Memory preservation", "Achievement tracking"]
        },
        {
          icon: Users,
          title: "Your Profile & Reviews",
          description: "Manage all your park reviews in one place. Choose from 1000+ unique auto-generated avatars or upload your own photo. Track your contributions and community impact.",
          benefits: ["Review management", "1000+ avatar combos", "Upload custom photo", "Contribution tracking"]
        }
      ]
    },
    {
      category: "Community & Content",
      icon: Users,
      description: "Learn from experts and connect with fellow park enthusiasts",
      items: [
        {
          icon: Star,
          title: "User Reviews with Photos",
          description: "Read and write authentic reviews with up to 5 photos per review. Share your experiences and help others plan their trips.",
          benefits: ["Photo reviews (5 max)", "Authentic feedback", "Community insights", "Verified users"]
        },
        {
          icon: BookOpen,
          title: "Expert Blog Articles",
          description: "In-depth guides about National Parks, hiking tips, photography advice, and travel planning from experienced explorers.",
          benefits: ["Expert knowledge", "Comprehensive guides", "Tips & tricks", "Regular updates"]
        },
        {
          icon: MessageSquare,
          title: "Community Discussions",
          description: "Engage through blog comments, testimonials, and discussions. Like comments, reply to threads, and share knowledge with the community.",
          benefits: ["Comment on blogs", "Like & reply", "Share testimonials", "Knowledge exchange"]
        }
      ]
    },
    {
      category: "Seamless Experience",
      icon: Zap,
      description: "Fast, reliable, and works everywhere you go",
      items: [
        {
          icon: Globe,
          title: "Works Offline",
          description: "Install as an app on your device with offline capabilities. Access cached park data, saved trips, and favorites even without internet.",
          benefits: ["Install on device", "Offline access", "Cached content", "App-like experience"]
        },
        {
          icon: Zap,
          title: "Real-Time Sync",
          description: "Your favorites, reviews, and trip plans sync instantly across all your devices. Start planning on desktop, continue on mobile.",
          benefits: ["Multi-device sync", "Instant updates", "Cross-platform", "Seamless experience"]
        },
        {
          icon: Shield,
          title: "Fast & Secure",
          description: "Lightning-fast loading with smart caching. Your data is protected with secure authentication, password management, and privacy controls.",
          benefits: ["Quick loading", "Secure login", "Privacy controls", "Protected data"]
        }
      ]
    },
  ];

  const competitiveAdvantages = [
    {
      icon: Sparkles,
      title: "AI-First Approach",
      description: "Unlike other travel apps, we use advanced AI to create truly personalized trip plans that adapt to your preferences and provide real-time assistance.",
      comparison: "Traditional apps: Static recommendations • TrailVerse: Dynamic AI guidance"
    },
    {
      icon: Mountain,
      title: "National Parks Focus",
      description: "We specialize exclusively in National Parks, providing deeper insights, more accurate information, and specialized features you won't find in general travel apps.",
      comparison: "General apps: Broad coverage • TrailVerse: Deep park expertise"
    },
    {
      icon: MessageCircle,
      title: "Persistent AI Conversations",
      description: "Continue your planning conversations across sessions. Our AI remembers your preferences and builds on previous discussions for better recommendations.",
      comparison: "Other apps: One-time interactions • TrailVerse: Evolving conversations"
    },
    {
      icon: Shield,
      title: "Verified Community",
      description: "All reviews and testimonials are verified from real users. No fake reviews or sponsored content - just authentic experiences.",
      comparison: "Other platforms: Mixed quality • TrailVerse: 100% verified content"
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO 
        title="Features - TrailVerse | Comprehensive National Park Planning Tools"
        description="Discover all the powerful features that make TrailVerse the ultimate National Park planning platform. AI-powered trip planning, daily nature feeds, interactive maps, community reviews, and more."
        keywords="National Parks features, AI trip planning, daily nature feed, park discovery tools, community reviews, travel planning features"
      />

      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden py-8 sm:py-12">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-forest-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 mb-4 sm:mb-6 backdrop-blur"
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
            From AI-powered trip planning and daily nature feeds to community reviews, TrailVerse provides all the tools you need to discover, plan, and enjoy America's National Parks.
          </p>
        </div>
      </section>

      {/* Daily Feed Highlight */}
      <section className="py-8 sm:py-12" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4"
              style={{
                backgroundColor: 'var(--accent-green)/10',
                color: 'var(--accent-green)'
              }}
            >
              <Sun className="h-4 w-4" />
              <span className="text-sm font-medium">New Feature</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Your Daily Nature Companion
            </h2>
            <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Start each day with a personalized National Park recommendation, complete with weather insights, 
              astronomy data, and AI-powered recommendations tailored just for you.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-green)/10' }}
                >
                  <Sparkles className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    AI-Powered Park Selection
                  </h3>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Our AI analyzes your location, preferences, and current conditions to recommend the perfect park for today.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-green)/10' }}
                >
                  <Moon className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Complete Weather & Astronomy Data
                  </h3>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Get sunrise/sunset times, moon phases, weather conditions, and stargazing opportunities for today's featured park.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-green)/10' }}
                >
                  <Zap className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Lightning-Fast Performance
                  </h3>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Smart caching ensures your daily feed loads instantly. Data updates once per day for optimal performance.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-2xl p-6 backdrop-blur"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <div className="text-sm font-medium ml-2" style={{ color: 'var(--text-secondary)' }}>
                    Today in Nature
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
                      <Mountain className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        Olympic National Park
                      </h4>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Washington • National Park
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Sunrise className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>6:42 AM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sunset className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>7:15 PM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>40°F</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Waxing Crescent</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-12 sm:space-y-16">
            {features.map((category, categoryIndex) => (
              <div key={categoryIndex} className="text-center">
                {/* Category Header */}
                <div className="mb-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                    style={{ backgroundColor: 'var(--accent-green)/10' }}
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

                {/* Feature Items */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="group">
                      <div className="rounded-2xl p-6 sm:p-8 backdrop-blur hover:shadow-lg transition-all duration-200 h-full flex flex-col items-center text-center"
                        style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                          style={{ backgroundColor: 'var(--accent-green)/10' }}
                        >
                          <item.icon className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                        </div>
                        
                        <div className="flex items-center gap-2 mb-3 justify-center flex-wrap">
                          <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {item.title}
                          </h3>
                          {item.badge && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full"
                              style={{ 
                                backgroundColor: 'var(--accent-blue)/10',
                                color: 'var(--accent-blue)'
                              }}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        
                        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
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
              See how we compare to other travel and National Park apps
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
                    style={{ backgroundColor: 'var(--accent-green)/10' }}
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
      <Footer />
    </div>
  );
};

export default FeaturesPage;
