import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import GuideDetailClient from '@/components/guides/GuideDetailClient';
import {
  getAllGuideSlugs,
  getGuideBySlug,
  getGuideCanonicalUrl,
} from '@/data/guides';

const GUIDE_OG_IMAGE = {
  url: '/og-image-trailverse.jpg',
  width: 1200,
  height: 630,
  alt: 'TrailVerse — National Park Planning Guides',
};

export async function generateStaticParams() {
  return getAllGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return { title: 'Guide Not Found | TrailVerse' };

  const canonical = getGuideCanonicalUrl(guide);
  const pageTitle = guide.metadataTitle ?? `${guide.title} | TrailVerse`;

  return {
    title: pageTitle,
    description: guide.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: pageTitle,
      description: guide.metaDescription,
      url: canonical,
      siteName: 'TrailVerse',
      type: 'article',
      modifiedTime: guide.updatedAt,
      images: [{ ...GUIDE_OG_IMAGE, alt: guide.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: guide.metaDescription,
      images: [GUIDE_OG_IMAGE.url],
    },
  };
}

function buildArticleSchema(guide) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.metaDescription,
    dateModified: guide.updatedAt,
    author: {
      '@type': 'Organization',
      name: 'TrailVerse',
      url: 'https://www.nationalparksexplorerusa.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'TrailVerse',
      url: 'https://www.nationalparksexplorerusa.com',
    },
    mainEntityOfPage: getGuideCanonicalUrl(guide),
  };
}

function buildFaqSchema(guide) {
  if (!guide.faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export default async function GuideDetailPage({ params }) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const faqSchema = buildFaqSchema(guide);
  const canonicalUrl = getGuideCanonicalUrl(guide);

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(buildArticleSchema(guide))}</script>
      {faqSchema && (
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      )}
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />

        <main>
          <GuideDetailClient guide={guide} canonicalUrl={canonicalUrl} />
        </main>

        <Footer />
      </div>
    </>
  );
}
