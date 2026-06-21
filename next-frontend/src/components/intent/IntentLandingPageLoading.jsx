import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LoadingSpinner from '@/components/common/LoadingSpinner';

/** Route-level loading for vibe/intent landing pages during client navigation. */
export default function IntentLandingPageLoading() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-12 lg:py-16">
        <div
          className="mb-10 rounded-[2rem] border px-5 py-8 sm:px-8 animate-pulse"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          aria-hidden="true"
        >
          <div className="h-4 w-32 rounded mb-6" style={{ backgroundColor: 'var(--surface-hover)' }} />
          <div className="h-10 w-2/3 max-w-xl rounded mb-4" style={{ backgroundColor: 'var(--surface-hover)' }} />
          <div className="h-5 w-full max-w-2xl rounded mb-2" style={{ backgroundColor: 'var(--surface-hover)' }} />
          <div className="h-5 w-4/5 max-w-xl rounded" style={{ backgroundColor: 'var(--surface-hover)' }} />
        </div>
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" text="Loading park picks…" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
