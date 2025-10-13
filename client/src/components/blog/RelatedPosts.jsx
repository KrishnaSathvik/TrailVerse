import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Eye } from '@components/icons';
import OptimizedImage from '../common/OptimizedImage';
import blogService from '../../services/blogService';

const RelatedPosts = ({ currentPostId, category, tags = [] }) => {
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRelatedPosts = async () => {
      try {
        setLoading(true);
        // Fetch posts from the same category
        const posts = await blogService.getRelatedPosts(currentPostId, category, tags);
        setRelatedPosts(posts);
      } catch (error) {
        console.error('Error fetching related posts:', error);
      } finally {
        setLoading(false);
      }
    };

    if (currentPostId) {
      fetchRelatedPosts();
    }
  }, [currentPostId, category, tags]);

  if (loading) {
    return (
      <section className="mt-16 pt-16" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent-green)' }}></div>
        </div>
      </section>
    );
  }

  if (relatedPosts.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 pt-16" style={{ borderTop: '1px solid var(--border)' }}>
      {/* Section Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          You Might Also Like
        </h2>
        <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
          Discover more stories and guides related to this topic
        </p>
      </div>

      {/* Related Posts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {relatedPosts.map((post, index) => (
          <RelatedPostCard key={post._id} post={post} index={index} />
        ))}
      </div>

      {/* View All Link */}
      <div className="mt-8 text-center">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all hover:-translate-y-1"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
            e.currentTarget.style.borderColor = 'var(--border-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--surface)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          Explore All Articles
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
};

const RelatedPostCard = ({ post, index }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group rounded-2xl overflow-hidden backdrop-blur transition-all duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isHovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <OptimizedImage
          src={post.featuredImage || post.imageUrl}
          alt={post.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Post Number Badge */}
        <div className="absolute top-4 right-4">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm backdrop-blur"
            style={{ 
              backgroundColor: 'rgba(34, 197, 94, 0.9)',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
            }}
          >
            {index + 1}
          </div>
        </div>

        {/* Category Badge */}
        {post.category && (
          <div className="absolute top-4 left-4">
            <span 
              className="px-3 py-1 rounded-full text-xs font-semibold backdrop-blur"
              style={{ 
                backgroundColor: 'rgba(14, 165, 233, 0.9)',
                color: 'white'
              }}
            >
              {post.category}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Title */}
        <h3 
          className="text-lg font-bold mb-2 line-clamp-2 group-hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-primary)' }}
        >
          {post.title}
        </h3>

        {/* Excerpt */}
        {post.excerpt && (
          <p 
            className="text-sm mb-4 line-clamp-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {post.excerpt}
          </p>
        )}

        {/* Footer Meta */}
        <div 
          className="flex items-center justify-between pt-4 text-xs"
          style={{ 
            borderTop: '1px solid var(--border)',
            color: 'var(--text-tertiary)' 
          }}
        >
          <div className="flex items-center gap-3">
            {post.readTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {post.readTime} min
              </span>
            )}
            {post.views !== undefined && (
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {post.views.toLocaleString()}
              </span>
            )}
          </div>
          
          <span 
            className="flex items-center gap-1 font-medium group-hover:gap-2 transition-all"
            style={{ color: 'var(--accent-green)' }}
          >
            Read
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default RelatedPosts;

