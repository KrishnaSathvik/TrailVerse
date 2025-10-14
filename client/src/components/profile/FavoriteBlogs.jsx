import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Heart, X } from '@components/icons';
import blogService from '../../services/blogService';
import { useToast } from '../../context/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../context/AuthContext';
import cacheService from '../../services/cacheService';
import OptimizedImage from '../common/OptimizedImage';

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

    // Subscribe to blogs channel
    subscribeToBlogs();

    // Handle blog favorited from another tab/device
    const handleBlogFavorited = (data) => {
      console.log('[Real-Time] Blog favorited:', data);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for blog favorites');
      cacheService.clearByType('blogPosts');
      
      // Refetch to get updated list
      fetchFavoriteBlogs(1);
    };

    // Handle blog unfavorited from another tab/device
    const handleBlogUnfavorited = (data) => {
      console.log('[Real-Time] Blog unfavorited:', data);
      
      // Invalidate EnhancedApi cache
      console.log('[Real-Time] 🔥 Invalidating EnhancedApi cache for blog favorites');
      cacheService.clearByType('blogPosts');
      
      // Remove from local state if present (count will update via useEffect)
      setBlogs(prevBlogs => prevBlogs.filter(blog => blog._id !== data.blogId));
    };

    // Subscribe to WebSocket events
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
      console.log('[FavoriteBlogs] 📥 Fetching favorite blogs, page:', pageNum);
      
      const result = await blogService.getFavoritedPosts({ 
        page: pageNum, 
        limit: 10 
      });
      
      // Ensure result.data is an array
      const blogsData = result?.data || [];
      console.log('[FavoriteBlogs] 📥 Received', blogsData.length, 'blog(s)');
      
      if (pageNum === 1) {
        setBlogs(blogsData);
        // Don't call onCountChange here - will cause render warning
      } else {
        setBlogs(prev => [...prev, ...blogsData]);
        // Don't call onCountChange here - will cause render warning
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

  // Notify parent of count changes (in useEffect to avoid render warnings)
  useEffect(() => {
    if (onCountChange) {
      console.log('[FavoriteBlogs] 🔄 Notifying parent of count:', blogs.length);
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
        console.log('[FavoriteBlogs] 🔄 Page became visible, refreshing...');
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
      // Remove from local state (count will update via useEffect)
      setBlogs(prevBlogs => prevBlogs.filter(blog => blog._id !== blogId));
      console.log('[FavoriteBlogs] 🔄 Removed blog from state');
      showToast('Removed from favorites', 'success');
    } catch (error) {
      console.error('Error removing favorite blog:', error);
      showToast('Failed to remove from favorites', 'error');
    }
  };

  if (loading && (!blogs || blogs.length === 0)) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
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
                  </div>
                  
                  {/* Remove button - Red filled heart */}
                  <button
                    onClick={() => handleRemoveFavorite(blog._id)}
                    className="p-2 rounded-full bg-red-500/90 hover:bg-red-600 text-white transition-all duration-200 hover:scale-105"
                    title="Remove from favorites"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                  </button>
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
