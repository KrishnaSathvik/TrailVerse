import React from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';
import { Shield, Lock } from 'lucide-react';

const PrivacyPage = () => {
  useTheme();

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
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              style={{ color: 'var(--text-primary)' }}
            >
              Privacy Policy
            </h1>
            <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Your privacy is important to us. Learn how we collect, use, and protect your personal information 
              while you explore America&apos;s National Parks with TrailVerse.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <Lock className="h-4 w-4" />
              <span>Last updated: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              {/* Introduction */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    1. Introduction
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. 
                    This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
                    when you use our National Parks exploration platform.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    By using TrailVerse, you agree to the collection and use of information in accordance 
                    with this policy. If you do not agree with our policies and practices, please do not 
                    use our platform.
                  </p>
                </div>
              </div>

              {/* Information We Collect */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    2. Information We Collect
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We collect several types of information to provide and improve our services:
                  </p>
                  
                  <h3 className="text-lg font-semibold mb-2 mt-4" style={{ color: 'var(--text-primary)' }}>
                    2.1 Information You Provide
                  </h3>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Account Information:</strong> Name, email address, and password when you create an account</li>
                    <li><strong>Profile Data:</strong> Optional profile information, preferences, and settings</li>
                    <li><strong>Park Preferences:</strong> Parks you favorite, mark as visited, or save for future trips</li>
                    <li><strong>Trip Planning Data:</strong> Travel dates, interests, fitness levels, and preferences for AI-generated itineraries</li>
                    <li><strong>User Content:</strong> Reviews, comments, ratings, photos, and other content you post</li>
                    <li><strong>Communications:</strong> Messages you send to us, including support requests and feedback</li>
                  </ul>

                  <h3 className="text-lg font-semibold mb-2 mt-4" style={{ color: 'var(--text-primary)' }}>
                    2.2 Automatically Collected Information
                  </h3>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and interaction patterns</li>
                    <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers</li>
                    <li><strong>Location Data:</strong> Approximate location based on IP address (we do not track precise GPS location)</li>
                    <li><strong>Cookies & Similar Technologies:</strong> Data stored in cookies, local storage, and session storage</li>
                    <li><strong>Analytics Data:</strong> Aggregated usage statistics to improve our platform</li>
                  </ul>

                  <h3 className="text-lg font-semibold mb-2 mt-4" style={{ color: 'var(--text-primary)' }}>
                    2.3 Third-Party Information
                  </h3>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>National Park Service:</strong> Public park information, events, and alerts via NPS API</li>
                    <li><strong>Weather Data:</strong> Weather information from OpenWeather API based on park locations</li>
                    <li><strong>AI Services:</strong> Anonymized data sent to OpenAI for trip planning (does not include personal identifiers)</li>
                  </ul>
                </div>
              </div>

              {/* How We Use Your Information */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    3. How We Use Your Information
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We use the information we collect to:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Provide, maintain, and improve our AI trip planning services and features</li>
                    <li>Create personalized park recommendations and itineraries based on your preferences</li>
                    <li>Track your favorite parks, visited parks, and travel history</li>
                    <li>Display relevant weather information and park alerts</li>
                    <li>Enable you to share reviews, photos, and experiences with the community</li>
                    <li>Send important account notifications, technical notices, and support messages</li>
                    <li>Respond to your comments, questions, and customer support requests</li>
                    <li>Monitor and analyze usage trends, patterns, and platform performance</li>
                    <li>Detect, prevent, and address technical issues, fraud, and security threats</li>
                    <li>Comply with legal obligations and enforce our Terms of Service</li>
                    <li>Improve user experience and develop new features</li>
                  </ul>
                </div>
              </div>

              {/* Information Sharing and Disclosure */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    4. Information Sharing and Disclosure
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We do not sell, trade, or rent your personal information to third parties. We may share 
                    your information only in the following circumstances:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Service Providers:</strong> Trusted third-party vendors who help us operate our platform (MongoDB for database hosting, Vercel for frontend hosting, Render for backend hosting, OpenAI for AI services)</li>
                    <li><strong>Public Content:</strong> Reviews, ratings, and content you choose to post publicly are visible to other users</li>
                    <li><strong>Legal Requirements:</strong> When required by law, court order, or to protect rights, safety, and security</li>
                    <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets (you will be notified)</li>
                    <li><strong>With Your Consent:</strong> When you explicitly authorize us to share specific information</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    All service providers are contractually obligated to maintain the confidentiality and 
                    security of your information.
                  </p>
                </div>
              </div>

              {/* Data Security */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    5. Data Security
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We implement industry-standard security measures to protect your personal information:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Password encryption using industry-standard hashing algorithms (bcrypt)</li>
                    <li>HTTPS/SSL encryption for all data transmitted between your browser and our servers</li>
                    <li>Secure database hosting on MongoDB Atlas with encryption at rest and in transit</li>
                    <li>Regular security updates and vulnerability assessments</li>
                    <li>Access controls and authentication requirements for sensitive operations</li>
                    <li>Monitoring for suspicious activity and unauthorized access attempts</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    However, no method of transmission over the Internet or electronic storage is 100% secure. 
                    While we strive to protect your information, we cannot guarantee absolute security.
                  </p>
                </div>
              </div>

              {/* Data Retention */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    6. Data Retention
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We retain your personal information for as long as necessary to provide our services 
                    and fulfill the purposes outlined in this Privacy Policy, unless a longer retention 
                    period is required or permitted by law.
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Account Data:</strong> Retained while your account is active and for a reasonable period after deletion</li>
                    <li><strong>Usage Data:</strong> Typically retained for 12-24 months for analytics purposes</li>
                    <li><strong>Communications:</strong> Retained as necessary to provide support and comply with legal obligations</li>
                    <li><strong>Public Content:</strong> May be retained even after account deletion if others have engaged with it</li>
                  </ul>
                </div>
              </div>

              {/* Your Privacy Rights */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    7. Your Privacy Rights
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You have the following rights regarding your personal information:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                    <li><strong>Correction:</strong> Update or correct inaccurate or incomplete information</li>
                    <li><strong>Deletion:</strong> Request deletion of your account and personal data</li>
                    <li><strong>Opt-Out:</strong> Unsubscribe from marketing emails and notifications</li>
                    <li><strong>Data Portability:</strong> Request a copy of your data in a portable format</li>
                    <li><strong>Restriction:</strong> Request that we limit how we use your information</li>
                    <li><strong>Objection:</strong> Object to certain uses of your information</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    To exercise these rights, please contact us at{' '}
                    <a href="mailto:trailverseteam@gmail.com" 
                       style={{ color: 'var(--accent-green)' }}
                       className="hover:opacity-80 transition">
                      trailverseteam@gmail.com
                    </a>
                    {' '}or manage your preferences in your account settings.
                  </p>
                </div>
              </div>

              {/* Cookies and Local Storage */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    8. Cookies and Local Storage
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse uses browser local storage (similar to cookies) to enhance your experience. 
                    We do not use traditional HTTP cookies, but local storage serves the same purpose 
                    of storing data on your device.
                  </p>

                  <h3 className="text-lg font-semibold mb-3 mt-6" style={{ color: 'var(--text-primary)' }}>
                    8.1 Types of Data We Store
                  </h3>
                  <div className="space-y-4 mb-6">
                    <div 
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Essential Storage (Always Active)
                      </h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <li>Authentication tokens - Keep you logged in securely</li>
                        <li>User account information - Basic profile data</li>
                        <li>Session management - Maintain secure sessions</li>
                        <li>Security data - Prevent fraud and unauthorized access</li>
                      </ul>
                    </div>

                    <div 
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Functional Storage (Optional)
                      </h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <li>Theme preferences - Remember your dark/light mode choice</li>
                        <li>Favorite parks - Save parks you want to visit</li>
                        <li>Trip history - Store AI-generated trip plans</li>
                        <li>AI chat state - Preserve conversation context</li>
                        <li>Saved events - Bookmark park events</li>
                        <li>User preferences - Personal settings and configurations</li>
                      </ul>
                    </div>

                    <div 
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Analytics Storage (Optional)
                      </h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <li>Analytics session ID - Track usage patterns</li>
                        <li>Google Analytics data - Improve platform performance</li>
                        <li>Usage statistics - Understand how features are used</li>
                      </ul>
                    </div>

                    <div 
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Performance Storage (Optional)
                      </h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <li>Park data cache - Faster loading of park information</li>
                        <li>Performance reports - Monitor app speed and errors</li>
                        <li>API response cache - Reduce server load and improve speed</li>
                      </ul>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    8.2 Managing Your Cookie Preferences
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    When you first visit TrailVerse, you'll see a cookie consent banner where you can:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Accept All</strong> - Enable all features and data storage</li>
                    <li><strong>Reject All</strong> - Only essential features (limited functionality)</li>
                    <li><strong>Customize</strong> - Choose specific categories to enable/disable</li>
                  </ul>

                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    8.3 Browser Controls
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You can also control local storage through your browser settings:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Chrome:</strong> Settings → Privacy and security → Site settings → View permissions and data stored across sites</li>
                    <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data → Manage Data</li>
                    <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
                    <li><strong>Edge:</strong> Settings → Cookies and site permissions → Manage and delete cookies and site data</li>
                  </ul>

                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    8.4 Impact of Disabling Storage
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    If you disable local storage or reject non-essential categories:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>You'll need to log in each time you visit</li>
                    <li>Your theme preferences won't be saved</li>
                    <li>Favorite parks and trip history won't persist</li>
                    <li>AI conversations won't be saved between sessions</li>
                    <li>Park data will load slower (no caching)</li>
                    <li>We won't collect analytics data about your usage</li>
                  </ul>

                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    8.5 Third-Party Cookies
                  </h3>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse may use third-party services that set their own cookies:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>Google Analytics</strong> - Only if you consent to analytics</li>
                    <li><strong>OpenAI API</strong> - For AI trip planning (no personal data sent)</li>
                    <li><strong>National Park Service API</strong> - For park data (no cookies set)</li>
                    <li><strong>Weather Services</strong> - For real-time weather data (no cookies set)</li>
                  </ul>

                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    You can opt out of Google Analytics tracking by rejecting analytics cookies 
                    in our consent banner, or by using browser extensions like Google Analytics Opt-out.
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
                    TrailVerse integrates with third-party services to provide functionality:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li><strong>National Park Service API:</strong> Public park data, events, and information</li>
                    <li><strong>OpenWeather API:</strong> Real-time weather data for park locations</li>
                    <li><strong>OpenAI API:</strong> AI-powered trip planning (anonymized data only)</li>
                    <li><strong>Google Analytics:</strong> Usage analytics and platform performance monitoring</li>
                    <li><strong>MongoDB Atlas:</strong> Secure database hosting and storage</li>
                    <li><strong>Vercel & Render:</strong> Platform hosting and deployment</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    These services have their own privacy policies. We encourage you to review them.
                  </p>
                </div>
              </div>

              {/* Children's Privacy */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    10. Children&apos;s Privacy
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse is not intended for children under the age of 13. We do not knowingly 
                    collect personal information from children under 13. If you are a parent or guardian 
                    and believe your child has provided us with personal information, please contact us 
                    immediately so we can delete such information.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Users between 13 and 18 should have parental or guardian consent before using TrailVerse.
                  </p>
                </div>
              </div>

              {/* Changes to Privacy Policy */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    11. Changes to This Privacy Policy
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We may update this Privacy Policy from time to time to reflect changes in our practices, 
                    technologies, legal requirements, or other factors. We will notify you of any material 
                    changes by:
                  </p>
                  <ul className="list-disc pl-6 mb-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                    <li>Updating the &quot;Last updated&quot; date at the top of this policy</li>
                    <li>Sending you an email notification (if you have an account)</li>
                    <li>Displaying a prominent notice on our platform</li>
                  </ul>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Your continued use of TrailVerse after changes become effective constitutes acceptance 
                    of the updated Privacy Policy.
                  </p>
                </div>
              </div>

              {/* International Users */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    12. International Users
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    TrailVerse is operated from the United States. If you are accessing our platform from 
                    outside the United States, please be aware that your information may be transferred to, 
                    stored, and processed in the United States where our servers and service providers are 
                    located.
                  </p>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    By using TrailVerse, you consent to the transfer of your information to the United States 
                    and agree to be governed by United States data protection laws and regulations.
                  </p>
                </div>
              </div>

              {/* Contact Us */}
              <div className="rounded-xl overflow-hidden backdrop-blur"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)'
                }}
              >
                <div className="p-6">
                  <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                    13. Contact Us
                  </h2>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    If you have any questions, concerns, or requests regarding this Privacy Policy or our 
                    data practices, please contact us at:
                  </p>
                  <div className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    <p className="mb-2">
                      <strong>Email:</strong>{' '}
                      <a href="mailto:trailverseteam@gmail.com" 
                         style={{ color: 'var(--accent-green)' }}
                         className="hover:opacity-80 transition">
                        trailverseteam@gmail.com
                      </a>
                    </p>
                    <p className="mb-2"><strong>Service:</strong> TrailVerse</p>
                    <p><strong>Platform:</strong> National Parks Explorer USA</p>
                  </div>
                  <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                    We will respond to your inquiry within a reasonable timeframe, typically within 
                    5-10 business days.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Commitment CTA */}
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
                Your Privacy Matters
              </h2>
              <p className="text-base mb-6 max-w-2xl mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                We are committed to protecting your privacy and being transparent about our data practices. 
                Your trust is essential to our mission of helping you explore America&apos;s National Parks.
              </p>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default PrivacyPage;
