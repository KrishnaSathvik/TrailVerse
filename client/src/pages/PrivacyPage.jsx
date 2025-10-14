import React from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';
import { Shield, Lock, Eye, AlertCircle } from '@components/icons';

const PrivacyPage = () => {
  useTheme();

  const sections = [
    {
      id: "introduction",
      title: "Introduction",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">
            TrailVerse (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our National Parks exploration platform.
          </p>
          <p className="mb-4">
            By using TrailVerse, you agree to the collection and use of information in accordance with this policy. 
            If you do not agree, please do not use our platform.
          </p>
        </>
      )
    },
    {
      id: "collection",
      title: "Information We Collect",
      icon: Eye,
      content: (
        <>
          <h3 className="text-lg font-semibold mb-3 mt-4">Account & Profile Information</h3>
          <p className="mb-4">
            When you create an account, we collect: name, email, password (encrypted), profile bio, avatar (custom upload or from 1000+ generated options), 
            phone number, location, and website (all optional except email and password).
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-4">Usage & Activity Data</h3>
          <p className="mb-4">
            We collect: favorite parks/blogs/events, visited parks with dates, AI trip conversations (GPT-4 & Claude), reviews with up to 5 photos per review, 
            blog comments and likes, saved events, trip history (active & archived), search queries, map interactions, and filter preferences.
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-4">Technical & Analytics Data</h3>
          <p className="mb-4">
            Automatically collected: browser type, device info, IP address, cookies/local storage, Service Worker cached data, 
            WebSocket connections for real-time sync, performance metrics (Core Web Vitals), and Google Analytics data (anonymized).
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-4">Third-Party Data</h3>
          <p className="mb-4">
            We integrate with: National Park Service API (park info, events, alerts), OpenWeather API (weather forecasts), 
            OpenAI & Anthropic (AI trip planning - anonymized), Google Maps Platform (maps, places, directions), and Resend (email delivery).
          </p>
        </>
      )
    },
    {
      id: "usage",
      title: "How We Use Your Information",
      icon: AlertCircle,
      content: (
        <>
          <p className="mb-4">We use collected information to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Provide AI-powered trip planning with personalized recommendations</li>
            <li>Save and sync favorites, reviews, and trip history across all your devices</li>
            <li>Display real-time weather, park alerts, and NPS events</li>
            <li>Enable interactive maps, nearby places search, and route planning</li>
            <li>Process and optimize review images (resize, compress, convert to WebP)</li>
            <li>Send important emails (verification, password resets, blog notifications)</li>
            <li>Enable PWA functionality with offline cached content</li>
            <li>Monitor performance and improve platform quality</li>
          </ul>
        </>
      )
    },
    {
      id: "sharing",
      title: "Information Sharing",
      icon: Lock,
      content: (
        <>
          <p className="mb-4 font-semibold">
            We do NOT sell, trade, or rent your personal information to third parties.
          </p>
          <p className="mb-4">We only share information with:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Service Providers:</strong> MongoDB Atlas (database), Vercel (frontend hosting), Render (backend & images), 
            OpenAI & Anthropic (anonymized AI queries), Google Maps Platform, OpenWeather API, Resend (emails), Google Analytics</li>
            <li><strong>Public Content:</strong> Your reviews, ratings, comments, and testimonials are visible to all users</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect rights and safety</li>
          </ul>
        </>
      )
    },
    {
      id: "security",
      title: "Data Security",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">We implement industry-standard security measures:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Password encryption using bcrypt hashing</li>
            <li>HTTPS/SSL encryption for all data transmission</li>
            <li>Secure database hosting with MongoDB Atlas</li>
            <li>JWT authentication tokens for secure sessions</li>
            <li>Regular security updates and monitoring</li>
          </ul>
          <p className="mb-4 text-sm italic">
            While we strive to protect your information, no method of transmission over the Internet is 100% secure.
          </p>
        </>
      )
    },
    {
      id: "cookies",
      title: "Cookies & Local Storage",
      icon: Eye,
      content: (
        <>
          <p className="mb-4">
            TrailVerse uses browser local storage (not traditional cookies) to enhance your experience:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Essential:</strong> Authentication tokens, session management</li>
            <li><strong>Functional:</strong> Theme preferences, favorites, cached park data, AI chat state</li>
            <li><strong>Analytics:</strong> Google Analytics session data (optional, via cookie consent)</li>
            <li><strong>PWA/Offline:</strong> Service Worker cached content for offline access</li>
          </ul>
          <p className="mb-4">
            Our LocalStorage Monitor automatically manages storage to prevent quota issues. 
            You can clear all data through your browser settings or by logging out.
          </p>
        </>
      )
    },
    {
      id: "rights",
      title: "Your Privacy Rights",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">You have the right to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Access:</strong> Request a copy of your personal information</li>
            <li><strong>Correction:</strong> Update inaccurate or incomplete information</li>
            <li><strong>Deletion:</strong> Delete your account and personal data from Profile Settings</li>
            <li><strong>Opt-Out:</strong> Unsubscribe from marketing emails via unsubscribe links</li>
            <li><strong>Data Portability:</strong> Request your data in a portable format</li>
          </ul>
          <p className="mb-4">
            To exercise these rights, contact us at{' '}
            <a href="mailto:trailverseteam@gmail.com" 
               style={{ color: 'var(--accent-green)' }}
               className="hover:opacity-80 transition">
              trailverseteam@gmail.com
            </a>
            {' '}or manage preferences in your account settings.
          </p>
        </>
      )
    },
    {
      id: "third-party",
      title: "Third-Party Services",
      icon: AlertCircle,
      content: (
        <>
          <p className="mb-4">TrailVerse integrates with these third-party services:</p>
          <div className="grid gap-3 mb-4">
            <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <p className="font-semibold mb-1">Google Services</p>
              <p className="text-sm">Maps, Places, Directions APIs • Analytics 4</p>
            </div>
            <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <p className="font-semibold mb-1">AI Providers</p>
              <p className="text-sm">OpenAI GPT-4 • Anthropic Claude (queries are anonymized)</p>
            </div>
            <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <p className="font-semibold mb-1">Infrastructure</p>
              <p className="text-sm">MongoDB Atlas • Vercel • Render • Resend Email</p>
            </div>
            <div className="p-3 rounded-lg border" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <p className="font-semibold mb-1">Data APIs</p>
              <p className="text-sm">National Park Service • OpenWeather</p>
            </div>
          </div>
          <p className="text-sm mb-4">
            These services have their own privacy policies. Review them at: Google Privacy Policy, OpenAI Privacy Policy, 
            Anthropic Privacy Policy, MongoDB Privacy Policy, and Resend Privacy Policy.
          </p>
        </>
      )
    },
    {
      id: "retention",
      title: "Data Retention",
      icon: Lock,
      content: (
        <>
          <p className="mb-4">We retain information as long as necessary to provide services:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Account Data:</strong> While active and reasonable period after deletion</li>
            <li><strong>Usage Data:</strong> Typically 12-24 months for analytics</li>
            <li><strong>Public Content:</strong> May remain if others engaged with it (reviews, comments)</li>
            <li><strong>Legal:</strong> As required by law or to resolve disputes</li>
          </ul>
        </>
      )
    },
    {
      id: "children",
      title: "Children's Privacy",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">
            TrailVerse is not intended for children under 13. We do not knowingly collect information from children under 13. 
            Users between 13-18 should have parental consent. Contact us immediately if you believe a child has provided information.
          </p>
        </>
      )
    },
    {
      id: "changes",
      title: "Policy Updates",
      icon: AlertCircle,
      content: (
        <>
          <p className="mb-4">
            We may update this Privacy Policy periodically. Changes will be posted on this page with an updated &quot;Last Updated&quot; date. 
            Significant changes will be notified via email. Continued use after changes constitutes acceptance.
          </p>
        </>
      )
    },
    {
      id: "contact",
      title: "Contact Us",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">
            Questions about this Privacy Policy? Contact us at:
          </p>
          <p className="mb-2">
            <strong>Email:</strong>{' '}
            <a href="mailto:trailverseteam@gmail.com" 
               style={{ color: 'var(--accent-green)' }}
               className="hover:opacity-80 transition">
              trailverseteam@gmail.com
            </a>
          </p>
          <p className="mb-2">
            <strong>Website:</strong>{' '}
            <a href="https://www.nationalparksexplorerusa.com" 
               style={{ color: 'var(--accent-green)' }}
               className="hover:opacity-80 transition"
               target="_blank"
               rel="noopener noreferrer">
              www.nationalparksexplorerusa.com
            </a>
          </p>
        </>
      )
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Privacy Policy | TrailVerse"
        description="Privacy Policy for TrailVerse. Learn how we collect, use, and protect your personal information while you explore America's National Parks."
        keywords="privacy policy, data protection, TrailVerse, National Parks, user privacy"
      />
      
      <Header />
      
      <main className="pt-16">
        {/* Hero Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              style={{ color: 'var(--text-primary)' }}
            >
              Privacy Policy
            </h1>
            <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Your privacy is important to us. Learn how we protect your information.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <Lock className="h-4 w-4" />
              <span>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        </section>

        {/* Quick Summary Box */}
        <section className="pb-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl p-6 sm:p-8 backdrop-blur border-2"
              style={{
                backgroundColor: 'var(--accent-green)/5',
                borderColor: 'var(--accent-green)'
              }}
            >
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Shield className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                Privacy at a Glance
              </h2>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>We Collect</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Account info, favorites, reviews, AI conversations, usage data</p>
                </div>
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>We Never</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Sell your data, share without consent, store passwords unencrypted</p>
                </div>
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Your Rights</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Access, correct, delete, opt-out anytime from Profile Settings</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Sections */}
        <section className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {sections.map((section, index) => (
              <div 
                key={section.id}
                className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--accent-green)/10' }}
                    >
                      <section.icon className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                    </div>
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {index + 1}. {section.title}
                    </h2>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {section.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl p-8 sm:p-12 text-center backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <Shield className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Questions About Privacy?
              </h2>
              <p className="text-base mb-6 max-w-2xl mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                We&apos;re here to help. Contact us about any privacy concerns or questions.
              </p>
              <a
                href="mailto:trailverseteam@gmail.com"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition"
                style={{
                  backgroundColor: 'var(--accent-green)',
                  color: 'white'
                }}
              >
                <Shield className="h-5 w-5" />
                Contact Us
              </a>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default PrivacyPage;
