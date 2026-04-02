import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TestimonialsPageClient from './TestimonialsPageClient';

export default function TestimonialsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <TestimonialsPageClient />
      <Footer />
    </div>
  );
}
