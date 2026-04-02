import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import FeaturesPageClient from './FeaturesPageClient';

export default function FeaturesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <FeaturesPageClient />
      <Footer />
    </div>
  );
}
