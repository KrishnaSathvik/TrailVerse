"use client";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';

import Button from '@/components/common/Button';
import { useTheme } from '@/context/ThemeContext';
import {
  Compass, Mountain, Camera, MapPin, Award,
  Globe, Mail, Instagram, Facebook, Play,
  Sparkles, Calendar
} from '@components/icons';

const STATS = {
  parksVisited: 17, // Your actual national parks count
  mapContributions: 379, // Google Maps reviews
  photosShared: 6589, // From your Google Maps photos
  yearsExperience: 6 // 2020-2026
};

const AboutPage = () => {
  const router = useRouter();
  useTheme();
  const [, setStatsAnimated] = useState(false);

  // Animated stats
  const [animatedStats, setAnimatedStats] = useState({
    parksVisited: 0,
    mapContributions: 0,
    photosShared: 0,
    yearsExperience: 0
  });

  // Real data based on your experience
  const socialLinks = [
    {
      icon: Globe,
      label: "Astro by Krishna",
      url: "https://www.astrobykrishna.com",
      description: "Astrophotography Portfolio"
    },
    {
      icon: Instagram,
      label: "Instagram",
      url: "https://instagram.com/astrobykrishna",
      description: "@astrobykrishna"
    },
    {
      icon: Facebook,
      label: "Facebook",
      url: "https://www.facebook.com/Gitam2015",
      description: "Travel Community"
    },
    {
      icon: Camera,
      label: "Pexels",
      url: "https://www.pexels.com/@astrobykrishna/",
      description: "Free Photography"
    },
    {
      icon: Camera,
      label: "500px",
      url: "https://500px.com/p/astrobykrishna?view=photos",
      description: "Photography Portfolio"
    },
    {
      icon: Globe,
      label: "Unsplash",
      url: "https://unsplash.com/@astrobykrishna",
      description: "25+ Astrophotography shots"
    },
    {
      icon: Play,
      label: "TikTok",
      url: "https://www.tiktok.com/@travelswithkrishna",
      description: "@travelswithkrishna"
    },
    {
      icon: MapPin,
      label: "Pinterest",
      url: "https://pin.it/2N6K1Iz",
      description: "Travel Inspiration"
    },
    {
      icon: MapPin,
      label: "Google Maps Level 8",
      url: "https://www.google.com/maps/contrib/118219629305553937668",
      description: "Level 8 • 67M+ views"
    },
    {
      icon: Mail,
      label: "Email",
      url: `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "trailverseteam@gmail.com"}`,
      description: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "trailverseteam@gmail.com"
    }
  ];

  const skills = [
    {
      icon: Camera,
      title: "Astrophotography",
      description: "Nikon Z6ii photographer specializing in night sky and landscape photography"
    },
    {
      icon: MapPin,
      title: "Travel Expert",
      description: "Google Maps Level 8 contributor with 379+ detailed park reviews"
    },
    {
      icon: Mountain,
      title: "National Parks",
      description: "17+ National Parks explored across the United States"
    },
    {
      icon: Sparkles,
      title: "Content Creation",
      description: "Sharing park experiences through photography and detailed reviews"
    }
  ];

  const _teamMembers = [
    {
      name: "The TrailVerse Team",
      role: "Development & Design",
      bio: "Passionate about making National Park exploration accessible to everyone through technology and innovation.",
      avatar: "🏞️"
    }
  ];

  // Animate stats on scroll
  useEffect(() => {
    const timer = setTimeout(() => {
      setStatsAnimated(true);
      // Animate numbers
      const duration = 2000;
      const steps = 50;
      const stepDuration = duration / steps;

      Object.keys(STATS).forEach(key => {
        let currentValue = 0;
        const targetValue = STATS[key];
        const increment = targetValue / steps;

        const interval = setInterval(() => {
          currentValue += increment;
          if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(interval);
          }
          setAnimatedStats(prev => ({
            ...prev,
            [key]: Math.floor(currentValue)
          }));
        }, stepDuration);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="pt-3 pb-16 px-4 sm:pt-8 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="rounded-3xl overflow-hidden backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="p-8 sm:p-12">
                <div className="max-w-4xl mx-auto">
                  {/* Hero Content */}
                  <div>
                    <div
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                        Krishna&apos;s Story Behind TrailVerse
                      </span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Hey, I&apos;m Krishna
                    </h1>
                    <p className="text-lg leading-relaxed mb-6"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      I&apos;m Krishna, a Nikon Z6ii astrophotographer and Google Maps Level 8 contributor who has explored 17 National Parks across 23 states. TrailVerse is the all-in-one trip planning tool I always wished existed while planning my own park adventures.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        onClick={() => router.push('/plan-ai')}
                        variant="primary"
                        size="md"
                        icon={Sparkles}
                      >
                        Try the AI Trip Planner
                      </Button>
                      <Button
                        onClick={() => router.push('/explore')}
                        variant="secondary"
                        size="md"
                        icon={Compass}
                      >
                        Explore Parks
                      </Button>
                      <Button
                        href="https://www.instagram.com/travelswithkrishna/"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="md"
                        icon={Instagram}
                      >
                        Follow Me
                      </Button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </section>

        {/* My Story Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl p-8 sm:p-12 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="text-center mb-8">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  My Story
                </h2>
              </div>
              
              <div className="space-y-6 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <p>
                  TrailVerse started from the way I already travel: planning deeply, documenting everything, and sharing what actually helps once you&apos;re on the road. Over time, that turned into thousands of Google Maps contributions, park visits across the country, and a clearer idea of what travelers really need in one place.
                </p>
                
                <p>
                  As a Google Maps Level 8 reviewer, I&apos;ve spent years writing detailed reviews, sharing photos, and leaving practical notes about what&apos;s worth your time. That experience shaped TrailVerse into something grounded in real visits, not just scraped data or generic travel advice.
                </p>
                
                <p>
                  I built TrailVerse to make national park planning feel modern and useful: AI trip planning, interactive maps, saved chats, live NPS events, weather, blogs, and community reviews all working together. The goal is simple: help you spend less time juggling tabs and more time planning a trip you&apos;re actually excited about.
                </p>
                
                <p>
                  The best outcome is when someone opens TrailVerse, finds the right park, builds a better itinerary, and heads out feeling more prepared and more inspired than they would have otherwise.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                My Journey by Numbers
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                17 parks, thousands of miles, and one big idea: TrailVerse
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="rounded-2xl p-6 text-center backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <Mountain className="h-6 w-6 text-white" />
                </div>
                <div className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {animatedStats.parksVisited}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Parks Visited
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Across 23 states
                </div>
              </div>

              <div className="rounded-2xl p-6 text-center backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <MapPin className="h-6 w-6 text-white" />
                </div>
                <div className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {animatedStats.mapContributions}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Reviews Written
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  67M+ views
                </div>
              </div>

              <div className="rounded-2xl p-6 text-center backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <Camera className="h-6 w-6 text-white" />
                </div>
                <div className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {animatedStats.photosShared}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Photos Shared
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  64.5M+ views
                </div>
              </div>

              <div className="rounded-2xl p-6 text-center backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <Award className="h-6 w-6 text-white" />
                </div>
                <div className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                  {animatedStats.yearsExperience}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Years Experience
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  And counting
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Skills Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                What I Do
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                The mix of travel experience, photography, and product building behind TrailVerse
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {skills.map((skill, index) => {
                const Icon = skill.icon;
                return (
                  <div
                    key={index}
                    className="rounded-2xl p-6 backdrop-blur"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                      style={{ backgroundColor: 'var(--accent-green)' }}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                      {skill.title}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {skill.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Social Links Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="rounded-2xl p-8 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="text-center mb-8">
                <h3 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Connect With Me
                </h3>
                <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                  Follow my adventures and connect with me across platforms
                </p>
              </div>
              
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {socialLinks.map((link, index) => {
                  const Icon = link.icon;
                  return (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 rounded-xl transition hover:bg-white/5"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <Icon className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                      <div>
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {link.label}
                        </div>
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {link.description}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

      {/* About TrailVerse Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="text-center mb-16">
              <div className="flex items-center justify-center gap-4 mb-8">
                <div className="relative">
                <Image
                  src="/logo.png"
                  alt="TrailVerse Logo"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-2xl object-contain"
                />
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                  >
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                </div>
                <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-forest-400 to-forest-600 bg-clip-text text-transparent">
                  Why I Built TrailVerse
                </h2>
              </div>
              <p className="text-xl max-w-4xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                TrailVerse is my attempt to turn real travel experience into a better planning product for people who love parks, road trips, and meaningful outdoor travel.
              </p>
            </div>

            {/* Mission Statement */}
            <div className="max-w-6xl mx-auto mb-16">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                style={{
                      backgroundColor: 'var(--accent-green-light)',
                  borderWidth: '1px',
                      borderColor: 'var(--accent-green)'
                    }}
                  >
                    <Mountain className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
                      Why I Built It
                    </span>
                  </div>
                  <h3 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                    Making trip planning feel less fragmented
                </h3>
                  <div className="space-y-4 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <p>
                      After visiting 17 parks and sharing thousands of reviews and photos on Google Maps, I kept running into the same problem: trip planning was scattered across too many apps and too many tabs.
                    </p>
                    <p>
                      TrailVerse brings those pieces together with AI planning, maps, weather, events, reviews, and saved history so you can go from idea to itinerary without losing context.
                    </p>
                  </div>
                </div>
                
                <div className="relative">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="rounded-2xl p-6 backdrop-blur"
                             style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                          style={{ backgroundColor: 'var(--accent-green)' }}
                        >
                          <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>470+</div>
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Parks & Sites</div>
                      </div>
                      
                      <div className="rounded-2xl p-6 backdrop-blur"
                             style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                          style={{ backgroundColor: 'var(--accent-blue)' }}
                        >
                          <MapPin className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Smart</div>
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Trip Planning</div>
                         </div>
                       </div>
                       
                    <div className="space-y-4 mt-8">
                      <div className="rounded-2xl p-6 backdrop-blur"
                             style={{
                          backgroundColor: 'var(--surface)',
                          borderWidth: '1px',
                          borderColor: 'var(--border)'
                        }}
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                          style={{ backgroundColor: 'var(--accent-orange)' }}
                        >
                          <Camera className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Real-time</div>
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Weather & Events</div>
                      </div>
                      
                      <div className="rounded-2xl p-6 backdrop-blur"
                             style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                          style={{ backgroundColor: 'var(--accent-green)' }}
                        >
                          <Award className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Community</div>
                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Driven Reviews</div>
                      </div>
                    </div>
                  </div>
                </div>
                         </div>
                       </div>
                       
            {/* Key Features */}
            <div className="max-w-6xl mx-auto mb-16">
              <div className="text-center mb-12">
                <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Why TrailVerse?
                </h3>
                <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                  Built by a traveler, for travelers. The strongest parts of TrailVerse are the ones I wanted myself while planning park trips.
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300"
                             style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                  >
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Dual AI Trip Planning
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Build itineraries around your dates, pace, interests, and travel style. Your saved chat history lets you return to a plan and keep refining it instead of starting over.
                  </p>
                </div>

                <div className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300"
                             style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'var(--accent-blue)' }}
                  >
                    <MapPin className="h-6 w-6 text-white" />
                         </div>
                  <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Interactive Maps
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Explore parks visually, compare destinations, and find nearby essentials without bouncing between separate map tools and park pages.
                  </p>
                       </div>
                       
                <div className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300"
                             style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'var(--accent-orange)' }}
                  >
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Live Events & Weather
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    See real-time NPS events, current conditions, forecasts, alerts, and closures so your plan reflects what&apos;s actually happening on the ground.
                  </p>
                </div>

                <div className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300"
                             style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                  >
                    <Mountain className="h-6 w-6 text-white" />
                         </div>
                  <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Community Reviews & Blog
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Read practical guides, browse real reviews, and learn from actual visits instead of relying only on generic roundup articles.
                  </p>
                       </div>
                       
                <div className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300"
                             style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'var(--accent-blue)' }}
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Smart Features & Tracking
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Save parks, events, and trip history, compare destinations side by side, and keep your planning synced across devices.
                  </p>
                </div>

                <div className="group rounded-2xl p-8 backdrop-blur hover:-translate-y-1 transition-all duration-300"
                             style={{
                    backgroundColor: 'var(--surface)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)'
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'var(--accent-orange)' }}
                  >
                    <Globe className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    Offline-Ready
                  </h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Install TrailVerse and keep key trip details accessible when your signal disappears in the park.
                  </p>
                </div>
                         </div>
                       </div>
                       
            <div className="max-w-4xl mx-auto mt-20">
              <div
                className="rounded-3xl p-8 text-center sm:p-10"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Ready to plan your next trip?
                </h3>
                <p className="text-base leading-7 mb-8" style={{ color: 'var(--text-secondary)' }}>
                  Start with TrailVerse AI if you want help shaping an itinerary, or jump into Explore if you want to compare parks first.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    onClick={() => router.push('/plan-ai')}
                    variant="primary"
                    size="lg"
                    icon={Sparkles}
                  >
                    Try the AI Trip Planner
                  </Button>
                  <Button
                    onClick={() => router.push('/explore')}
                    variant="secondary"
                    size="lg"
                    icon={Compass}
                  >
                    Start Exploring Parks
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
      
      <Footer />
    </div>
  );
};

export default AboutPage;
