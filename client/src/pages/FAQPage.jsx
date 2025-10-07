import React, { useState } from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';
import { ChevronDown, Mail } from 'lucide-react';

const FAQPage = () => {
  useTheme();
  const [openFaqItems, setOpenFaqItems] = useState([]);

  const faqItems = [
    {
      question: "How does AI trip planning work?",
      answer: "Our AI analyzes your preferences, travel dates, and interests to create personalized itineraries for National Parks. It considers weather, crowds, activities, and optimal routes to suggest the perfect adventure for you."
    },
    {
      question: "Is TrailVerse completely free?",
      answer: "Yes! TrailVerse is completely free to use. We believe everyone should have access to amazing National Park experiences without barriers."
    },
    {
      question: "Can I use this for group trips?",
      answer: "Absolutely! Our AI trip planner can accommodate solo travelers, couples, families, and large groups. Just specify your group size and preferences when planning."
    },
    {
      question: "Does it work offline?",
      answer: "While the AI planning requires an internet connection, you can download your itineraries and park information for offline access during your adventures."
    },
    {
      question: "How accurate is the weather information?",
      answer: "We provide real-time weather data from reliable sources and update it every hour. Weather conditions can change quickly in National Parks, so we recommend checking updates regularly."
    },
    {
      question: "What makes TrailVerse different?",
      answer: "TrailVerse combines AI-powered trip planning with real-time data, community insights, and deep knowledge of all 63 National Parks to create truly personalized experiences you can't find anywhere else."
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
              <a
                href="mailto:trailverseteam@gmail.com"
                className="inline-flex items-center gap-2 rounded-full bg-forest-500 hover:bg-forest-600 text-white px-6 py-3 text-base font-semibold transition shadow-lg hover:shadow-forest-500/50"
              >
                <Mail className="h-4 w-4" />
                Contact Support
              </a>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default FAQPage;
