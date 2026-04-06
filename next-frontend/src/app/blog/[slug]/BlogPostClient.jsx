'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import OptimizedImage from '@/components/common/OptimizedImage';
import CommentSection from '@/components/blog/CommentSection';
import LikeFavorite from '@/components/blog/LikeFavorite';
import ShareButtons from '@/components/common/ShareButtons';
import RelatedPosts from '@/components/blog/RelatedPosts';
import TableOfContents from '@/components/blog/TableOfContents';
import blogService from '@/services/blogService';
import { logBlogView } from '@/utils/analytics';
import { injectHeadingIdsIntoHtml, parseBlogHeadingsFromHtml } from '@/utils/blogHeadings';
import { linkifyParkNamesHtml } from '@/utils/parkLinkifier';
import { Calendar, Clock, Eye, ArrowLeft, BookOpen } from '@components/icons';
import '@/styles/blog-prose.css';

const BlogPostSkeleton = () => (
  <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
    <Header />
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="h-5 w-28 rounded-full animate-pulse mb-8" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-8 w-24 rounded-full animate-pulse mb-6" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-14 max-w-4xl rounded-3xl animate-pulse mb-4" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-8 max-w-3xl rounded-3xl animate-pulse mb-10" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="h-[28rem] rounded-[2rem] animate-pulse mb-12" style={{ backgroundColor: 'var(--surface)' }} />
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-8">
        <div className="hidden xl:block h-64 rounded-3xl animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
        <div className="space-y-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-6 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--surface)' }} />
          ))}
        </div>
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
  const router = useRouter();
  const articleRef = useRef(null);
  const contentRef = useRef(null);
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
    if (post) {
      logBlogView(post.title, post._id, post.category || 'general');
    }
  }, [post]);

  const headings = useMemo(() => parseBlogHeadingsFromHtml(post?.content || ''), [post?.content]);
  const contentWithHeadingIds = useMemo(
    () => linkifyParkNamesHtml(injectHeadingIdsIntoHtml(post?.content || '', headings), slug),
    [headings, post?.content, slug]
  );

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

      <article ref={articleRef} className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 lg:py-12">
        <div
          className="mb-10 rounded-[2rem] border px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
          style={{
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, white 6%), var(--surface))',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <Link href="/blog" className="inline-flex items-center gap-2 mb-6" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="inline-block px-4 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: 'var(--accent-green)', color: 'white' }}>
              {post.category}
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-[5rem] font-bold mb-6 leading-[0.98] tracking-tight max-w-6xl" style={{ color: 'var(--text-primary)' }}>
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="text-lg sm:text-xl md:text-[1.55rem] leading-relaxed font-medium mb-8 max-w-5xl" style={{ color: 'var(--text-secondary)' }}>
              {post.excerpt}
            </p>
          )}

          <div
            className="flex flex-col gap-5 text-sm lg:flex-row lg:items-center lg:justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>By {(post.author && post.author !== 'Admin') ? post.author : 'TrailVerse Team'}</span>
              <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /><span>{formatDate(post.publishedAt)}</span></div>
              <div className="flex items-center gap-1.5"><Clock className="h-4 w-4" /><span>{post.readTime} min read</span></div>
              <div className="flex items-center gap-1.5"><Eye className="h-4 w-4" /><span>{post.views?.toLocaleString() || 0} views</span></div>
            </div>
            <div className="flex-shrink-0">
              <ShareButtons
                url={`https://www.nationalparksexplorerusa.com/blog/${post.slug}`}
                title={post.title}
                description={post.excerpt}
                image={post.featuredImage}
                type="article"
              />
            </div>
          </div>

          {post.featuredImage && (
            <div className="mt-8">
              <OptimizedImage src={post.featuredImage} alt={post.title} className="w-full aspect-[16/8.5] object-cover rounded-[1.75rem] shadow-lg" />
            </div>
          )}

        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)] gap-8 xl:gap-10 2xl:gap-12 items-start">
          <aside className="xl:order-1 xl:pr-2 2xl:pr-4">
            {headings.length > 0 && (
              <TableOfContents headings={headings} sticky containerRef={contentRef} />
            )}
          </aside>

          <div className="xl:order-2 min-w-0 max-w-[72rem]">
            <div
              className="rounded-[2rem] border px-5 py-8 sm:px-8 lg:px-10 xl:px-12 2xl:px-14 xl:py-10 mb-12"
              style={{
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, white 4%), var(--surface))',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div
                ref={contentRef}
                className="blog-prose mb-0"
                style={{ color: 'var(--text-primary)', maxWidth: 'none' }}
                dangerouslySetInnerHTML={{ __html: contentWithHeadingIds }}
              />
            </div>

            <div
              className="rounded-[1.75rem] p-6 sm:p-8 mb-10"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                      Continue The Trail
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Save the post, react to it, or jump into related topics.
                    </p>
                  </div>
                  <LikeFavorite post={post} onUpdate={setPost} />
                </div>

                {post.tags?.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => router.push(`/blog?tag=${encodeURIComponent(tag)}`)}
                          className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-105"
                          style={{
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12">
              <CommentSection postId={post._id} />
            </div>

            <RelatedPosts currentPostId={post._id} category={post.category} tags={post.tags || []} />
          </div>
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default BlogPostClient;
