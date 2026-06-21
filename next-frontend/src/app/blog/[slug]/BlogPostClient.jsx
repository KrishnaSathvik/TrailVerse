'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import BlogPostEngagement from '@/components/blog/BlogPostEngagement';
import ShareButtons from '@/components/common/ShareButtons';
import RelatedPosts from '@/components/blog/RelatedPosts';
import TableOfContents from '@/components/blog/TableOfContents';
import blogService from '@/services/blogService';
import BlogViewCount from '@/components/blog/BlogViewCount';
import { logBlogView } from '@/utils/analytics';
import {
  ARTICLE_BODY,
  ARTICLE_CONTENT,
  ARTICLE_DECK,
  ARTICLE_HERO,
  ARTICLE_STANDARD,
  ARTICLE_TITLE,
} from '@/lib/articleLayout';
import { injectHeadingIdsIntoHtml, parseBlogHeadingsFromHtml } from '@/utils/blogHeadings';
import { enhanceBlogTablesInHtml } from '@/utils/blogTables';
import { linkifyParkNamesHtml, linkifyUrlsHtml } from '@/utils/parkLinkifier';
import { Calendar, Clock, ArrowLeft, BookOpen } from '@components/icons';
import '@/styles/blog-prose.css';

const blogViewSessionKey = (slug) => `tv-blog-view:${slug}`;

const BlogPostSkeleton = () => (
  <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
    <Header />
    <div className={ARTICLE_STANDARD}>
      <div className="h-5 w-28 rounded-full animate-pulse mb-8" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-8 w-24 rounded-full animate-pulse mb-6" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-12 max-w-2xl rounded-2xl animate-pulse mb-4" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-6 max-w-xl rounded-2xl animate-pulse mb-10" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-56 rounded-2xl animate-pulse mb-6 w-full" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-40 rounded-2xl animate-pulse mb-8 w-full" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="space-y-4 w-full">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-6 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
          ))}
      </div>
    </div>
  </div>
);

const BlogPostNotFound = () => (
  <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
    <Header />
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-20 text-center">
      <div
        className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <BookOpen className="h-9 w-9" style={{ color: 'var(--text-secondary)' }} />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
        This story isn&apos;t available
      </h1>
      <p className="text-lg mb-8" style={{ color: 'var(--text-secondary)' }}>
        The post may have moved, been unpublished, or the link is incomplete.
      </p>
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-full font-semibold transition"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)'
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Blog
      </Link>
    </div>
  </div>
);

const BlogPostClient = ({ slug, initialPost = null }) => {
  const articleRef = useRef(null);
  const contentRef = useRef(null);
  const viewTrackedRef = useRef(false);
  const [post, setPost] = useState(initialPost);
  const [loading, setLoading] = useState(!initialPost);
  const [readingProgress, setReadingProgress] = useState(0);

  useEffect(() => {
    if (initialPost?.slug === slug) {
      return;
    }

    let cancelled = false;

    const fetchPost = async () => {
      try {
        const data = await blogService.getPostBySlug(slug);
        if (cancelled) {
          return;
        }
        setPost(data);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPost();

    return () => {
      cancelled = true;
    };
  }, [initialPost?.slug, slug]);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;
    blogService.clearBlogCache();

    blogService
      .getPostBySlug(slug)
      .then((data) => {
        if (cancelled || !data || typeof data.views !== 'number') return;
        setPost((prev) => (prev ? { ...prev, views: data.views } : data));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!post?.slug || viewTrackedRef.current) {
      return;
    }

    const sessionKey = blogViewSessionKey(post.slug);
    try {
      if (sessionStorage.getItem(sessionKey)) {
        return;
      }
    } catch {
      // sessionStorage unavailable (private mode, blocked)
    }

    viewTrackedRef.current = true;

    logBlogView(post.title, post._id, post.category || 'general');

    blogService
      .trackView(post.slug)
      .then((views) => {
        try {
          sessionStorage.setItem(sessionKey, '1');
        } catch {
          // ignore
        }
        setPost((prev) => {
          if (!prev) return prev;
          const nextViews =
            typeof views === 'number' ? views : (prev.views || 0) + 1;
          return { ...prev, views: nextViews };
        });
      })
      .catch(() => {});
  }, [post?.slug, post?._id, post?.title, post?.category]);

  const headings = useMemo(() => parseBlogHeadingsFromHtml(post?.content || ''), [post?.content]);
  const contentWithHeadingIds = useMemo(
    () => linkifyParkNamesHtml(linkifyUrlsHtml(injectHeadingIdsIntoHtml(post?.content || '', headings)), slug),
    [headings, post?.content, slug]
  );

  const [renderedContent, setRenderedContent] = useState('');

  useLayoutEffect(() => {
    setRenderedContent(enhanceBlogTablesInHtml(contentWithHeadingIds));
  }, [contentWithHeadingIds]);

  useEffect(() => {
    const handleScroll = () => {
      if (!articleRef.current) {
        return;
      }

      const rect = articleRef.current.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const consumed = Math.min(Math.max(-rect.top, 0), Math.max(total, 0));
      const nextProgress = total > 0 ? (consumed / total) * 100 : 0;
      setReadingProgress(nextProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [post]);

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  if (loading) {
    return <BlogPostSkeleton />;
  }

  if (!post) {
    return <BlogPostNotFound />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-transparent">
        <div
          className="h-full transition-all duration-150 ease-out"
          style={{
            width: `${readingProgress}%`,
            backgroundColor: 'rgba(34, 197, 94, 0.85)'
          }}
        />
      </div>

      <article ref={articleRef} className={ARTICLE_STANDARD}>
        <header className={ARTICLE_HERO} style={{ borderColor: 'var(--border)' }}>
          <Link href="/blog" className="inline-flex items-center gap-2 mb-6 text-sm font-medium transition hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="inline-block px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
              {post.category}
            </span>
          </div>

          <h1 className={ARTICLE_TITLE} style={{ color: 'var(--text-primary)' }}>
            {post.title}
          </h1>

          {post.excerpt && (
            <p className={`${ARTICLE_DECK} mb-6`} style={{ color: 'var(--text-secondary)' }}>
              {post.excerpt}
            </p>
          )}

          <div
            className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>By {(post.author && post.author !== 'Admin') ? post.author : 'Krishna'}</span>
              <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /><span>{formatDate(post.publishedAt)}</span></div>
              <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /><span>{post.readTime} min read</span></div>
              <BlogViewCount views={post.views} className="flex items-center gap-1.5" />
            </div>
            <div className="flex-shrink-0">
              <ShareButtons
                url={`https://www.nationalparksexplorerusa.com/blog/${post.slug}`}
                title={post.title}
                description={post.excerpt}
                image={post.featuredImage}
                type="article"
                blogPost={{
                  slug: post.slug,
                  title: post.title,
                  excerpt: post.excerpt,
                  author: post.author,
                  category: post.category,
                  publishedAt: post.publishedAt,
                  readTime: post.readTime,
                  featuredImage: post.featuredImage,
                  content: post.content,
                }}
              />
            </div>
          </div>
        </header>

        {post.featuredImage && (
          <div className="mb-10 overflow-hidden rounded-2xl">
            <OptimizedImage src={post.featuredImage} alt={post.title} className="w-full aspect-[16/9] object-cover" />
          </div>
        )}

        <div className={ARTICLE_CONTENT}>
          <div className={ARTICLE_BODY}>
            {headings.length > 0 && (
              <TableOfContents
                headings={headings}
                variant="inline"
                containerRef={contentRef}
              />
            )}

            <div
              ref={contentRef}
              className="blog-prose w-full"
              style={{ color: 'var(--text-primary)' }}
              dangerouslySetInnerHTML={{ __html: renderedContent || contentWithHeadingIds }}
            />

            <BlogPostEngagement post={post} onPostUpdate={setPost} />

            <RelatedPosts currentPostId={post._id} category={post.category} tags={post.tags || []} />
          </div>
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default BlogPostClient;
