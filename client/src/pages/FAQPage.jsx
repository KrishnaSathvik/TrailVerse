import React, { useState } from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import { useTheme } from '../context/ThemeContext';
import { ChevronDown, Mail, Sparkles, Mountain, Heart, Users, Shield } from '@components/icons';

const FAQPage = () => {
  useTheme();
  const [openFaqItems, setOpenFaqItems] = useState([]);

  const faqCategories = [
    {
      category: "Getting Started",
      icon: Sparkles,
      questions: [
        {
          question: "What is TrailVerse?",
          answer: "TrailVerse is your comprehensive guide to exploring America's 470+ National Parks, Monuments, Historic Sites, and other protected areas. We combine AI-powered trip planning, real-time weather data, interactive maps, and community insights to help you discover and plan the perfect park adventure."
        },
        {
          question: "How do I get started?",
          answer: "Getting started is easy! Create a free account by clicking 'Sign Up', enter your email and create a password. Once logged in, you can explore parks, save favorites, use AI trip planning, view real-time weather, check NPS events, and read travel guides. No credit card required!"
        },
        {
          question: "What makes TrailVerse different?",
          answer: "TrailVerse uniquely combines AI-powered trip planning (Claude + ChatGPT), real-time weather, live NPS events, interactive maps, community reviews with photos, and expert travel guides all in one platform. We help you discover, compare, and plan visits across all 470+ parks with personalized recommendations."
        }
      ]
    },
    {
      category: "AI & Trip Planning",
      icon: Sparkles,
      questions: [
        {
          question: "How does AI trip planning work?",
          answer: "Our AI analyzes your preferences, travel dates, interests, and available time to create personalized itineraries. It considers weather, seasonal attractions, trail difficulty, and optimal routes. Simply provide your preferences, and let our AI craft a detailed plan for you."
        },
        {
          question: "Which AI providers do you offer?",
          answer: "We offer two AI providers: OpenAI's GPT-4 (ChatGPT) and Anthropic's Claude. Both provide excellent recommendations. GPT-4 offers detailed itineraries, while Claude provides conversational responses. You can switch between providers mid-conversation, and your trip history is saved regardless of which AI you use."
        },
        {
          question: "How does trip history and archiving work?",
          answer: "All your AI conversations are automatically saved to your Trip History. Active trips appear in the 'Active' tab for easy continuation. Archive completed trips to the 'Archived' tab where you can restore them anytime with full context and conversation history preserved."
        },
        {
          question: "Are my AI conversations private?",
          answer: "Yes! Your AI conversations are private and stored securely. We send anonymized queries to OpenAI and Anthropic (without personal identifiers). You can delete any conversation from your trip history at any time."
        }
      ]
    },
    {
      category: "Parks & Features",
      icon: Mountain,
      questions: [
        {
          question: "What parks are included?",
          answer: "TrailVerse includes all 470+ units of the National Park System, including National Parks, Monuments, Historic Sites, Battlefields, Seashores, Lakeshores, Recreation Areas, and Preserves. From Yellowstone and Yosemite to hidden gems and historic sites, we cover them all."
        },
        {
          question: "How do Google Maps features work?",
          answer: "All devices get interactive maps with park markers and search. On desktop, you also get Google Places to find nearby restaurants, lodging, and gas stations, plus route planning with turn-by-turn directions. Mobile users enjoy smooth map browsing with park details."
        },
        {
          question: "How accurate is the weather information?",
          answer: "We provide real-time weather data from OpenWeather API with 5-day forecasts, updated regularly throughout the day. Weather in National Parks can change rapidly, so we recommend checking official NPS sources before your trip for critical updates."
        },
        {
          question: "What are park events and how do I save them?",
          answer: "Our Events page displays live ranger programs, guided tours, educational activities, and special events from the National Park Service. Filter by date, park, or activity type, and click the bookmark icon to save events to your profile for easy access."
        }
      ]
    },
    {
      category: "Your Profile & Collections",
      icon: Heart,
      questions: [
        {
          question: "How do favorites and collections work?",
          answer: "Click the heart icon on parks, blogs, or events to save them to your Favorites. Access all saved items from your profile dashboard, organized by type. Use your collections for trip planning and tracking your journey across America's parks."
        },
        {
          question: "How do I track visited parks?",
          answer: "Go to your Profile page and select 'Visited Parks' tab. Click 'Mark Park as Visited' to add a park, select the visit date, and add optional memories. This builds your personal National Park passport and tracks your adventure journey."
        },
        {
          question: "How do I customize my avatar?",
          answer: "TrailVerse offers 1000+ unique auto-generated avatar combinations! Go to your profile settings and click your avatar to open the Avatar Selector. Browse styles, use the random generator, or upload your own photo. Your avatar displays with all your reviews and comments."
        }
      ]
    },
    {
      category: "Community & Support",
      icon: Users,
      questions: [
        {
          question: "How do I write reviews with photos?",
          answer: "Visit any park's detail page and click 'Write Review'. Upload up to 5 photos per review (JPEG, PNG, GIF, or WebP, max 10MB each). We automatically optimize images for faster loading. Your reviews help other travelers plan better trips!"
        },
        {
          question: "How do blog comments work?",
          answer: "Our blog posts feature nested replies, likes, and threaded discussions. Comment on articles, reply to other users, like helpful comments, and edit or delete your own comments anytime. Join the community discussion around National Park topics!"
        },
        {
          question: "Can I use TrailVerse offline?",
          answer: "Yes! TrailVerse caches park information, saved trips, and favorites for offline access via Service Worker. Features requiring live data (AI planning, weather, maps, events) need internet. Install as a PWA for app-like offline functionality."
        }
      ]
    },
    {
      category: "Privacy & Account",
      icon: Shield,
      questions: [
        {
          question: "Is my data safe and private?",
          answer: "Absolutely. We never sell your personal information. Your account data, favorites, and preferences are securely stored and used only to enhance your TrailVerse experience. All data is encrypted in transit and at rest. Read our Privacy Policy for complete details."
        },
        {
          question: "How do I delete my account?",
          answer: "Go to your Profile > Settings > Privacy & Security section and click 'Delete Account'. Confirm your password and follow the prompts. All your data will be permanently deleted in accordance with our Privacy Policy."
        },
        {
          question: "Can I contact support?",
          answer: "Yes! We love hearing from our community. For feature suggestions, bug reports, or questions, contact us at trailverseteam@gmail.com. We typically respond within 24-48 hours."
        }
      ]
    }
  ];

  const toggleFaqItem = (id) => {
    setOpenFaqItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO 
        title="FAQ - Frequently Asked Questions | TrailVerse"
        description="Find answers to common questions about TrailVerse, our AI trip planning, and how we can help craft your perfect park adventure."
        keywords="FAQ, questions, help, support, National Parks, AI trip planning"
      />
      
      <Header />
      
      <main className="pt-16">
        {/* Hero Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              style={{ color: 'var(--text-primary)' }}
            >
              Frequently Asked Questions
            </h1>
            <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Find answers to common questions about TrailVerse and start planning your perfect park adventure.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <Mail className="h-4 w-4" />
              <span>Still have questions? Email us</span>
            </div>
          </div>
        </section>

        {/* FAQ Section with Categories */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto space-y-16">
            {faqCategories.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                {/* Category Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                  >
                    <category.icon className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {category.category}
                  </h2>
                </div>

                {/* Questions in Category */}
                <div className="space-y-3">
                  {category.questions.map((item, questionIndex) => {
                    const uniqueId = `${categoryIndex}-${questionIndex}`;
                    return (
                      <div
                        key={uniqueId}
                        className="rounded-xl overflow-hidden backdrop-blur"
                        style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <button
                          onClick={() => toggleFaqItem(uniqueId)}
                          className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition text-left"
                        >
                          <span className="font-semibold text-lg pr-4"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {item.question}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 transition-transform duration-300 flex-shrink-0 ${
                              openFaqItems.includes(uniqueId) ? 'rotate-180' : ''
                            }`}
                            style={{ color: 'var(--text-secondary)' }}
                          />
                        </button>
                        
                        <div
                          className={`overflow-hidden transition-all duration-300 ${
                            openFaqItems.includes(uniqueId) ? 'max-h-[400px]' : 'max-h-0'
                          }`}
                        >
                          <div className="p-6 pt-0 text-base leading-relaxed"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.answer}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl p-8 sm:p-12 text-center backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Still have questions?
              </h2>
              <p className="text-base mb-6 max-w-2xl mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.
              </p>
              <Button
                href="mailto:trailverseteam@gmail.com"
                variant="secondary"
                size="md"
                icon={Mail}
              >
                Contact Support
              </Button>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default FAQPage;
