import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Heart, Calendar, Clock, User } from '@components/icons';
import blogService from '../../services/blogService';
import { useToast } from '../../context/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../context/AuthContext';
import cacheService from '../../services/cacheService';

const FavoriteBlogs = ({ onCountChange }) => {
  const { showToast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { subscribe, unsubscribe, subscribeToBlogs } = useWebSocket();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchFavoriteBlogs();
  }, []);

  // Setup WebSocket real-time sync for blog favorites
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    subscribeToBlogs();

    const handleBlogFavorited = (data) => {
      console.log('[Real-Time] Blog favorited:', data);
      cacheService.clearByType('blogPosts');
      fetchFavoriteBlogs(1);
    };

    const handleBlogUnfavorited = (data) => {
      console.log('[Real-Time] Blog unfavorited:', data);
      cacheService.clearByType('blogPosts');
      setBlogs(prevBlogs => prevBlogs.filter(blog => blog._id !== data.blogId));
    };

    subscribe('blogFavorited', handleBlogFavorited);
    subscribe('blogUnfavorited', handleBlogUnfavorited);

    return () => {
      unsubscribe('blogFavorited', handleBlogFavorited);
      unsubscribe('blogUnfavorited', handleBlogUnfavorited);
    };
  }, [user, isAuthenticated, subscribe, unsubscribe, subscribeToBlogs, onCountChange]);

  const fetchFavoriteBlogs = async (pageNum = 1) => {
    try {
      setLoading(true);
      const result = await blogService.getFavoritedPosts({
        page: pageNum,
        limit: 10
      });

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
      if (pageNum === 1) {
        setBlogs([]);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // Notify parent of count changes
  useEffect(() => {
    if (onCountChange) {
      onCountChange(blogs.length);
    }
  }, [blogs.length, onCountChange]);

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

  // Listen for visibility changes and refresh
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        fetchFavoriteBlogs(1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated]);

  const handleRemoveFavorite = async (blogId) => {
    try {
      await blogService.toggleFavorite(blogId);
      setBlogs(prevBlogs => prevBlogs.filter(blog => blog._id !== blogId));
      showToast('Removed from favorites', 'success');
    } catch (error) {
      console.error('Error removing favorite blog:', error);
      showToast('Failed to remove from favorites', 'error');
    }
  };

  if (loading && (!blogs || blogs.length === 0)) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--accent-green)' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading your favorite blogs...</p>
      </div>
    );
  }

  if (!blogs || blogs.length === 0) {
    return (
      <div className="text-center py-12">
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
    <div className="space-y-6">
      {(blogs || []).map((blog) => (
        <div
          key={blog._id}
          className="group rounded-2xl overflow-hidden backdrop-blur hover:shadow-lg transition-all duration-200"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <div className="flex flex-col lg:flex-row gap-5">
            {/* Blog Image */}
            {blog.featuredImage && (
              <div className="relative lg:w-56 lg:flex-shrink-0 h-48 lg:h-auto overflow-hidden">
                <Link href={`/blog/${blog.slug}`}>
                  <Image
                    src={blog.featuredImage}
                    alt={blog.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 224px"
                    className="object-cover rounded-t-2xl lg:rounded-t-none lg:rounded-l-2xl group-hover:scale-105 transition-transform duration-300"
                  />
                </Link>
              </div>
            )}

            {/* Blog Content */}
            <div className="flex-1 min-w-0 p-5 lg:py-5 lg:pr-5 lg:pl-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  {blog.category && (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-2"
                      style={{
                        backgroundColor: 'var(--surface-hover)',
                        color: 'var(--text-tertiary)'
                      }}
                    >
                      {blog.category}
                    </span>
                  )}
                  <Link href={`/blog/${blog.slug}`}>
                    <h4 className="text-lg font-semibold mb-1 group-hover:text-forest-500 transition-colors line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {blog.title}
                    </h4>
                  </Link>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveFavorite(blog._id)}
                  className="flex-shrink-0 p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition-all duration-200 hover:scale-105"
                  title="Remove from favorites"
                >
                  <Heart className="h-4 w-4 fill-current" />
                </button>
              </div>

              {/* Excerpt */}
              {(blog.excerpt || blog.description) && (
                <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {blog.excerpt || blog.description}
                </p>
              )}

              {/* Footer metadata */}
              <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {(blog.publishedAt || blog.createdAt) && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(blog.publishedAt || blog.createdAt)}
                  </span>
                )}
                {blog.readTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {blog.readTime}
                  </span>
                )}
                {blog.author?.name && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {blog.author.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

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
