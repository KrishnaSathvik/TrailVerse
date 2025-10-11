import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import { Home, Compass, Mountain } from 'lucide-react';

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  useTheme();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: '404 - Page Not Found',
    description: 'The page you are looking for could not be found.',
    url: 'https://www.nationalparksexplorerusa.com/404',
    mainEntity: {
      '@type': 'Thing',
      name: 'TrailVerse - National Parks Explorer',
      description: 'Explore America\'s 470+ National Parks & Sites'
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="404 - Page Not Found | TrailVerse"
        description="The page you are looking for could not be found. Explore America's National Parks with TrailVerse."
        keywords="404, page not found, national parks, TrailVerse"
        url="https://www.nationalparksexplorerusa.com/404"
        additionalStructuredData={structuredData}
      />

      <Header />

      {/* Hero Section */}
      <section className="relative w-full min-h-[80vh] flex items-center justify-center">
        {/* Background Image */}
        <div 
          className="absolute inset-0 w-full bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url(/background4.png)',
            filter: 'brightness(0.4)',
            width: '100vw',
            left: '50%',
            marginLeft: '-50vw'
          }}
        />
        
        {/* Gradient Overlay */}
        <div 
          className="absolute inset-0 w-full bg-gradient-to-b from-black/20 via-black/40 to-black/60"
          style={{
            width: '100vw',
            left: '50%',
            marginLeft: '-50vw'
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* 404 Badge */}
          <div 
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 ring-1 backdrop-blur mb-8 bg-white/10 border-white/20"
          >
            <Mountain className="h-4 w-4 text-white" />
            <span className="text-xs font-medium uppercase tracking-wider text-white">
              Page Not Found
            </span>
          </div>

          {/* Main Content */}
          <h1 className="text-8xl sm:text-9xl font-light tracking-tighter leading-none mb-6 text-white">
            404
          </h1>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight mb-6 text-white">
            Lost in the Wilderness?
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl leading-relaxed text-white/90 mb-12">
            The trail you're looking for seems to have disappeared. 
            Don't worry—every explorer gets lost sometimes. Let's get you back on track.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() => navigate('/')}
              variant="secondary"
              size="lg"
              icon={Home}
              className="backdrop-blur"
            >
              Go Home
            </Button>
            
            {isAuthenticated ? (
              <Button
                onClick={() => navigate('/explore')}
                variant="secondary"
                size="lg"
                icon={Compass}
                className="backdrop-blur"
              >
                Explore Parks
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/signup')}
                variant="secondary"
                size="lg"
                icon={Compass}
                className="backdrop-blur"
              >
                Get Started
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Help Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl p-8 sm:p-12 backdrop-blur text-center"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow)'
            }}
          >
            <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Need Help Finding Your Way?
            </h3>
            <p className="text-base sm:text-lg mb-8 max-w-2xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Check out our most popular destinations or use our AI-powered trip planner to discover your next adventure.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  title: 'Popular Parks',
                  description: 'Explore our most visited destinations',
                  link: '/explore',
                  icon: Mountain
                },
                {
                  title: 'AI Trip Planner',
                  description: 'Get personalized recommendations',
                  link: '/plan-ai',
                  icon: Compass
                },
                {
                  title: 'Park Map',
                  description: 'Find parks near you',
                  link: '/map',
                  icon: Home
                }
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={index}
                    to={item.link}
                    className="group p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1"
                    style={{
                      backgroundColor: 'var(--surface-hover)',
                      borderWidth: '1px',
                      borderColor: 'var(--border)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-green)';
                      e.currentTarget.style.backgroundColor = 'var(--surface-active)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                    }}
                  >
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 transition-transform group-hover:scale-110"
                      style={{
                        backgroundColor: 'var(--surface-active)',
                        borderWidth: '1px',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <h4 className="text-lg font-semibold tracking-tight mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.title}
                    </h4>
                    <p className="text-sm leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {item.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NotFoundPage;
