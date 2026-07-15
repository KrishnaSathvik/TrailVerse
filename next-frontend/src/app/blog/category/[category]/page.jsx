import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import Button from '@/components/common/Button';
import NewsletterWidget from '@/components/blog/NewsletterWidget';
import BlogCard from '@/components/blog/BlogCard';
import BlogCategoryNav from '@/components/blog/BlogCategoryNav';
import { BLOG_CATEGORIES, mapBlogNavCategories } from '@/lib/blogCategories';
import { getBlogCategoriesServer, getBlogPostsServer } from '@/lib/blogApi';

const CATEGORIES = BLOG_CATEGORIES;

async function getPostsByCategory(categorySlug) {
  const result = await getBlogPostsServer({ category: categorySlug, limit: 50, page: 1 });
  return result.data || [];
}

export async function generateStaticParams() {
  return Object.keys(CATEGORIES).map(category => ({ category }));
}

export async function generateMetadata({ params }) {
  const { category } = await params;
  const cat = CATEGORIES[category];
  if (!cat) return { title: '404 - Page Not Found | TrailVerse' };

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

  const [posts, categoriesData] = await Promise.all([
    getPostsByCategory(category),
    getBlogCategoriesServer(),
  ]);

  const navCategories = [
    { id: 'all', label: 'Blog Home' },
    ...mapBlogNavCategories(categoriesData.data),
  ];

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
          <section className="py-12 px-4 sm:px-6 lg:px-10 xl:px-12">
            <div className="max-w-[92rem] mx-auto">
              <nav className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                <Link href="/" style={{ color: 'var(--text-secondary)' }}>Home</Link>
                <span className="mx-2">/</span>
                <Link href="/blog" style={{ color: 'var(--text-secondary)' }}>Blog</Link>
                <span className="mx-2">/</span>
                <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
              </nav>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                {cat.name}
              </h1>
              <p className="text-lg mb-6 max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
                {cat.description}
              </p>
              <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
                {posts.length} {posts.length === 1 ? 'article' : 'articles'}
              </p>

              <BlogCategoryNav categories={navCategories} activeId={category} />

              {posts.length === 0 ? (
                <div className="text-center py-16 mt-10">
                  <p className="text-lg mb-4" style={{ color: 'var(--text-secondary)' }}>
                    No articles in this category yet — check back soon.
                  </p>
                  <Button variant="success" size="sm" href="/blog">Browse all articles</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-10">
                  {posts.map((post) => (
                    <BlogCard key={post._id || post.slug} post={post} />
                  ))}
                </div>
              )}

              <div className="mt-12">
                <NewsletterWidget source="blog-category" category={category} />
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
