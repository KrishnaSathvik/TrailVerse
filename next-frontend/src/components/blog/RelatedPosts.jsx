'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock } from '@components/icons';
import BlogViewCount from '@/components/blog/BlogViewCount';
import OptimizedImage from '@/components/common/OptimizedImage';
import { blogCategoryLabel } from '@/lib/blogCategories';
import blogService from '@/services/blogService';

function RelatedPostRow({ post }) {
  const categoryLabel = blogCategoryLabel(post.category);

  return (
    <li>
      <Link
        href={`/blog/${post.slug}`}
        className="group flex items-start gap-4 py-5 sm:gap-5 sm:py-6 transition-opacity hover:opacity-90"
      >
        <div className="w-[5.5rem] h-[5.5rem] sm:w-28 sm:h-28 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--surface-hover)]">
          <OptimizedImage
            src={post.featuredImage || post.imageUrl}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          {categoryLabel ? (
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--accent-green)' }}
            >
              {categoryLabel}
            </p>
          ) : null}
          <h3
            className="text-base sm:text-lg font-semibold leading-snug line-clamp-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {post.title}
          </h3>
          {post.excerpt ? (
            <p
              className="text-sm mt-1.5 leading-relaxed line-clamp-2 hidden sm:block"
              style={{ color: 'var(--text-secondary)' }}
            >
              {post.excerpt}
            </p>
          ) : null}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {post.readTime ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {post.readTime} min read
              </span>
            ) : null}
            <BlogViewCount views={post.views} />
          </div>
        </div>

        <ArrowRight
          className="h-4 w-4 mt-1 flex-shrink-0 opacity-40 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 hidden sm:block"
          style={{ color: 'var(--accent-green)' }}
        />
      </Link>
    </li>
  );
}

function RelatedPostsSkeleton() {
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={index} className="flex gap-4 py-5 sm:py-6 animate-pulse">
          <div
            className="w-[5.5rem] h-[5.5rem] sm:w-28 sm:h-28 rounded-xl flex-shrink-0"
            style={{ backgroundColor: 'var(--surface-hover)' }}
          />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-20 rounded-full" style={{ backgroundColor: 'var(--surface-hover)' }} />
            <div className="h-5 w-full max-w-md rounded-lg" style={{ backgroundColor: 'var(--surface-hover)' }} />
            <div className="h-4 w-32 rounded-lg hidden sm:block" style={{ backgroundColor: 'var(--surface-hover)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function RelatedPosts({
  currentPostId,
  category,
  tags = [],
  isPublic = false,
}) {
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentPostId) return;

    let cancelled = false;

    const fetchRelatedPosts = async () => {
      try {
        setLoading(true);
        const posts = await blogService.getRelatedPosts(currentPostId, category, tags);
        if (!cancelled) setRelatedPosts(posts);
      } catch (error) {
        console.error('Error fetching related posts:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRelatedPosts();

    return () => {
      cancelled = true;
    };
  }, [currentPostId, category, tags]);

  if (!loading && relatedPosts.length === 0) {
    return null;
  }

  return (
    <section
      className="pt-10"
      style={{ borderTop: '1px solid var(--border)' }}
      aria-labelledby="related-posts-heading"
    >
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h2
          id="related-posts-heading"
          className="text-xl sm:text-2xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Keep reading
        </h2>
        {!isPublic && !loading && (
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm font-semibold transition hover:opacity-80 flex-shrink-0"
            style={{ color: 'var(--accent-green)' }}
          >
            All articles
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <p className="text-sm mb-5 sm:mb-6" style={{ color: 'var(--text-secondary)' }}>
        More on this topic from TrailVerse
      </p>

      {loading ? (
        <RelatedPostsSkeleton />
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {relatedPosts.map((post) => (
            <RelatedPostRow key={post._id} post={post} />
          ))}
        </ul>
      )}
    </section>
  );
}
