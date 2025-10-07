import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';
import { 
  Compass, Mountain, Camera, MapPin, Users, Award, 
  Globe, Mail, Instagram, Twitter, Facebook, 
  Sparkles, Calendar, Heart, Star, ChevronRight
} from 'lucide-react';

const AboutPage = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [statsAnimated, setStatsAnimated] = useState(false);

  // Animated stats
  const [animatedStats, setAnimatedStats] = useState({
    parksVisited: 0,
    mapContributions: 0,
    photosShared: 0,
    yearsExperience: 0
  });

  // Real data based on your experience
  const stats = {
    parksVisited: 16, // Your actual national parks count
    mapContributions: 8212, // From your Google Maps reviews
    photosShared: 6540, // From your Google Maps photos
    yearsExperience: 5 // 2020-2025
  };

  const socialLinks = [
    {
      icon: Instagram,
      label: "Instagram",
      url: "https://instagram.com/astrobykrishna",
      description: "@astrobykrishna"
    },
    {
      icon: Globe,
      label: "Unsplash Portfolio",
      url: "https://unsplash.com/@astrobykrishna",
      description: "25+ Astrophotography shots"
    },
    {
      icon: MapPin,
      label: "Google Maps Level 8",
      url: "https://maps.app.goo.gl/MX71pvtv23ubGheW7?g_st=ic",
      description: "Level 8 • 2.2M+ review views"
    },
    {
      icon: Mail,
      label: "Email",
      url: "mailto:travelswithkrishna@gmail.com",
      description: "travelswithkrishna@gmail.com"
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
      description: "Google Maps Level 8 contributor with 372+ detailed park reviews"
    },
    {
      icon: Mountain,
      title: "National Parks",
      description: "16+ National Parks explored across the United States"
    },
    {
      icon: Sparkles,
      title: "Content Creation",
      description: "Sharing park experiences through photography and detailed reviews"
    }
  ];

  const teamMembers = [
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

      Object.keys(stats).forEach(key => {
        let currentValue = 0;
        const targetValue = stats[key];
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
      <SEO 
        title="About Krishna - National Parks Explorer & Astrophotographer | TrailVerse"
        description="Meet Krishna, the creator of TrailVerse. Astrophotographer, Google Maps Level 8 contributor, and National Parks enthusiast sharing his journey through America's 63 parks."
        keywords="about, Krishna, National Parks, astrophotography, Google Maps, travel, TrailVerse"
      />
      
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="pt-8 pb-16 px-4 sm:px-6 lg:px-8">
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
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Hey, I'm Krishna
                    </h1>
                    <p className="text-lg leading-relaxed mb-6"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      A travel enthusiast who loves exploring new places and sharing my experiences with others. From beautiful destinations to insightful travel tips, my blog is the perfect place to find inspiration for your next adventure. 🏞️ <strong>16 National Parks Explored</strong> • 📸 <strong>Nikon Z6ii Astrophotographer</strong> • 🗺️ <strong>Google Level 8 Contributor</strong>
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <button
                        onClick={() => navigate('/explore')}
                        className="inline-flex items-center gap-2 rounded-full bg-forest-500 hover:bg-forest-600 text-white px-6 py-3 text-base font-semibold transition shadow-lg hover:shadow-forest-500/50"
                      >
                        <Compass className="h-5 w-5" />
                        Explore Parks
                      </button>
                      <a
                        href="https://instagram.com/astrobykrishna"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium ring-1 backdrop-blur hover:bg-white/5 transition"
                        style={{
                          backgroundColor: 'var(--surface)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <Instagram className="h-5 w-5" />
                        Follow Me
                      </a>
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
                  I'm thrilled to share all my travel experiences, curated with accurate reviews and insightful tips. 
                  As a Google Level 8 reviewer, I've made it my mission to help users navigate and explore the world, 
                  ensuring they have the best possible travel experiences. Follow me (krishna) on this journey as we 
                  embark on exciting destinations, uncover hidden gems, and create unforgettable memories together!
                </p>
                
                <p>
                  Being a Level 8 reviewer means I've dedicated countless hours to crafting accurate and valuable reviews. 
                  Whether it's rating accommodations, restaurants, and attractions, or giving useful tips, I strive to 
                  assist travellers in making the most informed decisions during their adventures.
                </p>
                
                <p>
                  I created this app for everyone to use and plan National Parks trips with ease. With AI-powered planning 
                  that gives you personalized plans based on your choices, you can see all live NPS events on the events 
                  page to easily save them. You can even save parks and plan according to your interests - one easy, simple 
                  app that helps you do all things. With my curated blogs, you can get all tips and guides for all travel-related 
                  needs. Join this mission and make sure you spread the word. Thanks for choosing NPE!
                </p>
                
                <p>
                  Nothing makes me happier than knowing my insights have helped someone create their perfect vacation.
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
                From Grand Canyon to Big Bend - my National Parks adventure
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
                  2.2M+ views
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
                  58M+ views
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
                My passion for National Parks and photography expertise
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
              
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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

        {/* About This App Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-4 mb-6">
                <img 
                  src="/logo.png" 
                  alt="TrailVerse Logo" 
                  className="h-12 w-12 rounded-xl object-contain"
                />
                <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  About This App
                </h2>
              </div>
              <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                TrailVerse is my way of giving back to the travel community, combining my passion for 
                National Parks with technology to help others discover these incredible places.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="rounded-2xl p-8 backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <h3 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Built With Passion
                </h3>
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <strong>National Parks Explorer</strong> combines my personal experiences visiting 16+ parks 
                    with real-time weather data, detailed park information, interactive maps, and AI-powered 
                    trip planning to help you create the perfect park adventure.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Every feature is designed with fellow travelers in mind - from comprehensive trip planning 
                    tools to seasonal guides and community reviews based on my own Google Maps contributions.
                  </p>
                   <div className="mt-6">
                     <h4 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                       Tech Stack
                     </h4>
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                       <div className="space-y-2">
                         <h5 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Frontend</h5>
                         <div className="flex flex-wrap gap-2">
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             React
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Tailwind CSS
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Lucide Icons
                           </span>
                         </div>
                       </div>
                       
                       <div className="space-y-2">
                         <h5 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Backend</h5>
                         <div className="flex flex-wrap gap-2">
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Node.js
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Express
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             MongoDB
                           </span>
                         </div>
                       </div>
                       
                       <div className="space-y-2">
                         <h5 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>APIs & Services</h5>
                         <div className="flex flex-wrap gap-2">
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             NPS API
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Weather API
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             OpenAI
                           </span>
                         </div>
                       </div>
                       
                       <div className="space-y-2">
                         <h5 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Deployment</h5>
                         <div className="flex flex-wrap gap-2">
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Vercel
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             MongoDB Atlas
                           </span>
                         </div>
                       </div>
                       
                       <div className="space-y-2">
                         <h5 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tools</h5>
                         <div className="flex flex-wrap gap-2">
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             React Query
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             React Router
                           </span>
                         </div>
                       </div>
                       
                       <div className="space-y-2">
                         <h5 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Features</h5>
                         <div className="flex flex-wrap gap-2">
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             AI Planning
                           </span>
                           <span className="px-2 py-1 rounded text-xs font-medium"
                             style={{
                               backgroundColor: 'var(--accent-green)',
                               color: 'white'
                             }}
                           >
                             Real-time Events
                           </span>
                         </div>
                       </div>
                     </div>
                   </div>
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
