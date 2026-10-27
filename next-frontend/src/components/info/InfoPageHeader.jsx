import PublicPageHero from '@/components/common/PublicPageHero';

export default function InfoPageHeader(props) {
  return <PublicPageHero {...props} />;
}

export function InfoSectionLabel({ children }) {
  return <p className="info-label">{children}</p>;
}
