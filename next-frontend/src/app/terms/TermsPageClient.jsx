import InfoPageHeader from '@/components/info/InfoPageHeader';
import LegalSections from '@/components/common/LegalSections';



export default function TermsPageContent() {
  const sections = [
    {
      id: "acceptance",
      title: "Acceptance of Terms",
      content: (
        <>
          <p className="mb-4">
            By accessing TrailVerse, you accept and agree to these Terms of Service and our Privacy Policy. 
            If you do not agree, please do not use our platform.
          </p>
          <p className="mb-4">
            TrailVerse helps users explore, plan, and discover America&apos;s 470+ parks and sites through 
            Smart trip planning, real-time weather, interactive maps, and community-driven content.
          </p>
        </>
      )
    },
    {
      id: "license",
      title: "Use License",
      content: (
        <>
          <p className="mb-4">
            We grant you a personal, non-exclusive, non-transferable license to use TrailVerse for personal, 
            non-commercial purposes. You may NOT:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Use the platform for commercial purposes without written consent</li>
            <li>Copy, modify, or create derivative works</li>
            <li>Use unauthorized bots or scrapers to access or collect data; the provided ChatGPT app and MCP connector are permitted within their published access and usage limits</li>
            <li>Reverse engineer or decompile any software</li>
            <li>Remove copyright or proprietary notices</li>
          </ul>
        </>
      )
    },
    {
      id: "accounts",
      title: "User Accounts",
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
            <li>Always verify critical information with the National Park Service or the relevant destination authority</li>
          </ul>
        </>
      )
    },
    {
      id: "access-sharing",
      title: "Access, Connected Apps & Sharing",
      content: (
        <>
          <p className="mb-4">These terms cover TrailVerse website features, Trailie text and voice planning, and our tools accessed through ChatGPT or Claude. Guest allowances, rate limits, data coverage, and host-app availability can differ. A free TrailVerse account does not include a third-party subscription.</p>
          <p className="mb-4">Our planning tools provide information and suggestions; they do not make reservations, purchase permits, or guarantee availability. Connected-app conversations do not automatically sync to website trip history.</p>
          <p className="mb-4">A public trip link exposes the shared itinerary and conversation to anyone with the link. Review it before sharing. Reviews and approved testimonials are public. See the Privacy Policy for processing, retention, and account deletion details.</p>
          <p className="mb-4">Installing the web app does not make all features available offline. Download a plan before travel; chat, account requests, and current conditions require internet access.</p>
        </>
      )
    },
    {
      id: "content",
      title: "User Content & Reviews",
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
      content: (
        <>
          <p className="mb-4">TrailVerse integrates with third-party services:</p>
          <div className="grid gap-3 mb-4">
            <div className="p-3 rounded-lg border text-sm" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <strong>Google:</strong> Maps and Analytics where configured; map services may also use MapTiler. These providers have their own terms and privacy policies.
            </div>
            <div className="p-3 rounded-lg border text-sm" style={{ backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)' }}>
              <strong>AI:</strong> OpenAI processes current website planning requests and voice audio. Anthropic may process requests through other configured AI features. Requests are not guaranteed to be anonymous; their terms and privacy policies also apply.
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
      content: (
        <>
          <p className="mb-4">
            We may update these Terms periodically. Changes will be posted here.
            Please review the updated terms when posted. Continued use after changes constitutes acceptance.
          </p>
        </>
      )
    },
    {
      id: "contact",
      title: "Contact & Support",
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
    <>
      <main className="info-page info-legal">
        <InfoPageHeader title="Terms of Service" description="Please read these terms carefully before using TrailVerse." />

        <LegalSections sections={sections} />

        {/* Safety Notice */}
        <section className="info-section">
          <div className="max-w-6xl mx-auto">
            <div className="info-panel"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--accent-orange)'
              }}
            >
              <div>
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
        </section>

        {/* Contact CTA */}
        <section className="info-section">
          <div className="max-w-6xl mx-auto">
            <div className="public-editorial-section py-8"
              style={{
                borderColor: 'var(--border)'
              }}
            >
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Questions About Terms?
              </h2>
              <p className="text-base mb-6 public-content"
                style={{ color: 'var(--text-secondary)' }}
              >
                Need clarification on our terms? We&apos;re here to help.
              </p>
              <a
                href="mailto:trailverseteam@gmail.com"
                className="inline-flex items-center gap-2 px-6 py-3 public-action rounded-xl font-semibold transition"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Contact Us
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

