import MapSeoShell from '@/components/seo/MapSeoShell';
import MapPageClient from './MapPageClient';

// Metadata comes from layout.jsx so this page can stay static/ISR.
export default function MapPage() {
  return (
    <>
      <MapSeoShell />
      <MapPageClient />
    </>
  );
}
