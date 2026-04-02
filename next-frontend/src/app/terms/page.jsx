import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TermsPageClient from './TermsPageClient';

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <TermsPageClient />
      <Footer />
    </div>
  );
}
