import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import BlogPageClient from './BlogPageClient';
import BlogSubscribeToast from './BlogSubscribeToast';
import { getBlogCategoriesServer, getBlogPostsServer } from '@/lib/blogApi';

const LIST_PAGE_SIZE = 6;

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;
  const initialTag = typeof params?.tag === 'string' ? params.tag.trim() : '';

  const postsQuery = { page: 1, limit: LIST_PAGE_SIZE };
  if (initialTag) {
    postsQuery.tag = initialTag;
  }

  const [categoriesData, featuredData, popularData, postsData] = await Promise.all([
    getBlogCategoriesServer(),
    getBlogPostsServer({ limit: 3, page: 1, featured: true }),
    getBlogPostsServer({ limit: 2, page: 1, sortBy: 'views' }),
    getBlogPostsServer(postsQuery),
  ]);

  const initialData = {
    initialTag,
    categories: [
      { id: 'all', label: 'All Posts', count: categoriesData.totalCount || 0 },
      ...((categoriesData.data || []).map((category) => ({
        id: category._id,
        label: category._id,
        count: category.count,
      }))),
    ],
    featuredPosts: featuredData.data || [],
    popularPosts: (popularData.data || []).slice(0, 2),
    posts: postsData.data || [],
    totalPages: Math.max(1, Math.ceil((postsData.total || 0) / LIST_PAGE_SIZE)),
    totalPosts: postsData.total || 0,
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
