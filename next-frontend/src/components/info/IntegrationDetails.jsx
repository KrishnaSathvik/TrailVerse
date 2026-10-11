import Link from 'next/link';

export default function IntegrationDetails({ host }) {
  return (
    <section className="info-section" aria-labelledby="integration-details">
      <h2 id="integration-details" className="mb-8">Access, follow-ups, and your data</h2>
      <div className="info-card-grid">
        <div className="info-panel">
          <h3 className="mb-3">What the connection can do</h3>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">The five tools retrieve park information and generate plans. They do not book campsites, buy permits, or access your TrailVerse account favorites. Follow-up planning uses a temporary session; ask for a fresh plan if that session expires.</p>
        </div>
        <div className="info-panel">
          <h3 className="mb-3">What is sent and stored</h3>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">{host} sends tool parameters such as destinations, dates, preferences, and planning requests. Planning context goes to our backend and AI providers. Tool diagnostics and backend session records may be stored. Temporary follow-up context expires after about two hours; backend records and logs have separate retention periods. Avoid sensitive information.</p>
        </div>
        <div className="info-panel">
          <h3 className="mb-3">Limits and availability</h3>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">No TrailVerse account is needed for these tools. Host-app access rules and usage limits apply, alongside TrailVerse rate limits. Current data depends on the destination and source; a generated plan can still contain errors.</p>
        </div>
        <div className="info-panel">
          <h3 className="mb-3">Saving and sharing</h3>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">For account-linked trips, the editable workspace, and website sharing, use <Link href="/plan-ai" className="underline">Trailie on TrailVerse</Link>. Connected-app conversations do not automatically appear in your website trip history. See our <Link href="/privacy" className="underline">Privacy Policy</Link> and <Link href="/terms" className="underline">Terms</Link>.</p>
        </div>
      </div>
    </section>
  );
}
