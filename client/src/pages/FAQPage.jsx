import React, { useState } from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import { useTheme } from '../context/ThemeContext';
import { ChevronDown, Mail } from 'lucide-react';

const FAQPage = () => {
  useTheme();
  const [openFaqItems, setOpenFaqItems] = useState([]);

  const faqItems = [
    {
      question: "What is TrailVerse?",
      answer: "TrailVerse is your comprehensive guide to exploring America's 470+ National Parks, Monuments, Historic Sites, and other protected areas. We combine AI-powered trip planning, real-time weather data, interactive maps, and community insights to help you discover and plan the perfect park adventure."
    },
    {
      question: "How does the AI trip planning work?",
      answer: "Our AI analyzes your preferences, travel dates, interests, and available time to create personalized itineraries tailored to your style. It considers factors like weather conditions, seasonal attractions, crowd levels, trail difficulty, and optimal routes to suggest the perfect adventure. Simply provide your preferences, and let our AI craft a detailed plan for you."
    },
    {
      question: "How do I get started with TrailVerse?",
      answer: "Getting started is easy! Simply create a free account by clicking the 'Sign Up' button, enter your email and create a password. Once logged in, you can start exploring parks, saving favorites, using AI trip planning, viewing real-time weather, checking out NPS events, and reading travel guides. No credit card required to start exploring!"
    },
    {
      question: "How do I save and track my favorite parks?",
      answer: "Simply click the heart icon on any park card to add it to your favorites. You can access all your saved parks from your profile dashboard, where you can also mark parks as visited, track your journey across America's parks, and use your favorites for future trip planning."
    },
    {
      question: "What parks are included?",
      answer: "TrailVerse includes all 470+ units of the National Park System, including National Parks, Monuments, Historic Sites, Battlefields, Seashores, Lakeshores, Recreation Areas, Preserves, and more. From iconic destinations like Yellowstone and Yosemite to hidden gems and historic sites, we cover them all."
    },
    {
      question: "How accurate is the weather information?",
      answer: "We provide real-time weather data from OpenWeather API, updated regularly throughout the day. However, weather conditions in National Parks can change rapidly, especially in mountainous areas. We recommend checking the official National Park Service website and local conditions before your trip for the most current information."
    },
    {
      question: "Can I use TrailVerse offline?",
      answer: "While most features require an internet connection for real-time data, AI planning, and weather updates, you can save your AI-generated itineraries and park information for offline reference. We recommend taking screenshots or downloading important trip details before heading to areas with limited connectivity."
    },
    {
      question: "How do I find parks near me?",
      answer: "Use our interactive Map page to explore parks by location. You can search by state, view parks on the map, filter by park type (National Park, Monument, Historic Site, etc.), and find parks closest to your location or desired destination."
    },
    {
      question: "What are the park events and how do I use them?",
      answer: "Our Events page displays live events from the National Park Service, including ranger programs, guided tours, educational activities, special celebrations, and seasonal events. You can filter events by date, park, or activity type, and save events you're interested in to plan your visit around special programs."
    },
    {
      question: "How do I plan a trip with AI?",
      answer: "Navigate to any park's detail page and look for the AI Trip Planning feature. Select your travel dates, duration, interests (hiking, photography, wildlife, history, etc.), fitness level, and other preferences. Our AI will generate a detailed day-by-day itinerary with activities, trails, viewpoints, and timing recommendations customized for you."
    },
    {
      question: "Can I read travel guides and tips?",
      answer: "Yes! Our Blog section features comprehensive travel guides, park-specific tips, photography advice, seasonal recommendations, packing lists, safety information, and insider insights. These articles are curated to help you make the most of your National Park adventures."
    },
    {
      question: "How do I write reviews or share my experiences?",
      answer: "After visiting a park, you can share your experience by leaving a review on the park's detail page. Share photos, rate your experience, provide tips for other visitors, and help build a community of National Park explorers. Your honest feedback helps others plan better trips."
    },
    {
      question: "What makes TrailVerse different from other park websites?",
      answer: "TrailVerse uniquely combines AI-powered personalized trip planning, real-time weather data, live NPS events, interactive maps, community reviews, and expert travel guides all in one modern, easy-to-use platform. Unlike official park websites that focus on one park at a time, we help you discover, compare, and plan visits across all 470+ parks with intelligent recommendations."
    },
    {
      question: "Is my data safe and private?",
      answer: "Absolutely. We take your privacy seriously and never sell your personal information. Your account data, favorites, and preferences are securely stored and used only to enhance your TrailVerse experience. Read our Privacy Policy for complete details on how we protect and use your information."
    },
    {
      question: "How often is park information updated?",
      answer: "We sync with the National Park Service API regularly to ensure park information, operating hours, alerts, and event data are current. Weather data updates multiple times per day. However, always check the official park website before traveling for the most critical updates like road closures or emergency alerts."
    },
    {
      question: "Can I suggest features or report issues?",
      answer: "Yes! We love hearing from our community. If you have feature suggestions, find bugs, or want to provide feedback, please contact us at trailverseteam@gmail.com. Your input helps us improve TrailVerse for everyone."
    },
    {
      question: "Do you have a mobile app?",
      answer: "TrailVerse is currently a responsive web application that works beautifully on mobile browsers, tablets, and desktops. You can access it from any device with a web browser. We may develop native mobile apps in the future based on user demand."
    },
    {
      question: "How do I delete my account?",
      answer: "If you wish to delete your account and all associated data, please contact us at trailverseteam@gmail.com with your request. We'll process your deletion promptly in accordance with our Privacy Policy."
    }
  ];

  const toggleFaqItem = (index) => {
    setOpenFaqItems(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
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
              Find answers to common questions about TrailVerse, our AI trip planning, 
              and how we can help craft your perfect park adventure.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <Mail className="h-4 w-4" />
              <span>Still have questions? Get in touch</span>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl overflow-hidden backdrop-blur"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <button
                    onClick={() => toggleFaqItem(index)}
                    className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition"
                  >
                    <span className="font-semibold text-left text-lg"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform duration-300 flex-shrink-0 ml-4 ${
                        openFaqItems.includes(index) ? 'rotate-180' : ''
                      }`}
                      style={{ color: 'var(--text-secondary)' }}
                    />
                  </button>
                  
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      openFaqItems.includes(index) ? 'max-h-[300px]' : 'max-h-0'
                    }`}
                  >
                    <div className="p-6 pt-0 text-base"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {item.answer}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
                Can&apos;t find the answer you&apos;re looking for? Our support team is here to help you plan your perfect National Park adventure.
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
