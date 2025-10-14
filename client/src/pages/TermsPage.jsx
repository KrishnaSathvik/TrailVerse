import React from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';
import { FileText, Shield, AlertTriangle, CheckCircle } from '@components/icons';

const TermsPage = () => {
  useTheme();

  const sections = [
    {
      id: "acceptance",
      title: "Acceptance of Terms",
      icon: CheckCircle,
      content: (
        <>
          <p className="mb-4">
            By accessing TrailVerse, you accept and agree to these Terms of Service and our Privacy Policy. 
            If you do not agree, please do not use our platform.
          </p>
          <p className="mb-4">
            TrailVerse helps users explore, plan, and discover America&apos;s 470+ National Parks through 
            AI-powered trip planning, real-time weather, interactive maps, and community-driven content.
          </p>
        </>
      )
    },
    {
      id: "license",
      title: "Use License",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">
            We grant you a personal, non-exclusive, non-transferable license to use TrailVerse for personal, 
            non-commercial purposes. You may NOT:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Use the platform for commercial purposes without written consent</li>
            <li>Copy, modify, or create derivative works</li>
            <li>Use automated tools (bots, scrapers) to access or collect data</li>
            <li>Reverse engineer or decompile any software</li>
            <li>Remove copyright or proprietary notices</li>
          </ul>
        </>
      )
    },
    {
      id: "accounts",
      title: "User Accounts",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">When creating an account, you agree to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Provide accurate and current information</li>
            <li>Maintain password security and accept risks of unauthorized access</li>
            <li>Notify us immediately of any security breaches</li>
            <li>Be responsible for all account activities</li>
          </ul>
          <p className="mb-4">
            You must be at least 13 years old. Users under 18 need parental consent.
          </p>
        </>
      )
    },
    {
      id: "ai-services",
      title: "AI Services Disclaimer",
      icon: AlertTriangle,
      content: (
        <>
          <p className="mb-4">
            AI-generated trip recommendations are suggestions only. You acknowledge that:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>AI itineraries and recommendations should be verified before use</li>
            <li>Weather, trail conditions, and park information can change rapidly</li>
            <li>You are solely responsible for your safety and preparedness when visiting parks</li>
            <li>TrailVerse is not responsible for outdoor activities, travel decisions, or incidents during trips</li>
            <li>Always verify critical information with official National Park Service sources</li>
          </ul>
        </>
      )
    },
    {
      id: "content",
      title: "User Content & Reviews",
      icon: FileText,
      content: (
        <>
          <p className="mb-4">When posting reviews, comments, or content, you:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Grant TrailVerse a worldwide, royalty-free license to use and display your content</li>
            <li>Represent that you own or have rights to all content and images</li>
            <li>Agree to post honest reviews based on actual experiences</li>
            <li>Will not post false, misleading, spam, or harmful content</li>
          </ul>
          
          <h3 className="text-lg font-semibold mb-3 mt-4">Image Upload Policy</h3>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Upload up to 5 images per park review (JPEG, PNG, GIF, WebP, max 10MB each)</li>
            <li>Images are automatically optimized and converted to WebP</li>
            <li>You must own rights to all uploaded images</li>
            <li>Images must be appropriate and relevant to the park</li>
          </ul>

          <h3 className="text-lg font-semibold mb-3 mt-4">Comments & Community</h3>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Blog comments support nested replies, likes, and edits</li>
            <li>Respectful and constructive engagement is required</li>
            <li>Testimonials are subject to admin moderation before display</li>
            <li>We reserve the right to remove inappropriate content without notice</li>
          </ul>
        </>
      )
    },
    {
      id: "prohibited",
      title: "Prohibited Uses",
      icon: AlertTriangle,
      content: (
        <>
          <p className="mb-4">You may not use TrailVerse to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Violate any laws or regulations</li>
            <li>Infringe intellectual property rights</li>
            <li>Harass, abuse, or harm others</li>
            <li>Submit false or fraudulent information</li>
            <li>Distribute malware or harmful code</li>
            <li>Interfere with platform operations</li>
            <li>Impersonate others or collect user data without consent</li>
          </ul>
        </>
      )
    },
    {
      id: "third-party",
      title: "Third-Party Services",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">TrailVerse integrates with third-party services:</p>
          <div className="grid gap-3 mb-4">
            <div className="p-3 rounded-lg border text-sm" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <strong>Google:</strong> Maps JavaScript API, Places API, Directions API, Analytics 4 (subject to Google's Terms & Privacy)
            </div>
            <div className="p-3 rounded-lg border text-sm" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <strong>AI:</strong> OpenAI GPT-4, Anthropic Claude (anonymized queries, subject to their Terms & Privacy)
            </div>
            <div className="p-3 rounded-lg border text-sm" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <strong>APIs:</strong> National Park Service API, OpenWeather API (public data, subject to their terms)
            </div>
          </div>
          <p className="mb-4 text-sm">
            These services have their own terms and privacy policies. TrailVerse is not responsible for third-party content or services.
          </p>
        </>
      )
    },
    {
      id: "limitation",
      title: "Limitation of Liability",
      icon: AlertTriangle,
      content: (
        <>
          <p className="mb-4">
            TrailVerse is provided &quot;as is&quot; without warranties of any kind. We are not liable for:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Outdoor activities, injuries, or accidents during park visits</li>
            <li>Accuracy of AI recommendations, weather data, or park information</li>
            <li>Service interruptions, errors, or data loss</li>
            <li>Decisions made based on platform content</li>
            <li>Third-party service failures or issues</li>
          </ul>
          <p className="mb-4 text-sm italic">
            Maximum liability is limited to the amount you paid for TrailVerse services (currently free).
          </p>
        </>
      )
    },
    {
      id: "intellectual",
      title: "Intellectual Property",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">
            The TrailVerse platform, including design, features, content, and technology, is protected by copyright 
            and intellectual property laws. The TrailVerse name, logo, and marks are trademarks and may not be used without permission.
          </p>
        </>
      )
    },
    {
      id: "changes",
      title: "Changes to Terms",
      icon: FileText,
      content: (
        <>
          <p className="mb-4">
            We may update these Terms periodically. Changes will be posted with an updated date. 
            Significant changes will be notified via email. Continued use after changes constitutes acceptance.
          </p>
        </>
      )
    },
    {
      id: "contact",
      title: "Contact & Support",
      icon: Shield,
      content: (
        <>
          <p className="mb-4">Questions about these Terms?</p>
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
        title="Terms of Service | TrailVerse"
        description="Terms of Service for TrailVerse. Read our terms and conditions for using our National Parks exploration platform."
        keywords="terms of service, legal, terms and conditions, TrailVerse, National Parks"
      />
      
      <Header />
      
      <main className="pt-16">
        {/* Hero Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
              style={{ backgroundColor: 'var(--accent-green)' }}
            >
              <FileText className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              style={{ color: 'var(--text-primary)' }}
            >
              Terms of Service
            </h1>
            <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Please read these terms carefully before using TrailVerse.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <FileText className="h-4 w-4" />
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
                <FileText className="h-6 w-6" style={{ color: 'var(--accent-green)' }} />
                Terms Summary
              </h2>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>You Can</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Use for personal trips, save parks, write reviews, use AI planning</p>
                </div>
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>You Cannot</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Use commercially, scrape data, post false content, harass users</p>
                </div>
                <div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Important</p>
                  <p style={{ color: 'var(--text-secondary)' }}>AI suggestions are guidance only - verify before trips</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Terms Sections */}
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

        {/* Safety Notice */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl p-6 sm:p-8 backdrop-blur border-2"
              style={{
                backgroundColor: 'var(--accent-orange)/5',
                borderColor: 'var(--accent-orange)'
              }}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-orange)' }}
                >
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Important Safety Notice
                  </h3>
                  <p className="mb-3" style={{ color: 'var(--text-secondary)' }}>
                    National Parks can be dangerous. Always check official NPS websites for current conditions, 
                    closures, and safety warnings before your trip. Our AI recommendations and weather data are helpful 
                    guides but not substitutes for official information and proper preparation.
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    You are solely responsible for your safety, decisions, and preparedness when visiting parks. 
                    TrailVerse provides information to help plan trips but cannot guarantee accuracy or safety.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl p-8 sm:p-12 text-center backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <FileText className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Questions About Terms?
              </h2>
              <p className="text-base mb-6 max-w-2xl mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                Need clarification on our terms? We&apos;re here to help.
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

export default TermsPage;
