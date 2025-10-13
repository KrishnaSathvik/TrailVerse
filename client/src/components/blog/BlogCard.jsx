import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Tag } from '@components/icons';
import OptimizedImage from '../common/OptimizedImage';

const BlogCard = memo(({ post }) => {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group rounded-2xl overflow-hidden backdrop-blur hover:-translate-y-1 transition-all duration-300 block"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <OptimizedImage
          src={post.imageUrl || post.featuredImage}
          alt={post.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Category Tag */}
        <div className="flex items-center gap-2 mb-3">
          <Tag className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
          <span 
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--accent-blue)' }}
          >
            {post.category}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold mb-2 line-clamp-2 transition"
          style={{ color: 'var(--text-primary)' }}
        >
          {post.title}
        </h3>

        {/* Excerpt */}
        <p className="text-sm mb-4 line-clamp-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {post.excerpt}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              {post.author?.name || post.author}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readTime} min
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
});

BlogCard.displayName = 'BlogCard';

export default BlogCard;
