import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import TestimonialsSection from '../components/testimonials/TestimonialsSection';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import statsService from '../services/statsService';
import { handleApiError, fallbackData } from '../utils/errorHandler';
import { 
  Compass, Mountain, Sparkles, Clock, Shield, 
  MapPin, Calendar, Heart, Camera, BookOpen, Route,
  Star, Eye
} from '@components/icons';

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  useTheme();
  const [, setStats] = useState({
    users: 0,
    trips: 0,
    reviews: 0,
    parks: 63
  });
  const [, setTestimonials] = useState([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await statsService.getSiteStats();
      setStats(response.data.stats);
      setTestimonials(response.data.testimonials || []);
    } catch (error) {
      handleApiError(
        error,
        () => {}, // No toast function available in LandingPage
        () => {
          // Fallback callback - use fallback stats, no fake testimonials
          setStats(fallbackData.stats);
          setTestimonials([]); // No fake testimonials - only real user feedback
        },
        false // Don't show toast for network errors
      );
    } finally {
      setLoading(false);
    }
  };

  // Smooth scroll to section
  const _scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'TrailVerse',
    alternateName: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
    logo: 'https://www.nationalparksexplorerusa.com/logo.png',
    description: 'Your guide to exploring America\'s 470+ National Parks & Sites',
    sameAs: [
      'https://www.facebook.com/npeusa',
      'https://twitter.com/npeusa',
      'https://www.instagram.com/npeusa'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      email: 'trailverseteam@gmail.com'
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="TrailVerse - Explore America's 470+ National Parks & Sites"
        description="Discover, plan, and explore America's 470+ National Parks, Monuments, Historic Sites, and more with AI-powered trip planning, interactive maps, real-time weather, events calendar, and expert travel guides. Start your adventure today!"
        keywords="national parks USA, visit national parks, national park guide, park explorer, yellowstone, yosemite, grand canyon, zion, acadia, park planning, AI trip planner, hiking trails, camping, wildlife"
        url={import.meta.env.VITE_WEBSITE_URL || "https://www.nationalparksexplorerusa.com"}
        image="https://www.nationalparksexplorerusa.com/images/og-home.jpg"
        additionalStructuredData={organizationSchema}
      />

      <Header />
      
      {/* Hero Section */}
      <section className="relative w-full min-h-screen overflow-hidden">
        {/* Background Image - Mobile Optimized */}
        <div 
          className="absolute inset-0 w-full bg-cover bg-no-repeat bg-center sm:bg-center md:bg-center lg:bg-top"
          style={{
            backgroundImage: 'url(/background10.png)',
            filter: 'brightness(0.7)',
            backgroundSize: 'cover',
            backgroundAttachment: 'scroll',
            // Mobile-specific positioning
            backgroundPosition: 'center 25%',
            // Ensure full width coverage
            width: '100vw',
            left: '50%',
            marginLeft: '-50vw',
            minHeight: '100vh'
          }}
        />
        
        {/* Enhanced Gradient Overlay for Better Text Readability */}
        <div 
          className="absolute inset-0 w-full bg-gradient-to-b from-black/20 via-black/30 to-black/60"
          style={{
            width: '100vw',
            left: '50%',
            marginLeft: '-50vw'
          }}
        />
        
        {/* Content - Mobile Optimized */}
        <div className="relative z-10 w-full flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 lg:pt-32 xl:pt-40 pb-24 sm:pb-32 lg:pb-48">
          <div className="w-full max-w-7xl mx-auto text-center">
            {/* Badge - Mobile Responsive */}
            <div 
              className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 sm:px-5 sm:py-2.5 ring-1 backdrop-blur mb-8 sm:mb-10 bg-white/10 border-white/20"
            >
              <Route className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              <span className="text-sm font-medium uppercase tracking-wider text-white">
                AI-Powered Trip Planning
              </span>
            </div>

            {/* Main Headline - Mobile Optimized */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-light tracking-tighter leading-[0.85] mb-6 sm:mb-8 text-white w-full">
              <div className="block text-center">Discover America&apos;s</div>
              <div className="block text-center font-semibold">Natural Wonders.</div>
            </h1>

            {/* Subheadline - Mobile Optimized */}
            <div className="w-full max-w-4xl mx-auto mt-6 sm:mt-8 text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed text-white/90">
              <p className="mb-3 text-center">
                Explore 470+ National Parks with AI-powered guidance, real-time weather, and personalized recommendations.
              </p>
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-medium text-center">
                Your perfect adventure starts here.
              </p>
            </div>
          </div>
        </div>

      </section>
      {/* Feature Pills */}
      <section id="features" className="relative z-10 -mt-16 py-16" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Sparkles,
                title: 'AI Trip Planning',
                description: 'Smart itineraries that match your style'
              },
              {
                icon: Clock,
                title: 'Real-time Updates',
                description: 'Weather and current conditions'
              },
              {
                icon: Mountain,
                title: 'Expert Guidance',
                description: 'Local insights and trail recommendations'
              },
              {
                icon: Shield,
                title: 'Privacy First',
                description: 'Your data stays with you'
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="rounded-2xl p-5 backdrop-blur group hover:-translate-y-1 transition-all duration-300"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow)'
                }}
              >
                <div className="flex gap-4 items-start">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 flex-shrink-0 transition-transform group-hover:scale-110"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <feature.icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold tracking-tight mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {feature.title}
                    </p>
                    <p className="text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Journey Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12 backdrop-blur"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            {/* Section Header */}
            <div className="flex items-center gap-2 text-sm mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              <Route className="h-4 w-4" />
              <span className="font-normal">Your Journey</span>
            </div>

            <div className="mb-8">
              <h2 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-none font-medium tracking-tighter mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                The path unfolds.
              </h2>
              <p className="text-base sm:text-lg"
                style={{ color: 'var(--text-primary)' }}
              >
                Every adventure begins with a single step forward
              </p>
            </div>

            {/* Journey Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              {[
                {
                  number: '01',
                  title: 'Discover',
                  phase: 'Exploration Phase',
                  icon: Compass,
                  description: 'Browse 470+ National Parks, Monuments, and Historic Sites with stunning imagery and detailed information.',
                  time: '2-3 minutes',
                  progress: 25,
                  color: 'text-forest-400'
                },
                {
                  number: '02',
                  title: 'Plan',
                  phase: 'AI Crafting',
                  icon: Sparkles,
                  description: 'Let AI create personalized itineraries based on your preferences and travel style.',
                  features: [
                    { icon: MapPin, label: 'Locations' },
                    { icon: Calendar, label: 'Schedule' },
                    { icon: Heart, label: 'Favorites' }
                  ],
                  progress: 50,
                  color: 'text-sky-400'
                },
                {
                  number: '03',
                  title: 'Experience',
                  phase: 'Live the Journey',
                  icon: Camera,
                  description: 'Navigate with real-time updates and weather info.',
                  badges: [
                    { label: 'Real-time updates', color: 'bg-green-400' },
                    { label: 'Weather tracking', color: 'bg-blue-400' },
                    { label: 'Seamless flow', color: 'bg-purple-400' }
                  ],
                  progress: 75,
                  color: 'text-earth-400'
                },
                {
                  number: '04',
                  title: 'Reflect',
                  phase: "Journey's End",
                  icon: BookOpen,
                  description: 'Share reviews, save favorites, and help others discover amazing experiences.',
                  badge: 'Smart learning',
                  progress: 100,
                  color: 'text-purple-400'
                }
              ].map((step, index) => {
                const Icon = step.icon;
                return (
                  <article
                    key={index}
                    className="flex flex-col min-h-[420px] rounded-2xl p-6 backdrop-blur justify-between hover:-translate-y-1 transition-all duration-300"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div className="space-y-5">
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center ring-1 ${step.color}`}
                          style={{
                            backgroundColor: 'var(--surface-active)',
                            borderColor: 'var(--border-hover)'
                          }}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {step.number}. {step.title}
                          </h3>
                          <p className="text-xs uppercase tracking-wider"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {step.phase}
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm leading-relaxed"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {step.description}
                      </p>

                      {/* Time/Features/Badges */}
                      {step.time && (
                        <div className="flex items-center gap-2"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <Clock className="h-4 w-4" />
                          <span className="text-xs">{step.time}</span>
                        </div>
                      )}

                      {step.features && (
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {step.features.map((feature, i) => {
                              const FeatureIcon = feature.icon;
                              return (
                                <div
                                  key={i}
                                  className="h-6 w-6 rounded-full flex items-center justify-center ring-2"
                                  style={{
                                    backgroundColor: 'var(--surface-active)',
                                    borderColor: 'var(--border)'
                                  }}
                                  title={feature.label}
                                >
                                  <FeatureIcon className="h-3 w-3" style={{ color: 'var(--text-secondary)' }} />
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            Personalized suggestions
                          </span>
                        </div>
                      )}

                      {step.badges && (
                        <div className="space-y-2">
                          {step.badges.map((badge, i) => (
                            <div key={i} className="flex items-center gap-2"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              <div className={`h-2 w-2 rounded-full ${badge.color}`} />
                              <span className="text-xs">{badge.label}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {step.badge && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-1"
                          style={{
                            backgroundColor: 'var(--surface)',
                            borderColor: 'var(--border)'
                          }}
                        >
                          <Star className="h-3 w-3" style={{ color: 'var(--text-secondary)' }} />
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {step.badge}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--surface)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${step.progress}%`,
                          backgroundColor: 'var(--text-tertiary)'
                        }}
                      />
                    </div>
                  </article>
                );
              })}
            </div>

          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <TestimonialsSection featured={true} limit={6} />

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

export default LandingPage;