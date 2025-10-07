import React from 'react';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import SEO from '../components/common/SEO';
import { useTheme } from '../context/ThemeContext';

const TermsPage = () => {
  useTheme();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SEO
        title="Terms of Service - TrailVerse"
        description="Terms of Service for TrailVerse. Read our terms and conditions for using our platform."
      />
      
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <h1 
            className="text-4xl font-bold mb-8"
            style={{ color: 'var(--text-primary)' }}
          >
            Terms of Service
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
                Acceptance of Terms
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                By accessing and using TrailVerse (&quot;TrailVerse&quot;), you accept and agree 
                to be bound by the terms and provision of this agreement.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Use License
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Permission is granted to temporarily use TrailVerse for personal, non-commercial transitory 
                viewing only. This is the grant of a license, not a transfer of title, and under this 
                license you may not:
              </p>
              <ul className="list-disc pl-6 mb-4" style={{ color: 'var(--text-secondary)' }}>
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose or for any public display</li>
                <li>Attempt to reverse engineer any software contained on the website</li>
                <li>Remove any copyright or other proprietary notations from the materials</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                User Accounts
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                When you create an account with us, you must provide information that is accurate, 
                complete, and current at all times. You are responsible for safeguarding the password 
                and for all activities that occur under your account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Prohibited Uses
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                You may not use our service:
              </p>
              <ul className="list-disc pl-6 mb-4" style={{ color: 'var(--text-secondary)' }}>
                <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
                <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
                <li>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</li>
                <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                <li>To submit false or misleading information</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Content
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                Our service allows you to post, link, store, share and otherwise make available certain 
                information, text, graphics, videos, or other material. You are responsible for the content 
                that you post to the service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Disclaimer
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                The information on this website is provided on an &quot;as is&quot; basis. To the fullest extent 
                permitted by law, TrailVerse excludes all representations, warranties, conditions and terms 
                relating to our website and the use of this website.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Limitations
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                In no event shall TrailVerse or its suppliers be liable for any damages (including, without 
                limitation, damages for loss of data or profit, or due to business interruption) arising 
                out of the use or inability to use the materials on TrailVerse.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Governing Law
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                These terms and conditions are governed by and construed in accordance with the laws of 
                the United States and you irrevocably submit to the exclusive jurisdiction of the courts 
                in that state or location.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                Contact Information
              </h2>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
                If you have any questions about these Terms of Service, please contact us through our website.
              </p>
            </section>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default TermsPage;
