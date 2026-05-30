import Link from 'next/link';
import Image from 'next/image';
import IconGlyph from '@/components/common/IconGlyph';

function formatCategory(category) {
  if (!category) return 'Blog';
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function LandingPopularBlogsSection({ posts = [] }) {
  if (!posts.length) {
    return null;
  }

  return (
    <section
      className="relative z-0 py-16 sm:py-20 px-4 sm:px-6 lg:px-10 xl:px-12"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-[92rem] mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 ring-1"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <IconGlyph name="Bookmark" className="h-4 w-4" style={{ color: 'var(--text-primary)' }} />
              <span className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                From the blog
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Most-read park guides
            </h2>
            <p className="text-base sm:text-lg mt-2 max-w-lg" style={{ color: 'var(--text-secondary)' }}>
              Trip planning tips and park deep dives travelers are reading right now.
            </p>
          </div>
          <Link
            href="/blog"
            className="hidden sm:flex items-center gap-1.5 font-semibold text-sm hover:underline flex-shrink-0 whitespace-nowrap"
            style={{ color: 'var(--accent-green)' }}
          >
            View all posts
            <IconGlyph name="ArrowRight" className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {posts.map((post) => (
            <Link
              key={post._id || post.slug}
              href={`/blog/${post.slug}`}
              className="group block rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                <Image
                  src={post.featuredImage || '/og-image-trailverse.jpg'}
                  alt={post.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute top-4 left-4 inline-flex px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-black/45 text-white backdrop-blur-sm border border-white/10">
                  {formatCategory(post.category)}
                </span>
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-lg sm:text-xl font-semibold leading-tight mb-2 line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="text-sm line-clamp-2 mb-4" style={{ color: 'var(--text-secondary)' }}>
                    {post.excerpt}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {post.readTime ? <span>{post.readTime} min read</span> : null}
                  {typeof post.views === 'number' ? (
                    <span>{post.views.toLocaleString()} views</span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 sm:hidden">
          <Link
            href="/blog"
            className="w-full inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            View all blog posts
          </Link>
        </div>
      </div>
    </section>
  );
}
