import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function GuideDetailLoading() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div
          className="mb-10 rounded-[2rem] border px-5 py-8 sm:px-8 animate-pulse max-w-4xl mx-auto"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          aria-hidden="true"
        >
          <div className="h-4 w-28 rounded mb-6" style={{ backgroundColor: 'var(--surface-hover)' }} />
          <div className="h-10 w-full rounded mb-4" style={{ backgroundColor: 'var(--surface-hover)' }} />
          <div className="h-5 w-3/4 rounded" style={{ backgroundColor: 'var(--surface-hover)' }} />
        </div>
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" text="Loading guide…" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
