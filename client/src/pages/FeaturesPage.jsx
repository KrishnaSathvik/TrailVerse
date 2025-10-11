import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import { useTheme } from '../context/ThemeContext';
import { 
  Sparkles, Compass, MapPin, Calendar, Heart, Camera, BookOpen, Route,
  Star, Shield, Clock, Users, MessageCircle, ArchiveRestore, Trash2,
  CheckCircle, Bot, Mountain, Globe, Zap, Eye, BarChart3, Mail,
  Settings, FileText, MessageSquare, TrendingUp, Award, Target
} from 'lucide-react';

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
          icon: MessageCircle,
          title: "Conversation History",
          description: "All your AI conversations are automatically saved. Continue planning sessions anytime with full context.",
          benefits: ["Auto-save conversations", "Chat history management", "Archive & restore trips", "Seamless continuation"]
        }
      ]
    },
    {
      category: "Comprehensive Park Discovery",
      icon: Mountain,
      description: "Explore America's 470+ National Parks, Monuments, and Historic Sites",
      items: [
        {
          icon: MapPin,
          title: "Interactive Park Explorer",
          description: "Discover parks by location, activities, and interests. Get detailed information about each destination.",
          benefits: ["470+ destinations", "Advanced filtering", "Activity-based search", "Detailed park information"]
        },
        {
          icon: Globe,
          title: "Interactive Map View",
          description: "Visualize all National Parks on an interactive map. Filter by state, activities, and more.",
          benefits: ["Real-time map visualization", "State-based filtering", "Activity overlays", "Park clustering"]
        },
        {
          icon: Compass,
          title: "Park Comparison Tool",
          description: "Compare multiple parks side-by-side to find the perfect destination for your trip.",
          benefits: ["Side-by-side comparison", "Feature highlighting", "Decision support", "Quick selection"]
        }
      ]
    },
    {
      category: "Personal Trip Management",
      icon: Calendar,
      description: "Organize and track your National Park adventures",
      items: [
        {
          icon: Heart,
          title: "Favorites & Wishlist",
          description: "Save parks you want to visit and manage your bucket list. Track your National Park journey.",
          benefits: ["Personalized collections", "Bucket list tracking", "Easy organization", "Progress monitoring"]
        },
        {
          icon: CheckCircle,
          title: "Visited Parks Tracker",
          description: "Mark parks as visited and keep a record of your adventures. Build your National Park passport.",
          benefits: ["Adventure logging", "Progress tracking", "Memory preservation", "Achievement system"]
        },
        {
          icon: ArchiveRestore,
          title: "Trip History & Archives",
          description: "All your trip plans are automatically saved. Archive completed trips and restore them anytime.",
          benefits: ["Automatic trip saving", "Archive management", "History preservation", "Easy restoration"]
        }
      ]
    },
    {
      category: "Community & Reviews",
      icon: Users,
      description: "Connect with fellow National Park enthusiasts",
      items: [
        {
          icon: Star,
          title: "Real User Reviews",
          description: "Read authentic reviews from fellow park visitors. Share your experiences and help others plan.",
          benefits: ["Authentic feedback", "Real experiences", "Community insights", "Trusted recommendations"]
        },
        {
          icon: MessageSquare,
          title: "Community Discussions",
          description: "Engage with the National Park community through comments and discussions.",
          benefits: ["Community engagement", "Knowledge sharing", "Experience exchange", "Social connection"]
        },
        {
          icon: Award,
          title: "Verified Testimonials",
          description: "Read verified testimonials from real users who have experienced our platform.",
          benefits: ["Verified reviews", "Quality assurance", "Trust building", "Social proof"]
        }
      ]
    },
    {
      category: "Educational Content",
      icon: BookOpen,
      description: "Learn about National Parks through expert content",
      items: [
        {
          icon: FileText,
          title: "Expert Blog Articles",
          description: "In-depth articles about National Parks, hiking tips, photography guides, and travel advice.",
          benefits: ["Expert knowledge", "Comprehensive guides", "Regular updates", "Educational content"]
        },
        {
          icon: Camera,
          title: "Photo Galleries",
          description: "Stunning photo collections from National Parks to inspire your next adventure.",
          benefits: ["Visual inspiration", "Photography showcase", "Park beauty", "Motivation boost"]
        },
        {
          icon: Target,
          title: "Activity Guides",
          description: "Detailed guides for hiking, camping, wildlife watching, and other park activities.",
          benefits: ["Activity-specific tips", "Safety information", "Skill development", "Preparation guides"]
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
        description="Discover all the powerful features that make TrailVerse the ultimate National Park planning platform. AI-powered trip planning, interactive maps, community reviews, and more."
        keywords="National Parks features, AI trip planning, park discovery tools, community reviews, travel planning features"
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
            From AI-powered trip planning to community reviews, TrailVerse provides all the tools you need to discover, plan, and enjoy America's National Parks.
          </p>
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
                        
                        <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                          {item.title}
                        </h3>
                        
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {competitiveAdvantages.map((advantage, index) => (
              <div key={index} className="rounded-2xl p-6 sm:p-8 backdrop-blur"
                style={{
                  backgroundColor: 'var(--bg-primary)',
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
                    <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                      {advantage.description}
                    </p>
                    <div className="text-sm font-medium px-3 py-2 rounded-lg"
                      style={{ 
                        backgroundColor: 'var(--accent-green)/10',
                        color: 'var(--accent-green)' 
                      }}
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

      {/* CTA Section */}
      <section className="py-16 pb-32 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl p-12 sm:p-16 text-center backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <Mountain className="h-16 w-16 mx-auto mb-6 text-forest-400" />
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Ready to start your adventure?
            </h2>
            <p className="text-lg mb-8 max-w-2xl mx-auto"
              style={{ color: 'var(--text-primary)' }}
            >
              Join thousands of explorers discovering America&apos;s most beautiful places. 
              Create your free account and start planning today.
            </p>
              <Button
                onClick={() => navigate('/signup')}
                variant="secondary"
                size="xl"
                icon={Sparkles}
              >
                Get Started
              </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default FeaturesPage;
