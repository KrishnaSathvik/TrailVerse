import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function GuidesHubLoading() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="flex items-center justify-center py-32 px-4">
        <LoadingSpinner size="lg" text="Loading planning guides…" />
      </main>
      <Footer />
    </div>
  );
}
