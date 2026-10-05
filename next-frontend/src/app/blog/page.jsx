import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import BlogPageClient from './BlogPageClient';
import BlogSubscribeToast from './BlogSubscribeToast';
import { getBlogCategoriesServer, getBlogPostsServer } from '@/lib/blogApi';
import { mapBlogNavCategories } from '@/lib/blogCategories';
import { canonicalPageMetadata } from '@/lib/seo';

export const revalidate = 3600;
export const metadata = canonicalPageMetadata('/blog');

export default async function BlogPage() {
  const [categoriesData, featuredData, popularData] = await Promise.all([
    getBlogCategoriesServer(),
    getBlogPostsServer({ limit: 2, page: 1, featured: true }),
    getBlogPostsServer({ limit: 2, page: 1, sortBy: 'views' }),
  ]);

  const initialData = {
    initialTag: '',
    categories: mapBlogNavCategories(categoriesData.data),
    featuredPosts: featuredData.data || [],
    popularPosts: (popularData.data || []).slice(0, 2),
    posts: [],
    totalPages: 1,
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <BlogPageClient initialData={initialData} />
      <Footer />
      <BlogSubscribeToast />
    </div>
  );
}
