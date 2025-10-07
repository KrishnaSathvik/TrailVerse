import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Eye, BookOpen, Heart } from 'lucide-react';
import blogService from '../../services/blogService';
import { useToast } from '../../context/ToastContext';
import OptimizedImage from '../common/OptimizedImage';

const FavoriteBlogs = () => {
  const { showToast } = useToast();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchFavoriteBlogs();
  }, []);

  const fetchFavoriteBlogs = async (pageNum = 1) => {
    try {
      setLoading(true);
      const result = await blogService.getFavoritedPosts({ 
        page: pageNum, 
        limit: 10 
      });
      
      // Ensure result.data is an array
      const blogsData = result?.data || [];
      
      if (pageNum === 1) {
        setBlogs(blogsData);
      } else {
        setBlogs(prev => [...prev, ...blogsData]);
      }
      
      setHasMore(blogsData.length === 10);
    } catch (error) {
      console.error('Error fetching favorite blogs:', error);
      showToast('Failed to load favorite blogs', 'error');
      // Set empty array on error to prevent undefined errors
      if (pageNum === 1) {
        setBlogs([]);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchFavoriteBlogs(nextPage);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getReadTime = (content) => {
    const wordsPerMinute = 200;
    const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  };

  if (loading && (!blogs || blogs.length === 0)) {
    return (
      <div className="rounded-2xl p-8 backdrop-blur text-center"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading your favorite blogs...</p>
      </div>
    );
  }

  if (!blogs || blogs.length === 0) {
    return (
      <div className="rounded-2xl p-8 backdrop-blur text-center"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
          style={{ backgroundColor: 'var(--surface-hover)' }}
        >
          <BookOpen className="h-8 w-8" style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No favorite blogs yet
        </h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Start exploring our blog posts and favorite the ones you love!
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Favorite Blogs ({(blogs || []).length})
        </h3>
      </div>

      <div className="space-y-6">
        {(blogs || []).map((blog) => (
          <div
            key={blog._id}
            className="rounded-2xl p-6 backdrop-blur hover:shadow-lg transition-all duration-200"
            style={{
              backgroundColor: 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}
          >
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Blog Image */}
              {blog.featuredImage && (
                <div className="lg:w-64 lg:flex-shrink-0">
                  <Link to={`/blog/${blog.slug}`}>
                    <OptimizedImage
                      src={blog.featuredImage}
                      alt={blog.title}
                      className="w-full h-48 lg:h-40 object-cover rounded-xl hover:scale-105 transition-transform duration-200"
                    />
                  </Link>
                </div>
              )}

              {/* Blog Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <Link to={`/blog/${blog.slug}`}>
                      <h4 className="text-xl font-semibold mb-2 hover:text-purple-500 transition-colors line-clamp-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {blog.title}
                      </h4>
                    </Link>
                    <p className="text-sm mb-3 line-clamp-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {blog.excerpt}
                    </p>
                  </div>
                  
                  {/* Favorite indicator */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                  >
                    <Heart className="h-3 w-3 text-red-500 fill-current" />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Favorited
                    </span>
                  </div>
                </div>

                {/* Blog Meta */}
                <div className="flex flex-wrap items-center gap-4 text-sm"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(blog.publishedAt)}</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{getReadTime(blog.content)} min read</span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <span>{blog.views || 0} views</span>
                  </div>
                  
                  {blog.category && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {blog.category}
                    </span>
                  )}
                </div>

                {/* Tags */}
                {blog.tags && blog.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {blog.tags.slice(0, 3).map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ 
                          backgroundColor: 'var(--surface-hover)',
                          color: 'var(--text-tertiary)'
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                    {blog.tags.length > 3 && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ 
                          backgroundColor: 'var(--surface-hover)',
                          color: 'var(--text-tertiary)'
                        }}
                      >
                        +{blog.tags.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="text-center mt-8">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-6 py-3 rounded-xl font-semibold transition hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'white'
            }}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default FavoriteBlogs;
