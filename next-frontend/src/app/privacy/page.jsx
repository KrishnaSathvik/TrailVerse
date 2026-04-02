import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import PrivacyPageClient from './PrivacyPageClient';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <PrivacyPageClient />
      <Footer />
    </div>
  );
}
