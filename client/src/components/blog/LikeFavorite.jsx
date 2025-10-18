import React, { useState, useEffect } from 'react';
import { Heart, Bookmark } from '@components/icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import blogService from '../../services/blogService';

const LikeFavorite = ({ post, onUpdate, isPublic = false }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isLiked, setIsLiked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (post) {
      if (user) {
        const userId = user._id || user.id;
        setIsLiked(post.likes?.includes(userId) || false);
        setIsFavorited(post.favorites?.includes(userId) || false);
      }
      setLikesCount(post.likes?.length || 0);
      setFavoritesCount(post.favorites?.length || 0);
    }
  }, [post, user]);

  const handleLike = async () => {
    if (!user) {
      showToast('Please login to like posts', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await blogService.toggleLike(post._id);
      setIsLiked(result.isLiked);
      setLikesCount(result.likesCount);
      
      if (onUpdate) {
        const userId = user._id || user.id;
        onUpdate({
          ...post,
          likes: result.isLiked 
            ? [...(post.likes || []), userId]
            : (post.likes || []).filter(id => id !== userId)
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      showToast('Failed to update like', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!user) {
      showToast('Please login to favorite posts', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await blogService.toggleFavorite(post._id);
      setIsFavorited(result.isFavorited);
      setFavoritesCount(result.favoritesCount);
      
      if (onUpdate) {
        const userId = user._id || user.id;
        onUpdate({
          ...post,
          favorites: result.isFavorited 
            ? [...(post.favorites || []), userId]
            : (post.favorites || []).filter(id => id !== userId)
        });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showToast('Failed to update favorite', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!user && !isPublic) {
    return null; // Don't show like/favorite buttons for non-logged-in users in private mode
  }

  return (
    <div className="flex items-center gap-4 mb-6">
      {/* Like Button */}
      <button
        onClick={handleLike}
        disabled={loading || (isPublic && !user)}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: isLiked ? 'var(--error-red)' : 'var(--surface)',
          color: isLiked ? 'white' : 'var(--text-primary)',
          border: '1px solid',
          borderColor: isLiked ? 'var(--error-red)' : 'var(--border)',
          opacity: (isPublic && !user) ? 0.6 : 1
        }}
        title={isPublic && !user ? 'Login to like posts' : ''}
      >
        <Heart 
          size={18} 
          className={isLiked ? 'fill-current' : ''}
        />
        <span>{likesCount}</span>
        <span className="hidden sm:inline">
          {likesCount === 1 ? 'Like' : 'Likes'}
        </span>
      </button>

      {/* Favorite Button */}
      <button
        onClick={handleFavorite}
        disabled={loading || (isPublic && !user)}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: isFavorited ? 'var(--accent-blue)' : 'var(--surface)',
          color: isFavorited ? 'white' : 'var(--text-primary)',
          border: '1px solid',
          borderColor: isFavorited ? 'var(--accent-blue)' : 'var(--border)',
          opacity: (isPublic && !user) ? 0.6 : 1
        }}
        title={isPublic && !user ? 'Login to favorite posts' : ''}
      >
        <Bookmark 
          size={18} 
          className={isFavorited ? 'fill-current' : ''}
        />
        <span>{favoritesCount}</span>
        <span className="hidden sm:inline">
          {favoritesCount === 1 ? 'Favorite' : 'Favorites'}
        </span>
      </button>
    </div>
  );
};

export default LikeFavorite;
