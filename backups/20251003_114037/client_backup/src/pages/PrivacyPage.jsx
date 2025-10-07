import React from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';

const PrivacyPage = () => {
  const { isDark } = useTheme();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Privacy Policy - TrailVerse"
        description="Privacy Policy for TrailVerse. Learn how we collect, use, and protect your personal information."
      />
      
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <h1 
            className="text-4xl font-bold mb-8"
            style={{ color: 'var(--text-primary)' }}
          >
            Privacy Policy
          </h1>
          
          <div 
            className="prose prose-lg max-w-none"
            style={{ color: 'var(--text-primary)' }}
          >
            <p className="text-lg mb-6" style={{ color: 'var(--text-secondary)' }}>
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Information We Collect
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                We collect information you provide directly to us, such as when you create an account, 
                make a reservation, or contact us for support.
              </p>
              <ul className="list-disc pl-6 mb-4" style={{ color: 'var(--text-secondary)' }}>
                <li>Account information (name, email address, password)</li>
                <li>Profile information and preferences</li>
                <li>Communication data when you contact us</li>
                <li>Usage data and analytics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                How We Use Your Information
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 mb-4" style={{ color: 'var(--text-secondary)' }}>
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Monitor and analyze trends and usage</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Information Sharing
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                We do not sell, trade, or otherwise transfer your personal information to third parties 
                without your consent, except as described in this policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Data Security
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                We implement appropriate security measures to protect your personal information against 
                unauthorized access, alteration, disclosure, or destruction.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Your Rights
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                You have the right to access, update, or delete your personal information. You may also 
                opt out of certain communications from us.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Contact Us
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                If you have any questions about this Privacy Policy, please contact us through our website.
              </p>
            </section>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default PrivacyPage;
