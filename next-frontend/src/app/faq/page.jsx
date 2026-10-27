import InfoPageHeader from '@/components/info/InfoPageHeader';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import FAQAccordionClient from './FAQAccordionClient';
import { FAQ_CATEGORIES } from '@/data/faqContent';
import { SUPPORT_EMAIL } from '@/lib/publicEmails';

export const metadata = {
  title: 'FAQ — Trailie, Trip Planning & TrailVerse Features',
  description: 'Answers about TrailVerse and Trailie — outdoor trip planning, 470+ park coverage, weather, community features, and getting started.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/faq',
  },
  openGraph: {
    title: 'FAQ — TrailVerse National Parks',
    description: 'Answers about TrailVerse and Trailie — outdoor trip planning, 470+ park coverage, weather, community features, and getting started.',
    url: 'https://www.nationalparksexplorerusa.com/faq',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'FAQ — TrailVerse National Parks',
    description: 'Answers about TrailVerse and Trailie — outdoor trip planning, 470+ park coverage, weather, community features, and getting started.',
  },
};

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_CATEGORIES.flatMap(category => category.questions.map(({ question, answer }) => ({
    '@type': 'Question', name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  }))),
};

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />

        <main className="info-page">
          <InfoPageHeader eyebrow="Help Center" icon="MessageSquare" iconColor="var(--icon-discovery)" title="Frequently Asked Questions" description={<>
                How TrailVerse works, what your account saves, and what to check before you travel.
              </>} />

          <FAQAccordionClient />

          <section className="info-section" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="public-content">
              <div
                className="public-editorial-section py-6 h-full"
                style={{
                  borderColor: 'var(--border)'
                }}
              >
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                  Still have questions?
                </h2>
                <p className="text-base mb-6 public-content" style={{ color: 'var(--text-secondary)' }}>
                  Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.
                </p>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="public-action public-action-secondary px-6 text-sm font-semibold">
                  Contact Support
                </a>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
