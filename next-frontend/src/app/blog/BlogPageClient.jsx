'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
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

const BlogContent = ({ initialData }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState(initialData?.posts || []);
  const [featuredPosts, setFeaturedPosts] = useState(initialData?.featuredPosts || []);
  const [popularPosts, setPopularPosts] = useState(initialData?.popularPosts || []);
  const [categories, setCategories] = useState(initialData?.categories || []);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(initialData?.totalPages || 1);
  const [postsPerPage, setPostsPerPage] = useState(6);
  const [totalPosts, setTotalPosts] = useState(initialData?.totalPosts || 0);
  const resultsAnchorRef = useRef(null);
  const shouldScrollToResultsRef = useRef(false);
  const hasSkippedInitialFetch = useRef(Boolean(initialData));

  useEffect(() => {
    const updatePostsPerPage = () => {
      setPostsPerPage(window.innerWidth < 768 ? 3 : 9);
    };

    updatePostsPerPage();
    window.addEventListener('resize', updatePostsPerPage);
    return () => window.removeEventListener('resize', updatePostsPerPage);
  }, []);

  useEffect(() => {
    if (hasSkippedInitialFetch.current) {
      hasSkippedInitialFetch.current = false;
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [categoriesData, featuredData, popularData] = await Promise.all([
          blogService.getBlogCategories(),
          blogService.getFeaturedPosts(3),
          blogService.getPopularPosts(2)
        ]);

        const nextFeaturedPosts = featuredData.data || [];
        const nextPopularPosts = (popularData.data || []).slice(0, 2);

        setCategories([
          { id: 'all', label: 'All Posts', count: categoriesData.totalCount || 0 },
          ...(categoriesData.data || []).map((category) => ({
            id: category._id,
            label: category._id,
            count: category.count
          }))
        ]);
        setFeaturedPosts(nextFeaturedPosts);
        setPopularPosts(nextPopularPosts);

        const shouldDeduplicateCollections = !searchTerm && selectedCategory === 'all' && currentPage === 1;
        const hiddenIds = new Set([
          ...nextFeaturedPosts.map((post) => post._id),
          ...nextPopularPosts.map((post) => post._id)
        ]);
        const params = {
          page: currentPage,
          limit: shouldDeduplicateCollections ? postsPerPage + hiddenIds.size : postsPerPage
        };
        if (selectedCategory !== 'all') params.category = selectedCategory;
        if (searchTerm) params.search = searchTerm;
        if (selectedTag) params.tag = selectedTag;

        const data = await blogService.getAllPosts(params);
        setPosts(data.data || []);
        setTotalPages(Math.max(1, Math.ceil((data.total || 0) / postsPerPage)));
        setTotalPosts(data.total || 0);
      } catch {
        setError('Failed to load blog posts. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPage, postsPerPage, searchTerm, selectedCategory, selectedTag]);

  useEffect(() => {
    if (!shouldScrollToResultsRef.current || loading) {
      return;
    }

    shouldScrollToResultsRef.current = false;
    resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, selectedCategory, selectedTag, currentPage]);

  const clearTagFilter = () => {
    setSelectedTag('');
    setCurrentPage(1);
    router.replace(pathname, { scroll: false });
  };

  const shouldDeduplicateCollections = !searchTerm && selectedCategory === 'all' && currentPage === 1;

  const visiblePosts = shouldDeduplicateCollections
    ? posts.filter(
        (post) =>
          !featuredPosts.some((featuredPost) => featuredPost._id === post._id) &&
          !popularPosts.some((popularPost) => popularPost._id === post._id)
      ).slice(0, postsPerPage)
    : posts;

  const visibleResultsLabel = visiblePosts.length === 1 ? 'article' : 'articles';

  return (
    <>
      <section className="relative overflow-hidden py-8 sm:py-20">
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

            {/* Category filters */}
            <div className="flex flex-wrap gap-2 mt-4 mb-8 justify-center">
              {[
                { slug: 'trip-planning', name: 'Trip Planning' },
                { slug: 'park-guides', name: 'Park Guides' },
                { slug: 'gear-packing', name: 'Gear & Packing' },
                { slug: 'seasonal', name: 'Seasonal' },
                { slug: 'astrophotography', name: 'Astrophotography' },
                { slug: 'budget-travel', name: 'Budget Travel' },
              ].map(cat => (
                <Link
                  key={cat.slug}
                  href={`/blog/category/${cat.slug}`}
                  className="px-4 py-2 rounded-full text-sm font-medium transition hover:shadow-sm"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
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
                  <FeaturedLeadCard post={featuredPosts[0]} />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {popularPosts.map((post) => (
                      <BlogCard key={post._id} post={post} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={resultsAnchorRef} className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
                <div className="flex gap-2">
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      onClick={() => {
                        shouldScrollToResultsRef.current = true;
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
                  <Button
                    onClick={() => {
                      shouldScrollToResultsRef.current = true;
                      clearTagFilter();
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-sm underline"
                  >
                    Clear filter
                  </Button>
                </div>
              )}

              <div className="mb-6">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Showing {visiblePosts.length} {visibleResultsLabel}
                  {totalPosts !== visiblePosts.length ? ` of ${totalPosts}` : ''}
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
              ) : visiblePosts.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
                    {visiblePosts.map((post) => (
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

    </>
  );
};

export default function BlogPage({ initialData }) {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}><BlogSkeleton /></div>}>
      <BlogContent initialData={initialData} />
    </Suspense>
  );
}
