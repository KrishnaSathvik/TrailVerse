import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import BlogPageClient from './BlogPageClient';
import { getBlogCategoriesServer, getBlogPostsServer } from '@/lib/blogApi';

export default async function BlogPage() {
  const [categoriesData, featuredData, popularData, postsData] = await Promise.all([
    getBlogCategoriesServer(),
    getBlogPostsServer({ limit: 3, page: 1, featured: true }),
    getBlogPostsServer({ limit: 2, page: 1, sortBy: 'views' }),
    getBlogPostsServer({ page: 1, limit: 6 }),
  ]);

  const initialData = {
    categories: [
      { id: 'all', label: 'All Posts', count: categoriesData.totalCount || 0 },
      ...((categoriesData.data || []).map((category) => ({
        id: category._id,
        label: category._id,
        count: category.count
      })))
    ],
    featuredPosts: featuredData.data || [],
    popularPosts: (popularData.data || []).slice(0, 2),
    posts: postsData.data || [],
    totalPages: Math.max(1, Math.ceil((postsData.total || 0) / 6)),
    totalPosts: postsData.total || 0
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <BlogPageClient initialData={initialData} />
      <Footer />
    </div>
  );
}
