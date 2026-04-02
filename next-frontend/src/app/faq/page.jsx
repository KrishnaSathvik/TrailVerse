import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';
import FAQAccordionClient from './FAQAccordionClient';

export default function FAQPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main className="pt-3 sm:pt-16">
        <section className="py-8 sm:py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6" style={{ color: 'var(--text-primary)' }}>
              Frequently Asked Questions
            </h1>
            <p className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Find answers to common questions about TrailVerse and start planning your perfect park adventure.
            </p>
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            >
              <span>Still have questions? Email us</span>
            </div>
          </div>
        </section>

        <FAQAccordionClient />

        <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-4xl mx-auto">
            <div
              className="rounded-3xl p-8 sm:p-12 text-center backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
                Still have questions?
              </h2>
              <p className="text-base mb-6 max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.
              </p>
              <Button href="mailto:trailverseteam@gmail.com" variant="secondary" size="md">
                Contact Support
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
