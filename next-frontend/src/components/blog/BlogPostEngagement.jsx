'use client';

import { useRouter } from 'next/navigation';
import AuthorBioCard, { isKnownBlogAuthor } from '@/components/blog/AuthorBioCard';
import CommentSection from '@/components/blog/CommentSection';
import LikeFavorite from '@/components/blog/LikeFavorite';
import NewsletterWidget from '@/components/blog/NewsletterWidget';

const SECTION_DIVIDER = 'pt-8 border-t';

/**
 * Post footer — three sections: engage (like/save/comment), author, newsletter.
 */
export default function BlogPostEngagement({ post, onPostUpdate }) {
  const router = useRouter();
  const showAuthor = isKnownBlogAuthor(post.author);
  const tags = post.tags?.length ? post.tags : [];

  return (
    <footer className="w-full mt-12 pt-10 space-y-0" style={{ borderTop: '1px solid var(--border)' }}>
      {/* 1 — Like, save, comment */}
      <section className="space-y-5" aria-label="Engage with this post">
        <LikeFavorite post={post} onUpdate={onPostUpdate} embedded />

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => router.push(`/blog?tag=${encodeURIComponent(tag)}`)}
                className="text-sm transition hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        <div className="pt-5" style={{ borderTop: '1px solid var(--border)' }}>
          <CommentSection postId={post._id} embedded unified />
        </div>
      </section>

      {/* 2 — Author */}
      {showAuthor ? (
        <section className={SECTION_DIVIDER} style={{ borderColor: 'var(--border)' }} aria-label="About the author">
          <AuthorBioCard author={post.author} embedded />
        </section>
      ) : null}

      {/* 3 — Newsletter */}
      <section
        className={SECTION_DIVIDER}
        style={{ borderColor: 'var(--border)' }}
        aria-label="Newsletter signup"
      >
        <NewsletterWidget source="blog-post" category={post.category} embedded />
      </section>
    </footer>
  );
}
