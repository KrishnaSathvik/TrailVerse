import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import BlogPageClient from './BlogPageClient';
import BlogSubscribeToast from './BlogSubscribeToast';
import { getBlogCategoriesServer, getBlogPostsServer } from '@/lib/blogApi';
import { blogCategoryLabel } from '@/lib/blogCategories';

const ARCHIVE_PAGE_SIZE = 9;

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;
  const initialTag = typeof params?.tag === 'string' ? params.tag.trim() : '';

  const [categoriesData, featuredData, popularData] = await Promise.all([
    getBlogCategoriesServer(),
    getBlogPostsServer({ limit: 2, page: 1, featured: true }),
    getBlogPostsServer({ limit: 2, page: 1, sortBy: 'views' }),
  ]);

  let posts = [];
  let totalPages = 1;

  if (initialTag) {
    const postsData = await getBlogPostsServer({
      page: 1,
      limit: ARCHIVE_PAGE_SIZE,
      tag: initialTag,
    });
    posts = postsData.data || [];
    totalPages = Math.max(1, Math.ceil((postsData.total || 0) / ARCHIVE_PAGE_SIZE));
  }

  const initialData = {
    initialTag,
    categories: (categoriesData.data || []).map((category) => ({
      id: category._id,
      label: category.label || blogCategoryLabel(category._id),
      count: category.count,
    })),
    featuredPosts: featuredData.data || [],
    popularPosts: (popularData.data || []).slice(0, 2),
    posts,
    totalPages,
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
