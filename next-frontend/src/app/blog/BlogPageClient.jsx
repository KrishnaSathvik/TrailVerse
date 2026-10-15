'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  X,
  Clock,
  BookOpen,
  Star,
  ChevronLeft,
  ChevronRight,
  Eye
} from '@components/icons';
import OptimizedImage from '@/components/common/OptimizedImage';
import BlogCard from '@/components/blog/BlogCard';
import BlogViewCount from '@/components/blog/BlogViewCount';
import Button from '@/components/common/Button';
import blogService from '@/services/blogService';
import NewsletterWidget from '@/components/blog/NewsletterWidget';
import BlogCategoryNav from '@/components/blog/BlogCategoryNav';
import { mapBlogNavCategories } from '@/lib/blogCategories';
import { reportHref } from '@/lib/reportLinks';

const ARCHIVE_PAGE_SIZE = 9;

const HubSkeleton = () => (
  <div className="space-y-14">
    {[0, 1].map((section) => (
      <div key={section}>
        <div className="h-8 w-48 rounded-2xl animate-pulse mb-6" style={{ backgroundColor: 'var(--surface)' }} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl h-[26rem] animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
          <div className="rounded-xl h-[26rem] animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
        </div>
      </div>
    ))}
  </div>
);

const ArchiveSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {Array.from({ length: 6 }).map((_, index) => (
      <div key={index} className="rounded-2xl h-80 animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
    ))}
  </div>
);

const FeaturedLeadCard = ({ post, badge = 'Featured Story' }) => (
  <Link
    href={`/blog/${post.slug}`}
    className="group relative min-h-[22rem] sm:min-h-[26rem] rounded-xl overflow-hidden block"
    style={{
      backgroundColor: 'var(--bg-secondary)',
      borderWidth: '1px',
      borderColor: 'var(--border)'
    }}
  >
    <OptimizedImage src={post.featuredImage} alt={post.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
    <div className="relative h-full flex flex-col justify-end p-6 sm:p-8">
      <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white mb-4">
        {badge}
      </span>
      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-3 sm:mb-4 public-content">{post.title}</h2>
      <p className="text-white/80 text-sm sm:text-base md:text-lg public-content line-clamp-3 mb-4 sm:mb-6">{post.excerpt}</p>
      <div className="flex items-center gap-4 text-sm text-white/80">
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{post.readTime} min</span>
        <BlogViewCount views={post.views} className="flex items-center gap-1" />
      </div>
    </div>
  </Link>
);

const BLOG_PATH = '/blog';

// Keep query reading in a small client boundary so the public hub can be ISR.
function BlogQueryState({ onTagChange }) {
  const searchParams = useSearchParams();
  const tag = (searchParams.get('tag') || '').trim();
  useEffect(() => { onTagChange(tag); }, [tag, onTagChange]);
  return null;
}

const BlogContent = ({ initialData }) => {
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState(initialData?.initialTag || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState(initialData?.posts || []);
  const [featuredPosts, setFeaturedPosts] = useState(initialData?.featuredPosts || []);
  const [popularPosts, setPopularPosts] = useState(initialData?.popularPosts || []);
  const [categories, setCategories] = useState(initialData?.categories || []);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(initialData?.totalPages || 1);
  const resultsAnchorRef = useRef(null);
  const shouldScrollToResultsRef = useRef(false);
  const hasSkippedInitialFetch = useRef(Boolean(initialData));

  const showArchive = Boolean(selectedTag);
  const heroFeaturedPosts = featuredPosts.slice(0, 2);

  const onTagChange = useCallback(tag => {
    setSelectedTag(tag);
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    if (hasSkippedInitialFetch.current) {
      hasSkippedInitialFetch.current = false;
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // SSR already supplied the shared hub data; tag/page changes only need posts.
        if (!initialData) {
          const [categoriesData, featuredData, popularData] = await Promise.all([
            blogService.getBlogCategories(), blogService.getFeaturedPosts(2), blogService.getPopularPosts(2),
          ]);
          if (cancelled) return;
          setCategories(mapBlogNavCategories(categoriesData?.data));
          setFeaturedPosts(featuredData.data || []);
          setPopularPosts((popularData.data || []).slice(0, 2));
        }

        if (!selectedTag) {
          setPosts([]);
          setTotalPages(1);
          return;
        }

        const params = {
          page: currentPage,
          limit: ARCHIVE_PAGE_SIZE,
          tag: selectedTag,
        };

        const data = await blogService.getAllPosts(params);
        if (cancelled) return;
        setPosts(data.data || []);
        setTotalPages(Math.max(1, Math.ceil((data.total || 0) / ARCHIVE_PAGE_SIZE)));
      } catch {
        if (!cancelled) setError('Failed to load blog posts. Please try again later.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [currentPage, selectedTag, initialData]);

  useEffect(() => {
    if (!shouldScrollToResultsRef.current || loading) {
      return;
    }

    shouldScrollToResultsRef.current = false;
    resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, selectedTag, currentPage]);

  const clearTagFilter = () => {
    setSelectedTag('');
    setCurrentPage(1);
    router.replace(BLOG_PATH, { scroll: false });
  };

  return (
    <>
      <Suspense fallback={null}><BlogQueryState onTagChange={onTagChange} /></Suspense>
      <section className="relative overflow-hidden border-b py-5 sm:py-8" style={{ borderColor: 'var(--border)' }}>
        <div className="relative z-10 public-shell">
          <div>
            <div
              className="public-eyebrow"
            >
              <BookOpen className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Stories & Guides
              </span>
            </div>

            <h1 className="public-page-title mb-4" style={{ color: 'var(--text-primary)' }}>
              Travel Journal
            </h1>
            <p className="public-page-intro" style={{ color: 'var(--text-secondary)' }}>
              Expert guides, travel tips, and inspiring stories from America&apos;s national parks.
            </p>
          </div>

          {categories.length > 0 && (
            <div className="mt-8">
              <BlogCategoryNav categories={categories} activeId={null} />
            </div>
          )}
        </div>
      </section>

      <section className="pb-24">
        <div className="public-shell">
          {loading ? (
            showArchive ? <ArchiveSkeleton /> : <HubSkeleton />
          ) : (
            <>
              {!showArchive && heroFeaturedPosts.length > 0 && (
                <div className="mb-14">
                  <div className="flex items-center gap-2 mb-6">
                    <Star className="h-5 w-5" style={{ color: 'var(--accent-blue)' }} />
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      Featured Stories
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {heroFeaturedPosts.map((post) => (
                      <FeaturedLeadCard key={post._id} post={post} />
                    ))}
                  </div>
                </div>
              )}

              {!showArchive && popularPosts.length > 0 && (
                <div className="mb-14">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      Popular Posts
                    </h2>
                  </div>
                  <p className="text-sm sm:text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
                    Most-read stories right now.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {popularPosts.map((post) => (
                      <FeaturedLeadCard key={post._id} post={post} badge="Popular" />
                    ))}
                  </div>
                </div>
              )}

              <div ref={resultsAnchorRef} />

              {showArchive && selectedTag && (
                <div className="mb-6 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Filtered by tag:
                  </span>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: 'var(--surface-active)', color: 'var(--text-primary)' }}
                  >
                    #{selectedTag}
                  </span>
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

              {showArchive && (
                error ? (
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
                          aria-label="Previous page"
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
                          aria-label="Next page"
                          icon={ChevronRight}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-24">
                    <BookOpen className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                    <p className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No articles found</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Browse by category above or clear the tag filter.</p>
                  </div>
                )
              )}
            </>
          )}

          <a
            href={reportHref('/reports/national-parks-2025.html', { from: BLOG_PATH })}
            className="block mt-12 border-t py-6 transition group"
            style={{
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--accent-blue)' }}
                >
                  Data Investigation
                </span>
                <h3 className="text-xl sm:text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  America&apos;s Parks Are Being Loved to Death
                </h3>
                <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                  323 million visits. A $23B repair bill. 10 parks absorb half the crowd. Explore the data.
                </p>
              </div>
              <span
                className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all"
                style={{ color: 'var(--accent-blue)' }}
              >
                Read Report <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </a>

          <a
            href={reportHref('/reports/when-to-go', { from: BLOG_PATH })}
            className="block mt-4 border-t py-6 transition group"
            style={{
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--accent-blue)' }}
                >
                  Interactive Tool
                </span>
                <h3 className="text-xl sm:text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  When to Go. Without the Crowd.
                </h3>
                <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                  Month-by-month crowd levels, shoulder season windows, and permit info for all 63 national parks.
                </p>
              </div>
              <span
                className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all"
                style={{ color: 'var(--accent-blue)' }}
              >
                View Calendar <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </a>

          <div className="mt-6 mb-8">
            <NewsletterWidget source="blog-listing" />
          </div>
        </div>
      </section>
    </>
  );
};

export default function BlogPage({ initialData }) {
  return <BlogContent initialData={initialData} />;
}
