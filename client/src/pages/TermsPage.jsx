import React from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';
import { FileText, Shield } from 'lucide-react';

const TermsPage = () => {
  useTheme();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Terms of Service | TrailVerse"
        description="Terms of Service for TrailVerse. Read our terms and conditions for using our National Parks exploration platform and AI trip planning services."
        keywords="terms of service, legal, terms and conditions, TrailVerse, National Parks"
      />
      
      <Header />
      
      <main className="pt-16">
        {/* Hero Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            Terms of Service
          </h1>
            <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Please read these terms carefully before using TrailVerse. By accessing our platform, 
              you agree to be bound by these terms and conditions.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <FileText className="h-4 w-4" />
              <span>Last updated: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              {/* Acceptance of Terms */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    1. Acceptance of Terms
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    By accessing and using TrailVerse, you accept and agree to be bound by these 
                    Terms of Service and our Privacy Policy. If you do not agree to these terms, 
                    please do not use our platform.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse is a platform dedicated to helping users explore, plan, and discover 
                    America&apos;s 470+ National Parks, Monuments, and Historic Sites through AI-powered 
                    trip planning, real-time weather data, and community-driven content.
                  </p>
                </div>
              </div>

              {/* Use License */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    2. Use License
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse grants you a personal, non-exclusive, non-transferable, limited license 
                    to access and use our platform for personal, non-commercial purposes. Under this 
                    license, you may not:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Modify, copy, or create derivative works based on our platform</li>
                    <li>Use the platform for any commercial purpose without our written consent</li>
                    <li>Attempt to reverse engineer, decompile, or disassemble any software</li>
                    <li>Remove any copyright, trademark, or other proprietary notices</li>
                    <li>Use automated tools (bots, scrapers) to access or collect data from our platform</li>
                    <li>Circumvent any security features or access restrictions</li>
                  </ul>
                </div>
              </div>

              {/* User Accounts */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    3. User Accounts
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    When you create an account with TrailVerse, you agree to:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Provide accurate, complete, and current information</li>
                    <li>Maintain and promptly update your account information</li>
                    <li>Maintain the security of your password and accept all risks of unauthorized access</li>
                    <li>Notify us immediately of any unauthorized use of your account</li>
                    <li>Be responsible for all activities that occur under your account</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You must be at least 13 years old to create an account. If you are under 18, 
                    you represent that you have your parent or guardian&apos;s permission to use TrailVerse.
                  </p>
                </div>
              </div>

              {/* AI Trip Planning & Services */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    4. AI Trip Planning & Services
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse provides AI-powered trip planning recommendations and real-time information. 
                    You acknowledge that:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>AI-generated itineraries and recommendations are suggestions only and should be verified before use</li>
                    <li>Weather data and park conditions can change rapidly and should be verified with official sources</li>
                    <li>Trail conditions, closures, and safety information should be confirmed with the National Park Service</li>
                    <li>TrailVerse is not responsible for outdoor activities, travel decisions, or any incidents during your trips</li>
                    <li>You are solely responsible for your safety and preparedness when visiting National Parks</li>
                  </ul>
                </div>
              </div>

              {/* User Content & Reviews */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    5. User Content & Reviews
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    When you post reviews, comments, or other content on TrailVerse:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>You grant TrailVerse a worldwide, non-exclusive, royalty-free license to use, display, and distribute your content</li>
                    <li>You represent that you own or have rights to the content you post</li>
                    <li>You agree not to post false, misleading, defamatory, or harmful content</li>
                    <li>You agree to post honest reviews based on your actual experiences</li>
                    <li>You will not post spam, advertisements, or promotional content without permission</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse reserves the right to remove any content that violates these terms or 
                    is otherwise inappropriate.
                  </p>
                </div>
              </div>

              {/* Local Storage and Data Storage */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    6. Local Storage and Data Storage
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse uses browser local storage (similar to cookies) to provide functionality. 
                    By using our platform, you consent to our use of local storage for:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Authentication and security purposes</li>
                    <li>Remembering your preferences and settings</li>
                    <li>Storing your favorite parks and trip history</li>
                    <li>Maintaining AI conversation context</li>
                    <li>Improving platform performance through caching</li>
                    <li>Analytics and usage tracking (with your consent)</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You can control local storage preferences through our cookie consent banner 
                    or your browser settings. Disabling local storage may limit platform functionality.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    For detailed information about data storage, please review our{' '}
                    <a href="/privacy" 
                       style={{ color: 'var(--accent-green)' }}
                       className="hover:opacity-80 transition">
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              </div>

              {/* Prohibited Uses */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    7. Prohibited Uses
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You may not use TrailVerse to:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Violate any local, state, national, or international law</li>
                    <li>Infringe upon intellectual property rights of TrailVerse or others</li>
                    <li>Harass, abuse, threaten, or discriminate against others</li>
                    <li>Submit false, misleading, or fraudulent information</li>
                    <li>Distribute malware, viruses, or other harmful code</li>
                    <li>Interfere with or disrupt the platform or servers</li>
                    <li>Impersonate another person or entity</li>
                    <li>Collect or harvest data from other users without consent</li>
              </ul>
                </div>
              </div>

              {/* Intellectual Property */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    8. Intellectual Property
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    The TrailVerse platform, including its design, features, content, and technology, 
                    is protected by copyright, trademark, and other intellectual property laws. All 
                    rights not expressly granted to you are reserved by TrailVerse.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    The TrailVerse name, logo, and related marks are trademarks of TrailVerse and 
                    may not be used without permission.
                  </p>
                </div>
              </div>

              {/* Third-Party Services */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    9. Third-Party Services
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse integrates with third-party services including the National Park Service 
                    API, weather data providers, and AI services. We are not responsible for the 
                    accuracy, availability, or content provided by these third-party services.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Links to external websites are provided for convenience and do not constitute 
                    an endorsement of their content or practices.
                  </p>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    10. Disclaimer of Warranties
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse is provided &quot;as is&quot; and &quot;as available&quot; without any warranties 
                    of any kind, either express or implied. We do not warrant that:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>The platform will be uninterrupted, secure, or error-free</li>
                    <li>The information provided will be accurate, complete, or up-to-date</li>
                    <li>Any defects will be corrected</li>
                    <li>The platform will meet your specific requirements</li>
                  </ul>
                </div>
              </div>

              {/* Limitation of Liability */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    11. Limitation of Liability
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    To the fullest extent permitted by law, TrailVerse and its creators, contributors, 
                    and partners shall not be liable for any indirect, incidental, special, consequential, 
                    or punitive damages, including but not limited to:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Loss of profits, data, or business opportunities</li>
                    <li>Personal injury or property damage during travel or outdoor activities</li>
                    <li>Reliance on information or recommendations provided by the platform</li>
                    <li>Unauthorized access to or alteration of your data</li>
                    <li>Any other matter relating to the platform</li>
              </ul>
                </div>
              </div>

              {/* Indemnification */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    12. Indemnification
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You agree to indemnify, defend, and hold harmless TrailVerse, its creators, and 
                    contributors from any claims, damages, losses, liabilities, and expenses (including 
                    legal fees) arising from your use of the platform, violation of these terms, or 
                    infringement of any rights of another party.
                  </p>
                </div>
              </div>

              {/* Termination */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    13. Termination
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We reserve the right to suspend or terminate your access to TrailVerse at any time, 
                    without notice, for conduct that we believe violates these terms or is harmful to 
                    other users, us, or third parties, or for any other reason.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You may terminate your account at any time by contacting us. Upon termination, 
                    your right to use the platform will immediately cease.
                  </p>
                </div>
              </div>

              {/* Changes to Terms */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    14. Changes to Terms
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We reserve the right to modify these Terms of Service at any time. We will notify 
                    users of any material changes by updating the &quot;Last updated&quot; date at the top 
                    of this page. Your continued use of TrailVerse after changes become effective 
                    constitutes acceptance of the modified terms.
                  </p>
                </div>
              </div>

              {/* Governing Law */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    15. Governing Law
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    These Terms of Service shall be governed by and construed in accordance with the 
                    laws of the United States, without regard to its conflict of law provisions. Any 
                    disputes arising from these terms or your use of TrailVerse shall be subject to 
                    the exclusive jurisdiction of the courts in the United States.
                  </p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    16. Contact Us
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    If you have any questions, concerns, or feedback about these Terms of Service, 
                    please contact us at{' '}
                    <a href="mailto:trailverseteam@gmail.com" 
                       style={{ color: 'var(--accent-green)' }}
                       className="hover:opacity-80 transition">
                      trailverseteam@gmail.com
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
            </section>

        {/* Safety Notice CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
                Your Safety Matters
              </h2>
              <p className="text-base mb-6 max-w-2xl mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                TrailVerse is a planning and discovery tool. Always check official National Park Service 
                websites, verify current conditions, and prepare properly for outdoor activities. Your 
                safety is your responsibility.
              </p>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default TermsPage;
