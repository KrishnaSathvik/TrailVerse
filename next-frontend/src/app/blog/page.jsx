'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Search,
  X,
  Clock,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Eye
} from '@components/icons';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import BlogCard from '@/components/blog/BlogCard';
import Button from '@/components/common/Button';
import blogService from '@/services/blogService';

const BlogSkeleton = () => (
  <div className="space-y-10">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] gap-6">
      <div className="rounded-3xl h-[26rem] animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="grid gap-4">
        <div className="rounded-3xl h-[12.5rem] animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
        <div className="rounded-3xl h-[12.5rem] animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-2xl h-80 animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
      ))}
    </div>
  </div>
);

const FeaturedLeadCard = ({ post }) => (
  <Link
    href={`/blog/${post.slug}`}
    className="group relative min-h-[26rem] rounded-[2rem] overflow-hidden block"
    style={{
      backgroundColor: 'var(--surface)',
      borderWidth: '1px',
      borderColor: 'var(--border)'
    }}
  >
    <OptimizedImage src={post.featuredImage} alt={post.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
    <div className="relative h-full flex flex-col justify-end p-8">
      <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur mb-4">
        Featured Story
      </span>
      <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-4 max-w-2xl">{post.title}</h2>
      <p className="text-white/80 text-base md:text-lg max-w-2xl line-clamp-3 mb-6">{post.excerpt}</p>
      <div className="flex items-center gap-4 text-sm text-white/80">
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{post.readTime} min</span>
        <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{post.views?.toLocaleString() || 0}</span>
      </div>
    </div>
  </Link>
);

const FeaturedStackCard = ({ post }) => (
  <Link
    href={`/blog/${post.slug}`}
    className="group grid grid-cols-[120px_minmax(0,1fr)] gap-4 rounded-[1.5rem] p-4 transition hover:-translate-y-1"
    style={{
      backgroundColor: 'var(--surface)',
      borderWidth: '1px',
      borderColor: 'var(--border)'
    }}
  >
    <OptimizedImage src={post.featuredImage} alt={post.title} className="w-full h-28 rounded-2xl object-cover" />
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--accent-blue)' }}>
        {post.category}
      </p>
      <h3 className="text-lg font-semibold line-clamp-2 mb-3" style={{ color: 'var(--text-primary)' }}>
        {post.title}
      </h3>
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{post.readTime} min</span>
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.views?.toLocaleString() || 0}</span>
      </div>
    </div>
  </Link>
);

const BlogContent = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [featuredPosts, setFeaturedPosts] = useState([]);
  const [popularPosts, setPopularPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(6);

  useEffect(() => {
    const updatePostsPerPage = () => {
      setPostsPerPage(window.innerWidth < 768 ? 3 : 9);
    };

    updatePostsPerPage();
    window.addEventListener('resize', updatePostsPerPage);
    return () => window.removeEventListener('resize', updatePostsPerPage);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [categoriesData, featuredData, popularData] = await Promise.all([
          blogService.getBlogCategories(),
          blogService.getFeaturedPosts(3),
          blogService.getPopularPosts(4)
        ]);

        setCategories([
          { id: 'all', label: 'All Posts', count: categoriesData.totalCount || 0 },
          ...(categoriesData.data || []).map((category) => ({
            id: category._id,
            label: category._id,
            count: category.count
          }))
        ]);
        setFeaturedPosts(featuredData.data || []);
        setPopularPosts((popularData.data || []).slice(0, 4));

        const params = { page: currentPage, limit: postsPerPage };
        if (selectedCategory !== 'all') params.category = selectedCategory;
        if (searchTerm) params.search = searchTerm;
        if (selectedTag) params.tag = selectedTag;

        const data = await blogService.getAllPosts(params);
        setPosts(data.data || []);
        setTotalPages(data.pages || 1);
      } catch {
        setError('Failed to load blog posts. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPage, postsPerPage, searchTerm, selectedCategory, selectedTag]);

  const clearTagFilter = () => {
    setSelectedTag('');
    setCurrentPage(1);
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <section className="relative overflow-hidden py-8 sm:py-20">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/20 to-transparent" />
        </div>

        <div className="relative z-10 max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="mt-3 sm:mt-6">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 backdrop-blur"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Stories & Guides
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tighter leading-none mb-4" style={{ color: 'var(--text-primary)' }}>
              Travel Journal
            </h1>
            <p className="text-lg sm:text-xl max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
              Expert guides, travel tips, and inspiring stories from America&apos;s national parks.
            </p>
          </div>

          <div className="mt-8 max-w-3xl">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search articles..."
                className="w-full pl-14 pr-14 py-4 rounded-2xl text-base font-medium outline-none transition"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              />
              {searchTerm && (
                <Button
                  onClick={() => setSearchTerm('')}
                  variant="ghost"
                  size="sm"
                  icon={X}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--text-tertiary)' }}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
          {loading ? (
            <BlogSkeleton />
          ) : (
            <>
              {!searchTerm && selectedCategory === 'all' && featuredPosts.length > 0 && (
                <div className="mb-14">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="h-5 w-5" style={{ color: 'var(--accent-blue)' }} />
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      Featured Stories
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)] gap-6">
                    <FeaturedLeadCard post={featuredPosts[0]} />
                    <div className="grid gap-4">
                      {featuredPosts.slice(1).map((post) => (
                        <FeaturedStackCard key={post._id} post={post} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!searchTerm && selectedCategory === 'all' && popularPosts.length > 0 && (
                <div className="mb-12 rounded-[2rem] p-6 sm:p-8" style={{ backgroundColor: 'var(--surface)' }}>
                  <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                    <div>
                      <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Popular Posts</h2>
                      <p className="text-sm sm:text-base mt-1" style={{ color: 'var(--text-secondary)' }}>
                        Most-read stories right now.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {popularPosts.map((post) => (
                      <FeaturedStackCard key={post._id} post={post} />
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
                <div className="flex gap-2">
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category.id);
                        setCurrentPage(1);
                      }}
                      variant={selectedCategory === category.id ? 'secondary' : 'ghost'}
                      size="md"
                      className="whitespace-nowrap"
                    >
                      <span className="text-sm">{category.label}</span>
                      <span className="ml-2 text-xs opacity-75">({category.count})</span>
                    </Button>
                  ))}
                </div>
              </div>

              {selectedTag && (
                <div className="mb-6 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Filtered by tag:
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">#{selectedTag}</span>
                  <Button onClick={clearTagFilter} variant="ghost" size="sm" className="text-sm underline">
                    Clear filter
                  </Button>
                </div>
              )}

              <div className="mb-6">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {posts.length} {posts.length === 1 ? 'article' : 'articles'} found
                </p>
              </div>

              {error ? (
                <div className="text-center py-24">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                    <X className="h-8 w-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Something went wrong</h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                  <Button onClick={() => window.location.reload()} variant="secondary" size="md">Try Again</Button>
                </div>
              ) : posts.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
                    {posts.map((post) => (
                      <BlogCard key={post._id} post={post} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        onClick={() => setCurrentPage((previous) => previous - 1)}
                        disabled={currentPage === 1}
                        variant="secondary"
                        size="sm"
                        icon={ChevronLeft}
                      />

                      {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => {
                            setCurrentPage(page);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`px-4 py-2 rounded-full text-sm font-semibold transition ${currentPage === page ? 'ring-2' : ''}`}
                          style={{
                            backgroundColor: currentPage === page ? 'var(--surface-active)' : 'var(--surface)',
                            borderWidth: '1px',
                            borderColor: currentPage === page ? 'var(--border-hover)' : 'var(--border)',
                            color: 'var(--text-primary)',
                            boxShadow: currentPage === page ? 'var(--shadow-lg)' : 'var(--shadow)'
                          }}
                        >
                          {page}
                        </button>
                      ))}

                      <Button
                        onClick={() => setCurrentPage((previous) => previous + 1)}
                        disabled={currentPage === totalPages}
                        variant="secondary"
                        size="sm"
                        icon={ChevronRight}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-24">
                  <Search className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No articles found</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Try adjusting your search or filters.</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default function BlogPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}><BlogSkeleton /></div>}>
      <BlogContent />
    </Suspense>
  );
}
