import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://trailverse.onrender.com/api' : 'http://localhost:5001/api');

const CATEGORIES = {
  'trip-planning': { name: 'Trip Planning', description: 'Guides and tips for planning your perfect national park visit — itineraries, permits, packing lists, and budgeting advice.' },
  'park-guides': { name: 'Park Guides', description: 'In-depth guides to individual national parks — best trails, campgrounds, wildlife, seasonal tips, and what to expect.' },
  'gear-packing': { name: 'Gear & Packing', description: 'What to bring on your national park adventure — gear recommendations, packing lists, and must-have equipment.' },
  'seasonal': { name: 'Seasonal Guides', description: 'The best national parks to visit by season — spring wildflowers, summer crowds, fall foliage, and winter solitude.' },
  'astrophotography': { name: 'Astrophotography', description: 'National park astrophotography guides — dark sky parks, Milky Way timing, camera settings, and the best stargazing spots.' },
  'budget-travel': { name: 'Budget Travel', description: 'Visit national parks on a budget — free parks, annual pass math, free camping, and money-saving strategies.' },
};

async function getPostsByCategory(categoryName) {
  try {
    const res = await fetch(`${API_URL}/blogs?limit=50`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    const posts = json.data || json.blogs || json || [];
    if (!Array.isArray(posts)) return [];
    // Filter by category field or tags containing the category name
    return posts.filter(post => {
      const postCategory = (post.category || '').toLowerCase().replace(/\s+/g, '-');
      const postTags = (post.tags || []).map(t => t.toLowerCase().replace(/\s+/g, '-'));
      return postCategory === categoryName || postTags.includes(categoryName);
    });
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return Object.keys(CATEGORIES).map(category => ({ category }));
}

export async function generateMetadata({ params }) {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) return { title: 'Not Found' };

  return {
    title: `${cat.name} — National Park Articles | TrailVerse Blog`,
    description: cat.description,
    alternates: {
      canonical: `https://www.nationalparksexplorerusa.com/blog/category/${category}`,
    },
    openGraph: {
      title: `${cat.name} — TrailVerse Blog`,
      description: cat.description,
      url: `https://www.nationalparksexplorerusa.com/blog/category/${category}`,
      siteName: 'TrailVerse',
      type: 'website',
    },
  };
}

export default async function BlogCategoryPage({ params }) {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) notFound();

  const posts = await getPostsByCategory(category);

  // CollectionPage schema
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${cat.name} — TrailVerse Blog`,
    description: cat.description,
    url: `https://www.nationalparksexplorerusa.com/blog/category/${category}`,
    hasPart: posts.map(post => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `https://www.nationalparksexplorerusa.com/blog/${post.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />
        <main className="pt-16">
          <section className="py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <nav className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                <Link href="/" style={{ color: 'var(--text-secondary)' }}>Home</Link>
                <span className="mx-2">/</span>
                <Link href="/blog" style={{ color: 'var(--text-secondary)' }}>Blog</Link>
                <span className="mx-2">/</span>
                <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
              </nav>
              <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                {cat.name}
              </h1>
              <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
                {cat.description}
              </p>

              {/* Category nav */}
              <div className="flex flex-wrap gap-2 mb-10">
                {Object.entries(CATEGORIES).map(([slug, c]) => (
                  <Link
                    key={slug}
                    href={`/blog/category/${slug}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition"
                    style={{
                      backgroundColor: slug === category ? 'var(--accent-green)' : 'var(--surface)',
                      color: slug === category ? 'white' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>

              {posts.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-lg mb-4" style={{ color: 'var(--text-secondary)' }}>
                    No articles in this category yet — check back soon.
                  </p>
                  <Button variant="success" size="sm" href="/blog">Browse all articles</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {posts.map(post => (
                    <Link
                      key={post._id || post.slug}
                      href={`/blog/${post.slug}`}
                      className="group flex gap-4 rounded-2xl p-4 transition hover:shadow-md"
                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      {post.featuredImage && (
                        <div className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden">
                          <img
                            src={post.featuredImage}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-base mb-1 group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                          {post.title}
                        </h2>
                        {post.excerpt && (
                          <p className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                            {post.excerpt}
                          </p>
                        )}
                        {post.publishedAt && (
                          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                            {new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
