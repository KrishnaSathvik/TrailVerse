import { Suspense } from 'react';
import NewsletterSignupSlot from './NewsletterSignupSlot';

export default function NewsletterLanding() {
  return (
    <section id="newsletter" className="where-next-newsletter scroll-mt-24" aria-labelledby="newsletter-heading">
      <span className="where-next-launch">Coming soon</span>
      <h2 id="newsletter-heading">More ideas for your next trip</h2>
      <p className="where-next-description">Timely destinations, useful travel updates, and practical trip ideas. Get Where Next? in your inbox when it launches.</p>
      <Suspense fallback={null}><NewsletterSignupSlot /></Suspense>
      <p className="where-next-consent">Your destination pick and email signup are separate. Picking a place never subscribes you.</p>
    </section>
  );
}
